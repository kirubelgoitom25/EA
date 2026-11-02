import uuid
from typing import Optional

from sqlalchemy.orm import Session

from app.studio_access import student_can_see_lesson


def lesson_is_in_class(
    db: Session,
    lesson_id: str,
    class_id: Optional[str],
    student_id: Optional[uuid.UUID] = None,
) -> bool:
    """May this student open this lesson?

    A lesson is open to a student when its course is given to their class (the
    original rule), or, for a Course Studio course, when it is published, or
    unpublished and the student already has progress in it. Drafts and archived
    lessons and modules are never open.
    """
    if student_id is None:
        # Class-only fallback for callers without a student id.
        student_id = uuid.UUID(int=0)
    return student_can_see_lesson(db, student_id, class_id, lesson_id)
