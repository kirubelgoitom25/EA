"""Who may edit, see or open what in Course Studio.

Editing:
  * an owned course: only its owner;
  * an ownerless (legacy) course: any teacher who teaches a class that has it,
    exactly as before;
  * the main admin: every course.
Seeing, for a student (the course shows up, with its price):
  * a course given to their class (never a draft);
  * a published course that has an owner (global);
  * an unpublished owned course they already have progress in;
  * a course they hold running access to, so unpublishing never strands a payer.
Opening, for a student (the content itself):
  * a free course they can see;
  * a paid course given to their class;
  * a paid course they hold running access to.
Seeing never implies opening: old progress keeps a course visible, not open.
Everything that is not allowed answers 404, so a draft and a missing course look
the same.
"""
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import DateTime, Integer, String, and_, exists, or_, select, text
from sqlalchemy.orm import Session

from app import snapshots
from app.models import (
    ActivityProgress,
    ClassCourse,
    ClassTeacher,
    Course,
    Lesson,
    LessonActivity,
    LessonProgress,
    Module,
    Profile,
)
from app.payment_rules import ACTIVE, OPEN_STATES, access_state


def admin_clause(user_id: uuid.UUID):
    """True for the main admin. Read from the database on every check, never the client."""
    return exists(select(1).select_from(Profile).where(Profile.id == user_id, Profile.is_admin.is_(True)))


def is_admin(db: Session, user_id: uuid.UUID) -> bool:
    return bool(db.execute(select(admin_clause(user_id))).scalar())


def editable_course_clause(teacher_id: uuid.UUID):
    taught = exists(
        select(1)
        .select_from(ClassCourse)
        .join(ClassTeacher, ClassTeacher.class_id == ClassCourse.class_id)
        .where(ClassCourse.course_id == Course.id, ClassTeacher.teacher_id == teacher_id)
    )
    return or_(
        Course.owner_id == teacher_id,
        and_(Course.owner_id.is_(None), taught),
        admin_clause(teacher_id),
    )


def get_editable_course(db: Session, teacher_id: uuid.UUID, course_id: str) -> Course:
    course = db.execute(
        select(Course).where(Course.id == course_id, editable_course_clause(teacher_id))
    ).scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


def get_editable_module(db: Session, teacher_id: uuid.UUID, module_id: str) -> Module:
    module = db.execute(
        select(Module)
        .join(Course, Course.id == Module.course_id)
        .where(Module.id == module_id, editable_course_clause(teacher_id))
    ).scalar_one_or_none()
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found")
    return module


def get_editable_lesson(db: Session, teacher_id: uuid.UUID, lesson_id: str) -> Lesson:
    lesson = db.execute(
        select(Lesson)
        .join(Module, Module.id == Lesson.module_id)
        .join(Course, Course.id == Module.course_id)
        .where(Lesson.id == lesson_id, editable_course_clause(teacher_id))
    ).scalar_one_or_none()
    if lesson is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return lesson


def get_editable_activity(db: Session, teacher_id: uuid.UUID, activity_id: int) -> LessonActivity:
    activity = db.execute(
        select(LessonActivity)
        .join(Lesson, Lesson.id == LessonActivity.lesson_id)
        .join(Module, Module.id == Lesson.module_id)
        .join(Course, Course.id == Module.course_id)
        .where(LessonActivity.id == activity_id, editable_course_clause(teacher_id))
    ).scalar_one_or_none()
    if activity is None:
        raise HTTPException(status_code=404, detail="Activity not found")
    return activity


def course_of_lesson(db: Session, lesson_id: str) -> Optional[Course]:
    return db.execute(
        select(Course)
        .join(Module, Module.course_id == Course.id)
        .join(Lesson, Lesson.module_id == Module.id)
        .where(Lesson.id == lesson_id)
    ).scalar_one_or_none()


def _progressed_course_ids(db: Session, student_id: uuid.UUID, course_ids) -> set[str]:
    """Which of these courses the student has any lesson or activity progress in."""
    by_lesson = (
        select(Module.course_id)
        .join(Lesson, Lesson.module_id == Module.id)
        .join(LessonProgress, LessonProgress.lesson_id == Lesson.id)
        .where(LessonProgress.student_id == student_id, Module.course_id.in_(course_ids))
    )
    by_activity = (
        select(Module.course_id)
        .join(Lesson, Lesson.module_id == Module.id)
        .join(LessonActivity, LessonActivity.lesson_id == Lesson.id)
        .join(ActivityProgress, ActivityProgress.activity_id == LessonActivity.id)
        .where(ActivityProgress.student_id == student_id, Module.course_id.in_(course_ids))
    )
    return {r[0] for r in db.execute(by_lesson.union(by_activity)).all()}


# Everything about the student that decides what they may see and open, in one round trip:
# the courses their class has and the access rows they hold. The course list also asks for
# their waiting payment requests. The courses themselves come from the shared catalogue.
_FACTS_SQL = """
    select 'class' as kind, course_id,
           cast(null as timestamptz) as expires_at, cast(null as timestamptz) as revoked_at,
           0 as waiting
    from class_courses where class_id = :class_id
    union all
    select 'access', course_id, expires_at, revoked_at, 0
    from course_access where student_id = :student_id
"""
_WAITING_SQL = """
    union all
    select 'waiting', course_id, null, null, count(*)
    from payment_requests where student_id = :student_id and status = 'pending'
    group by course_id
"""
_FACT_COLUMNS = dict(
    kind=String, course_id=String, expires_at=DateTime(timezone=True),
    revoked_at=DateTime(timezone=True), waiting=Integer,
)
FACTS_QUERY = text(_FACTS_SQL).columns(**_FACT_COLUMNS)
FACTS_WITH_WAITING_QUERY = text(_FACTS_SQL + _WAITING_SQL).columns(**_FACT_COLUMNS)


@dataclass(frozen=True)
class CourseView:
    """One course as one student meets it. visible: it shows up (with its price). state: one
    of payment_rules' access states; only OPEN_STATES let them open the content."""

    visible: bool
    state: str
    expires_at: Optional[datetime]
    has_access_row: bool
    waiting: int = 0


def student_course_views(
    db: Session,
    student_id: uuid.UUID,
    class_id: Optional[str],
    course_ids=None,
    with_waiting: bool = False,
    catalog=None,
) -> dict[str, CourseView]:
    """{course_id: CourseView} for these courses (default: every course), following the rules
    at the top of this file. Courses that do not exist are left out. The time always comes
    from the server, never the phone."""
    catalog = catalog or snapshots.catalog.get(db)
    in_class: set[str] = set()
    held: dict[str, tuple] = {}
    waiting: dict[str, int] = {}
    query = FACTS_WITH_WAITING_QUERY if with_waiting else FACTS_QUERY
    for row in db.execute(query, {"class_id": class_id, "student_id": student_id}):
        if row.kind == "class":
            in_class.add(row.course_id)
        elif row.kind == "access":
            held[row.course_id] = (row.expires_at, row.revoked_at)
        else:
            waiting[row.course_id] = int(row.waiting)

    if course_ids is None:
        candidates = catalog.courses
    else:
        candidates = [catalog.by_id[c] for c in course_ids if c in catalog.by_id]

    # An unpublished course stays visible only to students who already have progress in it.
    maybe = [c.id for c in candidates if c.owner_id is not None and c.status == "unpublished"]
    progressed = _progressed_course_ids(db, student_id, maybe) if maybe else set()

    now = datetime.now(timezone.utc)
    views = {}
    for course in candidates:
        row = held.get(course.id)
        state = access_state(
            course.price,
            course.id in in_class,
            row[0] if row else None,
            row[1] if row else None,
            row is not None,
            now,
        )
        owned = course.owner_id is not None
        visible = (
            (course.id in in_class and course.status != "draft")
            or (owned and course.status == "published")
            or (owned and course.status == "unpublished" and course.id in progressed)
            # Running access keeps a course visible, so unpublishing never strands a payer.
            or (row is not None and state == ACTIVE)
        )
        views[course.id] = CourseView(
            visible=visible,
            state=state,
            expires_at=row[0] if row else None,
            has_access_row=row is not None,
            waiting=waiting.get(course.id, 0),
        )
    return views


def visible_course_ids_for_student(
    db: Session, student_id: uuid.UUID, class_id: Optional[str]
) -> set[str]:
    views = student_course_views(db, student_id, class_id)
    return {course_id for course_id, view in views.items() if view.visible}


def access_for_student(
    db: Session, student_id: uuid.UUID, class_id: Optional[str], course_ids=None
) -> dict[str, dict]:
    """{course_id: {"state", "expires_at"}}.

    With course_ids, those courses. Without, only the courses the student has an access
    row for.
    """
    views = student_course_views(db, student_id, class_id, course_ids)
    return {
        course_id: {"state": view.state, "expires_at": view.expires_at}
        for course_id, view in views.items()
        if course_ids is not None or view.has_access_row
    }


def student_can_open_course(
    db: Session, student_id: uuid.UUID, class_id: Optional[str], course_id: str
) -> bool:
    view = student_course_views(db, student_id, class_id, [course_id]).get(course_id)
    return view is not None and view.state in OPEN_STATES


def visible_course_ids_for_teacher(db: Session, teacher_id: uuid.UUID) -> set[str]:
    taught = select(ClassCourse.course_id).join(
        ClassTeacher, ClassTeacher.class_id == ClassCourse.class_id
    ).where(ClassTeacher.teacher_id == teacher_id)
    owned = select(Course.id).where(Course.owner_id == teacher_id)
    if is_admin(db, teacher_id):
        return {r[0] for r in db.execute(select(Course.id)).all()}
    return {r[0] for r in db.execute(taught.union(owned)).all()}


def student_can_see_lesson(
    db: Session, student_id: uuid.UUID, class_id: Optional[str], lesson_id: str
) -> bool:
    # Archived lessons and lessons of archived modules are not in the catalogue.
    catalog = snapshots.catalog.get(db)
    course_id = catalog.course_of_lesson(lesson_id)
    if course_id is None:
        return False
    # Every lesson route comes through here, so this one check guards all paid content.
    view = student_course_views(db, student_id, class_id, [course_id], catalog=catalog).get(course_id)
    return view is not None and view.visible and view.state in OPEN_STATES
