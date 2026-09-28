import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

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
    if practice is None:
        raise HTTPException(status_code=404, detail="Practice not found")
    return practice


def _has_completed_before(db: Session, student_id: uuid.UUID, practice_id: int) -> bool:
    return (
        db.query(PracticeAttempt)
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
                "xp": XP_BY_TYPE[item.type],
            }
            for item in practice.items
        ],
    }


@router.post("/{lesson_id}/practice/submit", response_model=PracticeResultOut)
def submit_practice(
    lesson_id: str,
    body: PracticeSubmitIn,
    current_user: dict = Depends(require_student),
    db: Session = Depends(get_db),
):
    practice = _get_practice_or_404(db, lesson_id)
    student_id = uuid.UUID(current_user["id"])

    items_by_id = {item.id: item for item in practice.items}
    submitted_ids = {answer.item_id for answer in body.answers}

    if not submitted_ids or not submitted_ids.issubset(items_by_id.keys()):
        raise HTTPException(status_code=422, detail="Invalid or missing item ids")

    score = 0
    xp_possible = Decimal("0")
    xp_if_correct = Decimal("0")

    for answer in body.answers:
        item = items_by_id[answer.item_id]
        item_xp = XP_BY_TYPE[item.type]
        xp_possible += item_xp

        if item.type == "choose":
            is_correct = answer.selected_index is not None and answer.selected_index == item.correct_index
        else:
            is_correct = _normalize(answer.text_answer) == _normalize(item.answer)

        if is_correct:
            score += 1
            xp_if_correct += item_xp

    is_first_completion = not _has_completed_before(db, student_id, practice.id)
    xp_earned = xp_if_correct if is_first_completion else Decimal("0")

    db.add(
        PracticeAttempt(
            student_id=student_id,
            practice_id=practice.id,
            score=score,
            total_items=len(body.answers),
            xp_earned=xp_earned,
            is_first_completion=is_first_completion,
        )
    )

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
    db.commit()

    return {
        "score": score,
        "total_items": len(body.answers),
        "xp_earned": xp_earned,
        "xp_possible": xp_possible,
        "is_first_completion": is_first_completion,
    }
