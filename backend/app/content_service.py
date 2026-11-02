"""The database writes for teacher-managed content.

Every public function checks access first, validates, then writes inside one
transaction: it either all happens or none of it does.
"""
import logging
import uuid
from contextlib import contextmanager

from fastapi import HTTPException
from sqlalchemy import case, delete, func, select, text, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app import content_access, studio_sync
from app.content_rules import (
    MAX_PRACTICE_ITEMS,
    MAX_QUIZ_QUESTIONS,
    MAX_TITLE_LEN,
    clean_practice_item,
    clean_quiz_question,
    clean_text,
    clean_title,
)
from app.models import Practice, PracticeItem, Quiz, QuizQuestion

log = logging.getLogger("ea.teacher_content")

QUIZ_HAS_ATTEMPTS = text("select 1 from quiz_attempts where quiz_id = :id limit 1")


@contextmanager
def transaction(db: Session):
    """Commit when the block finishes, roll everything back if it fails."""
    try:
        yield
        db.commit()
    except BaseException:
        db.rollback()
        raise


def _log(teacher_id: uuid.UUID, action: str, resource) -> None:
    # Never the question text, only who did what to which row.
    log.info("teacher=%s action=%s resource=%s", teacher_id, action, resource)


# ---- quiz ------------------------------------------------------------------


def _question_out(q: QuizQuestion) -> dict:
    return {
        "id": q.id,
        "question": q.question,
        "options": q.options,
        "correct_index": q.correct_index,
        "explanation": q.explanation,
        "sort_order": q.sort_order,
    }


def _quiz_out(db: Session, lesson_id: str) -> dict:
    quiz = db.execute(select(Quiz).where(Quiz.lesson_id == lesson_id)).scalar_one_or_none()
    questions = []
    if quiz is not None:
        rows = db.execute(
            select(QuizQuestion)
            .where(QuizQuestion.quiz_id == quiz.id)
            .order_by(QuizQuestion.sort_order, QuizQuestion.id)
        ).scalars()
        questions = [_question_out(q) for q in rows]
    return {
        "lesson_id": lesson_id,
        "quiz_id": quiz.id if quiz else None,
        "max_questions": MAX_QUIZ_QUESTIONS,
        "questions": questions,
    }


def _lock_quiz(db: Session, lesson_id: str) -> Quiz:
    """Get the lesson's quiz (creating it if needed) and lock its row.

    The insert ignores a clash, so two requests at once cannot both create
    one. The lock makes the count-then-insert below safe against a second
    request: it waits here until the first one has committed.
    """
    db.execute(
        pg_insert(Quiz).values(lesson_id=lesson_id).on_conflict_do_nothing(
            index_elements=["lesson_id"]
        )
    )
    quiz = db.execute(
        select(Quiz).where(Quiz.lesson_id == lesson_id).with_for_update()
    ).scalar_one()
    studio_sync.ensure_quiz_activity(db, quiz)  # a quiz made here shows up as an activity
    return quiz


def get_quiz(db: Session, teacher_id: uuid.UUID, lesson_id: str) -> dict:
    content_access.get_lesson(db, teacher_id, lesson_id)
    return _quiz_out(db, lesson_id)


def add_questions(
    db: Session, teacher_id: uuid.UUID, lesson_id: str, questions: list[dict]
) -> list[dict]:
    """Add one or many questions in a single transaction."""
    content_access.get_lesson(db, teacher_id, lesson_id)
    if not questions:
        raise HTTPException(status_code=422, detail="There are no questions to save")

    # Validate everything before touching the database.
    cleaned = [
        clean_quiz_question(
            q["question"], q["options"], q["correct_index"], q.get("explanation")
        )
        for q in questions
    ]

    with transaction(db):
        quiz = _lock_quiz(db, lesson_id)
        quiz_id = quiz.id
        current, highest = db.execute(
            select(func.count(QuizQuestion.id), func.coalesce(func.max(QuizQuestion.sort_order), -1))
            .where(QuizQuestion.quiz_id == quiz.id)
        ).one()
        if current + len(cleaned) > MAX_QUIZ_QUESTIONS:
            raise HTTPException(
                status_code=422,
                detail=f"A quiz can have at most {MAX_QUIZ_QUESTIONS} questions (it has {current})",
            )

        created = []
        for offset, values in enumerate(cleaned, start=1):
            row = QuizQuestion(quiz_id=quiz.id, sort_order=highest + offset, **values)
            db.add(row)
            created.append(row)
        db.flush()
        result = [_question_out(row) for row in created]

    _log(teacher_id, "quiz_questions_added", f"quiz={quiz_id} count={len(result)}")
    return result


def update_question(
    db: Session, teacher_id: uuid.UUID, question_id: int, values: dict
) -> dict:
    content_access.get_quiz_question(db, teacher_id, question_id)
    cleaned = clean_quiz_question(
        values["question"], values["options"], values["correct_index"], values.get("explanation")
    )

    with transaction(db):
        # Same row, same id: a student who has the quiz open can still submit.
        row = db.execute(
            select(QuizQuestion).where(QuizQuestion.id == question_id).with_for_update()
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Question not found")
        for field, value in cleaned.items():
            setattr(row, field, value)
        db.flush()
        result = _question_out(row)

    _log(teacher_id, "quiz_question_updated", question_id)
    return result


def delete_question(db: Session, teacher_id: uuid.UUID, question_id: int) -> None:
    found = content_access.get_quiz_question(db, teacher_id, question_id)

    with transaction(db):
        quiz = db.execute(
            select(Quiz).where(Quiz.id == found.quiz_id).with_for_update()
        ).scalar_one_or_none()
        if quiz is None:
            raise HTTPException(status_code=404, detail="Question not found")

        remaining = db.execute(
            select(func.count(QuizQuestion.id)).where(QuizQuestion.quiz_id == quiz.id)
        ).scalar_one()

        if remaining <= 1:
            # Deleting a quiz row also deletes every student's attempts at it,
            # so an emptied quiz is only removed when nobody has tried it.
            if db.execute(QUIZ_HAS_ATTEMPTS, {"id": quiz.id}).first() is not None:
                raise HTTPException(
                    status_code=409,
                    detail="This quiz has student attempts and cannot be left empty. Edit the question instead.",
                )
            studio_sync.drop_quiz_activity(db, quiz.id)
            db.execute(delete(Quiz).where(Quiz.id == quiz.id))
        else:
            db.execute(delete(QuizQuestion).where(QuizQuestion.id == question_id))

    _log(teacher_id, "quiz_question_deleted", question_id)


def reorder_questions(
    db: Session, teacher_id: uuid.UUID, lesson_id: str, question_ids: list[int]
) -> dict:
    content_access.get_lesson(db, teacher_id, lesson_id)

    with transaction(db):
        quiz = db.execute(
            select(Quiz).where(Quiz.lesson_id == lesson_id).with_for_update()
        ).scalar_one_or_none()
        if quiz is None:
            raise HTTPException(status_code=422, detail="This lesson has no quiz yet")

        current = set(
            db.execute(
                select(QuizQuestion.id).where(QuizQuestion.quiz_id == quiz.id)
            ).scalars()
        )
        if len(question_ids) != len(set(question_ids)) or set(question_ids) != current:
            raise HTTPException(
                status_code=422,
                detail="The order must list every question of the quiz exactly once",
            )

        # One statement for the whole list, not one per question.
        positions = case(
            {question_id: position for position, question_id in enumerate(question_ids)},
            value=QuizQuestion.id,
        )
        db.execute(
            update(QuizQuestion)
            .where(QuizQuestion.id.in_(question_ids))
            .values(sort_order=positions)
        )
        quiz_id = quiz.id

    _log(teacher_id, "quiz_reordered", f"quiz={quiz_id}")
    return _quiz_out(db, lesson_id)


# ---- practice --------------------------------------------------------------

PRACTICE_HAS_ATTEMPTS = text("select 1 from practice_attempts where practice_id = :id limit 1")


def _item_out(item: PracticeItem) -> dict:
    return {
        "id": item.id,
        "type": item.type,
        "question": item.question,
        "sentence": item.sentence,
        "options": item.options,
        "correct_index": item.correct_index,
        "answer": item.answer,
        "explanation": item.explanation,
        "sort_order": item.sort_order,
    }


def _practice_out(db: Session, lesson_id: str) -> dict:
    practice = db.execute(
        select(Practice).where(Practice.lesson_id == lesson_id)
    ).scalar_one_or_none()
    items = []
    if practice is not None:
        rows = db.execute(
            select(PracticeItem)
            .where(PracticeItem.practice_id == practice.id)
            .order_by(PracticeItem.sort_order, PracticeItem.id)
        ).scalars()
        items = [_item_out(item) for item in rows]
    return {
        "lesson_id": lesson_id,
        "practice_id": practice.id if practice else None,
        "title": practice.title if practice else None,
        "max_items": MAX_PRACTICE_ITEMS,
        "items": items,
    }


def _lock_practice(db: Session, lesson_id: str, title: str) -> Practice:
    """Same idea as _lock_quiz. The title only matters when it is created."""
    db.execute(
        pg_insert(Practice)
        .values(lesson_id=lesson_id, title=title)
        .on_conflict_do_nothing(index_elements=["lesson_id"])
    )
    practice = db.execute(
        select(Practice).where(Practice.lesson_id == lesson_id).with_for_update()
    ).scalar_one()
    studio_sync.ensure_practice_activity(db, practice)
    return practice


def get_practice(db: Session, teacher_id: uuid.UUID, lesson_id: str) -> dict:
    content_access.get_lesson(db, teacher_id, lesson_id)
    return _practice_out(db, lesson_id)


def _clean_item(values: dict) -> dict:
    return clean_practice_item(
        values.get("type"),
        values.get("question"),
        values.get("sentence"),
        values.get("options"),
        values.get("correct_index"),
        values.get("answer"),
        values.get("explanation"),
    )


def add_items(
    db: Session,
    teacher_id: uuid.UUID,
    lesson_id: str,
    items: list[dict],
    practice_title=None,
) -> list[dict]:
    lesson = content_access.get_lesson(db, teacher_id, lesson_id)
    if not items:
        raise HTTPException(status_code=422, detail="There are no items to save")

    cleaned = [_clean_item(item) for item in items]
    title = clean_text(practice_title, "Practice title", MAX_TITLE_LEN, required=False)
    title = title or f"{lesson.title} practice"[:MAX_TITLE_LEN]

    with transaction(db):
        practice = _lock_practice(db, lesson_id, title)
        practice_id = practice.id
        current, highest = db.execute(
            select(func.count(PracticeItem.id), func.coalesce(func.max(PracticeItem.sort_order), -1))
            .where(PracticeItem.practice_id == practice_id)
        ).one()
        if current + len(cleaned) > MAX_PRACTICE_ITEMS:
            raise HTTPException(
                status_code=422,
                detail=f"A practice can have at most {MAX_PRACTICE_ITEMS} items (it has {current})",
            )

        created = []
        for offset, values in enumerate(cleaned, start=1):
            row = PracticeItem(practice_id=practice_id, sort_order=highest + offset, **values)
            db.add(row)
            created.append(row)
        db.flush()
        result = [_item_out(row) for row in created]

    _log(teacher_id, "practice_items_added", f"practice={practice_id} count={len(result)}")
    return result


def update_item(db: Session, teacher_id: uuid.UUID, item_id: int, values: dict) -> dict:
    content_access.get_practice_item(db, teacher_id, item_id)
    cleaned = _clean_item(values)

    with transaction(db):
        row = db.execute(
            select(PracticeItem).where(PracticeItem.id == item_id).with_for_update()
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Item not found")
        for field, value in cleaned.items():
            setattr(row, field, value)
        db.flush()
        result = _item_out(row)

    _log(teacher_id, "practice_item_updated", item_id)
    return result


def delete_item(db: Session, teacher_id: uuid.UUID, item_id: int) -> None:
    found = content_access.get_practice_item(db, teacher_id, item_id)

    with transaction(db):
        practice = db.execute(
            select(Practice).where(Practice.id == found.practice_id).with_for_update()
        ).scalar_one_or_none()
        if practice is None:
            raise HTTPException(status_code=404, detail="Item not found")

        remaining = db.execute(
            select(func.count(PracticeItem.id)).where(PracticeItem.practice_id == practice.id)
        ).scalar_one()

        if remaining <= 1:
            # Deleting the practice row also deletes every student's attempts.
            if db.execute(PRACTICE_HAS_ATTEMPTS, {"id": practice.id}).first() is not None:
                raise HTTPException(
                    status_code=409,
                    detail="This practice has student attempts and cannot be left empty. Edit the item instead.",
                )
            studio_sync.drop_practice_activity(db, practice.id)
            db.execute(delete(Practice).where(Practice.id == practice.id))
        else:
            db.execute(delete(PracticeItem).where(PracticeItem.id == item_id))

    _log(teacher_id, "practice_item_deleted", item_id)


def reorder_items(
    db: Session, teacher_id: uuid.UUID, lesson_id: str, item_ids: list[int]
) -> dict:
    content_access.get_lesson(db, teacher_id, lesson_id)

    with transaction(db):
        practice = db.execute(
            select(Practice).where(Practice.lesson_id == lesson_id).with_for_update()
        ).scalar_one_or_none()
        if practice is None:
            raise HTTPException(status_code=422, detail="This lesson has no practice yet")

        current = set(
            db.execute(
                select(PracticeItem.id).where(PracticeItem.practice_id == practice.id)
            ).scalars()
        )
        if len(item_ids) != len(set(item_ids)) or set(item_ids) != current:
            raise HTTPException(
                status_code=422,
                detail="The order must list every item of the practice exactly once",
            )

        positions = case(
            {item_id: position for position, item_id in enumerate(item_ids)},
            value=PracticeItem.id,
        )
        db.execute(
            update(PracticeItem)
            .where(PracticeItem.id.in_(item_ids))
            .values(sort_order=positions)
        )
        practice_id = practice.id

    _log(teacher_id, "practice_reordered", f"practice={practice_id}")
    return _practice_out(db, lesson_id)


def set_practice_title(
    db: Session, teacher_id: uuid.UUID, lesson_id: str, title
) -> dict:
    content_access.get_lesson(db, teacher_id, lesson_id)
    cleaned = clean_title(title)

    with transaction(db):
        practice = db.execute(
            select(Practice).where(Practice.lesson_id == lesson_id).with_for_update()
        ).scalar_one_or_none()
        if practice is None:
            raise HTTPException(status_code=404, detail="Practice not found")
        practice.title = cleaned
        practice_id = practice.id

    _log(teacher_id, "practice_title_updated", practice_id)
    return _practice_out(db, lesson_id)
