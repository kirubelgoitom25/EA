import uuid
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import require_student
from app.models import LessonProgress, Quiz, QuizAttempt
from app.schemas import QuizOut, QuizResultOut, QuizSubmitIn
from app.xp import award_xp

router = APIRouter(prefix="/lessons", tags=["quiz"])

# Same table the app already used client-side. Attempt 1 = 10 XP per
# correct answer, attempt 2 = 5, attempt 3 = 2.5, attempt 4+ = 1.
XP_BY_ATTEMPT = [Decimal("10"), Decimal("5"), Decimal("2.5"), Decimal("1")]


def _xp_per_correct(attempt_number: int) -> Decimal:
    # Attempts 1-4 pay 10 / 5 / 2.5 / 1 XP per correct answer.
    # From attempt 5 on the quiz pays nothing, so a script can't
    # grind the leaderboard by resubmitting forever.
    if attempt_number > len(XP_BY_ATTEMPT):
        return Decimal("0")
    return XP_BY_ATTEMPT[max(attempt_number - 1, 0)]


def _get_quiz_or_404(db: Session, lesson_id: str) -> Quiz:
    quiz = (
        db.query(Quiz)
        .options(selectinload(Quiz.questions))
        .filter(Quiz.lesson_id == lesson_id)
        .first()
    )
    if quiz is None:
        raise HTTPException(status_code=404, detail="Quiz not found")
    return quiz


def _next_attempt_number(db: Session, student_id: uuid.UUID, quiz_id: int) -> int:
    count = (
        db.query(func.count(QuizAttempt.id))
        .filter(QuizAttempt.student_id == student_id, QuizAttempt.quiz_id == quiz_id)
        .scalar()
    )
    return count + 1


@router.get("/{lesson_id}/quiz", response_model=QuizOut)
def get_quiz(
    lesson_id: str,
    current_user: dict = Depends(require_student),
    db: Session = Depends(get_db),
):
    quiz = _get_quiz_or_404(db, lesson_id)
    student_id = uuid.UUID(current_user["id"])
    attempt_number = _next_attempt_number(db, student_id, quiz.id)

    return {
        "lesson_id": lesson_id,
        "attempt_number": attempt_number,
        "xp_per_correct": _xp_per_correct(attempt_number),
        "questions": [
            {"id": q.id, "question": q.question, "options": q.options}
            for q in quiz.questions
        ],
    }


@router.post("/{lesson_id}/quiz/submit", response_model=QuizResultOut)
def submit_quiz(
    lesson_id: str,
    body: QuizSubmitIn,
    current_user: dict = Depends(require_student),
    db: Session = Depends(get_db),
):
    quiz = _get_quiz_or_404(db, lesson_id)
    student_id = uuid.UUID(current_user["id"])

    correct_by_id = {q.id: q.correct_index for q in quiz.questions}
    submitted_ids = {answer.question_id for answer in body.answers}

    if len(submitted_ids) != len(body.answers):
        raise HTTPException(status_code=422, detail="Duplicate question ids")

    if not submitted_ids or not submitted_ids.issubset(correct_by_id.keys()):
        raise HTTPException(status_code=422, detail="Invalid or missing question ids")

    score = sum(
        1
        for answer in body.answers
        if correct_by_id.get(answer.question_id) == answer.selected_index
    )
    total_questions = len(quiz.questions)

    attempt_number = _next_attempt_number(db, student_id, quiz.id)
    xp_per_correct = _xp_per_correct(attempt_number)
    xp_earned = (Decimal(score) * xp_per_correct).quantize(Decimal("1"), rounding=ROUND_HALF_UP)

    db.add(
        QuizAttempt(
            student_id=student_id,
            quiz_id=quiz.id,
            attempt_number=attempt_number,
            score=score,
            total_questions=total_questions,
            xp_earned=xp_earned,
        )
    )

    already_completed = (
        db.query(LessonProgress)
        .filter(
            LessonProgress.student_id == student_id,
            LessonProgress.lesson_id == lesson_id,
        )
        .first()
        is not None
    )
    if not already_completed:
        db.add(LessonProgress(student_id=student_id, lesson_id=lesson_id))

    award_xp(db, student_id, xp_earned, "quiz", quiz.id)
    db.commit()

    return {
        "attempt_number": attempt_number,
        "score": score,
        "total_questions": total_questions,
        "xp_earned": xp_earned,
        "xp_per_correct": xp_per_correct,
        "next_xp_per_correct": _xp_per_correct(attempt_number + 1),
        "all_correct": score == total_questions,
    }
