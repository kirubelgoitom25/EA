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

from app import content_access
from app.content_rules import MAX_QUIZ_QUESTIONS, clean_quiz_question
from app.models import Quiz, QuizQuestion

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
    return db.execute(
        select(Quiz).where(Quiz.lesson_id == lesson_id).with_for_update()
    ).scalar_one()


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
