"""Keeps the activity layer in step with the legacy tables.

Low level on purpose (models only), so content_service, the quiz and practice
routes and studio_service can all use it without importing each other.

lessons.video_url is the legacy copy of a lesson's video. Video activities are
canonical: it always equals the URL of the lesson's first active video
activity, or NULL when there is none (the URL then lives on in the archived
activity). The migration also installs database triggers as a safety net.
"""
import uuid
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    ActivityProgress,
    Lesson,
    LessonActivity,
    LessonProgress,
    Practice,
    Quiz,
)


def next_sort_order(db: Session, lesson_id: str) -> int:
    highest = db.execute(
        select(func.max(LessonActivity.sort_order)).where(LessonActivity.lesson_id == lesson_id)
    ).scalar()
    return 0 if highest is None else highest + 1


def sync_lesson_video(db: Session, lesson_id: str) -> None:
    db.flush()
    url = db.execute(
        select(LessonActivity.video_url)
        .where(
            LessonActivity.lesson_id == lesson_id,
            LessonActivity.kind == "video",
            LessonActivity.archived_at.is_(None),
        )
        .order_by(LessonActivity.sort_order, LessonActivity.id)
        .limit(1)
    ).scalar()
    lesson = db.get(Lesson, lesson_id)
    if lesson is not None and lesson.video_url != url:
        lesson.video_url = url


def ensure_quiz_activity(db: Session, quiz: Quiz) -> None:
    """A quiz made through the legacy editor gets its activity, once."""
    exists = db.execute(
        select(LessonActivity.id).where(LessonActivity.quiz_id == quiz.id)
    ).first()
    if exists is None:
        db.add(
            LessonActivity(
                lesson_id=quiz.lesson_id,
                kind="quiz",
                title="Quiz",
                is_required=False,
                quiz_id=quiz.id,
                sort_order=next_sort_order(db, quiz.lesson_id),
            )
        )
        db.flush()


def ensure_practice_activity(db: Session, practice: Practice) -> None:
    exists = db.execute(
        select(LessonActivity.id).where(LessonActivity.practice_id == practice.id)
    ).first()
    if exists is None:
        db.add(
            LessonActivity(
                lesson_id=practice.lesson_id,
                kind="practice",
                title=practice.title,
                is_required=False,
                practice_id=practice.id,
                sort_order=next_sort_order(db, practice.lesson_id),
            )
        )
        db.flush()


def drop_quiz_activity(db: Session, quiz_id: int) -> None:
    """Called just before the legacy editor deletes an emptied quiz nobody tried."""
    db.query(LessonActivity).filter(LessonActivity.quiz_id == quiz_id).delete()


def drop_practice_activity(db: Session, practice_id: int) -> None:
    db.query(LessonActivity).filter(LessonActivity.practice_id == practice_id).delete()


def is_archived(db: Session, quiz_id: Optional[int] = None, practice_id: Optional[int] = None) -> bool:
    """True when the quiz/practice has an activity and every one of them is archived."""
    column = LessonActivity.quiz_id if quiz_id is not None else LessonActivity.practice_id
    value = quiz_id if quiz_id is not None else practice_id
    rows = db.execute(select(LessonActivity.archived_at).where(column == value)).all()
    return bool(rows) and all(r[0] is not None for r in rows)


def record_attempt_progress(db: Session, student_id: uuid.UUID, lesson_id: str, kind: str) -> None:
    """Mirror a submitted quiz/practice attempt into activity_progress. Does not commit."""
    db.flush()  # sessions here do not autoflush, so pending rows must be written to be seen
    column = LessonActivity.quiz_id if kind == "quiz" else LessonActivity.practice_id
    activity_ids = db.execute(
        select(LessonActivity.id).where(
            LessonActivity.lesson_id == lesson_id,
            LessonActivity.kind == kind,
            column.is_not(None),
        )
    ).scalars().all()
    for activity_id in activity_ids:
        done = db.execute(
            select(ActivityProgress.id).where(
                ActivityProgress.student_id == student_id,
                ActivityProgress.activity_id == activity_id,
            )
        ).first()
        if done is None:
            db.add(
                ActivityProgress(
                    student_id=student_id,
                    activity_id=activity_id,
                    source=f"{kind}_attempt",
                )
            )


def complete_lesson(db: Session, student_id: uuid.UUID, lesson_id: str) -> None:
    """Write the legacy lesson_progress row if it is not there. Does not commit."""
    done = db.execute(
        select(LessonProgress.id).where(
            LessonProgress.student_id == student_id, LessonProgress.lesson_id == lesson_id
        )
    ).first()
    if done is None:
        db.add(LessonProgress(student_id=student_id, lesson_id=lesson_id))
