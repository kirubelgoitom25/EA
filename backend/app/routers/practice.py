import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app import studio_sync, submissions
from app.access import lesson_is_in_class
from app.database import get_db
from app.deps import require_student
from app.models import LessonProgress, Practice, PracticeAttempt
from app.schemas import PracticeOut, PracticeResultOut, PracticeSubmitIn
from app.xp import award_xp

router = APIRouter(prefix="/lessons", tags=["practice"])

XP_BY_TYPE = {"choose": Decimal("5"), "fill": Decimal("10")}


def _normalize(value) -> str:
    return (value or "").strip().lower()


def _get_practice_or_404(db: Session, lesson_id: str) -> Practice:
    practice = (
        db.query(Practice)
        .options(selectinload(Practice.items))
        .filter(Practice.lesson_id == lesson_id)
        .first()
    )
    if practice is None or not practice.items or studio_sync.is_archived(db, practice_id=practice.id):
        raise HTTPException(status_code=404, detail="Practice not found")
    return practice


def _has_completed_before(db: Session, student_id: uuid.UUID, practice_id: int) -> bool:
    return (
        db.query(PracticeAttempt.id)
        .filter(
            PracticeAttempt.student_id == student_id,
            PracticeAttempt.practice_id == practice_id,
        )
        .first()
        is not None
    )


@router.get("/{lesson_id}/practice", response_model=PracticeOut)
def get_practice(
    lesson_id: str,
    current_user: dict = Depends(require_student),
    db: Session = Depends(get_db),
):
    # Only lessons of the student's own class are allowed.
    if not lesson_is_in_class(
        db, lesson_id, current_user.get("class_id"), uuid.UUID(current_user["id"])
    ):
        raise HTTPException(status_code=404, detail="Practice not found")

    practice = _get_practice_or_404(db, lesson_id)
    student_id = uuid.UUID(current_user["id"])

    return {
        "lesson_id": lesson_id,
        "title": practice.title,
        "already_completed": _has_completed_before(db, student_id, practice.id),
        "items": [
            {
                "id": item.id,
                "type": item.type,
                "question": item.question,
                "sentence": item.sentence,
                "options": item.options,
                "correct_index": item.correct_index,
                "explanation": item.explanation,
                "xp": XP_BY_TYPE[item.type],
            }
            for item in practice.items
        ],
    }


# An older app sends no submission id; see quiz.DOUBLE_TAP_SECONDS.
DOUBLE_TAP_SECONDS = 30


def _xp_possible(practice: Practice) -> Decimal:
    return sum((XP_BY_TYPE[item.type] for item in practice.items), Decimal("0"))


def _practice_result(attempt: PracticeAttempt, practice: Practice) -> dict:
    return {
        "score": attempt.score,
        "total_items": attempt.total_items,
        # Stored as numeric(6,2); practice XP is whole (5 or 10 an item), sent as a fresh
        # submit sends it, so a retry answers exactly like the first try.
        "xp_earned": Decimal(attempt.xp_earned).quantize(Decimal("1")),
        "xp_possible": _xp_possible(practice),
        "is_first_completion": attempt.is_first_completion,
    }


def _earlier_attempt(db: Session, student_id: uuid.UUID, practice_id: int, submission_id) -> Optional[PracticeAttempt]:
    query = db.query(PracticeAttempt).filter(
        PracticeAttempt.student_id == student_id, PracticeAttempt.practice_id == practice_id
    )
    if submission_id is not None:
        found = submissions.find(db, "practice", student_id, practice_id, submission_id)
        return db.get(PracticeAttempt, found) if found is not None else None
    since = datetime.now(timezone.utc) - timedelta(seconds=DOUBLE_TAP_SECONDS)
    return (
        query.filter(PracticeAttempt.created_at >= since)
        .order_by(PracticeAttempt.created_at.desc(), PracticeAttempt.id.desc())
        .first()
    )


def _record_attempt(db, student_id, lesson_id, practice, score, xp_if_correct, submission_id) -> dict:
    is_first_completion = not _has_completed_before(db, student_id, practice.id)
    xp_earned = xp_if_correct if is_first_completion else Decimal("0")

    attempt = PracticeAttempt(
        student_id=student_id,
        practice_id=practice.id,
        score=score,
        total_items=len(practice.items),
        xp_earned=xp_earned,
        is_first_completion=is_first_completion,
    )
    db.add(attempt)
    if submission_id is not None:
        db.flush()
        submissions.tag(db, "practice", attempt.id, submission_id)

    already_has_progress = (
        db.query(LessonProgress)
        .filter(
            LessonProgress.student_id == student_id,
            LessonProgress.lesson_id == lesson_id,
        )
        .first()
        is not None
    )
    if not already_has_progress:
        db.add(LessonProgress(student_id=student_id, lesson_id=lesson_id))

    award_xp(db, student_id, xp_earned, "practice", practice.id)
    studio_sync.record_attempt_progress(db, student_id, lesson_id, "practice")
    db.commit()

    return {
        "score": score,
        "total_items": len(practice.items),
        "xp_earned": xp_earned,
        "xp_possible": _xp_possible(practice),
        "is_first_completion": is_first_completion,
    }


@router.post("/{lesson_id}/practice/submit", response_model=PracticeResultOut)
def submit_practice(
    lesson_id: str,
    body: PracticeSubmitIn,
    current_user: dict = Depends(require_student),
    db: Session = Depends(get_db),
):
    if not lesson_is_in_class(
        db, lesson_id, current_user.get("class_id"), uuid.UUID(current_user["id"])
    ):
        raise HTTPException(status_code=404, detail="Practice not found")

    practice = _get_practice_or_404(db, lesson_id)
    student_id = uuid.UUID(current_user["id"])

    items_by_id = {item.id: item for item in practice.items}
    submitted_ids = {answer.item_id for answer in body.answers}

    if len(submitted_ids) != len(body.answers):
        raise HTTPException(status_code=422, detail="Duplicate item ids")

    if not submitted_ids or not submitted_ids.issubset(items_by_id.keys()):
        raise HTTPException(status_code=422, detail="Invalid or missing item ids")

    xp_if_correct = Decimal("0")
    score = 0

    for answer in body.answers:
        item = items_by_id[answer.item_id]

        if item.type == "choose":
            is_correct = (
                answer.selected_index is not None
                and answer.selected_index == item.correct_index
            )
        else:
            is_correct = _normalize(answer.text_answer) == _normalize(item.answer)

        if is_correct:
            score += 1
            xp_if_correct += XP_BY_TYPE[item.type]

    if body.submission_id is not None:
        earlier = _earlier_attempt(db, student_id, practice.id, body.submission_id)
        if earlier is not None:
            return _practice_result(earlier, practice)

    for _ in range(2):
        try:
            return _record_attempt(
                db, student_id, lesson_id, practice, score, xp_if_correct, body.submission_id
            )
        except IntegrityError:
            db.rollback()
            earlier = _earlier_attempt(db, student_id, practice.id, body.submission_id)
            if earlier is not None:
                return _practice_result(earlier, practice)
    raise HTTPException(status_code=409, detail="This chapter is being saved already. Please try again.")
