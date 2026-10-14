from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

# A lesson belongs to a module, a module to a course, and a class is given
# courses through class_courses. So a lesson is "in a class" when its course is
# assigned to that class.
LESSON_IN_CLASS_QUERY = text("""
    select 1
    from lessons l
    join modules m on m.id = l.module_id
    join class_courses cc on cc.course_id = m.course_id
    where l.id = :lesson_id and cc.class_id = :class_id
""")


def lesson_is_in_class(db: Session, lesson_id: str, class_id: Optional[str]) -> bool:
    """True only if the lesson is part of a course assigned to this class."""
    if class_id is None:
        return False
    found = db.execute(
        LESSON_IN_CLASS_QUERY, {"lesson_id": lesson_id, "class_id": class_id}
    ).first()
    return found is not None