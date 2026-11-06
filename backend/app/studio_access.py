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
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import and_, exists, or_, select
from sqlalchemy.orm import Session

from app.models import (
    ActivityProgress,
    ClassCourse,
    ClassTeacher,
    Course,
    CourseAccess,
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


def _progressed_course_ids(db: Session, student_id: uuid.UUID) -> set[str]:
    by_lesson = select(Module.course_id).join(Lesson, Lesson.module_id == Module.id).join(
        LessonProgress, LessonProgress.lesson_id == Lesson.id
    ).where(LessonProgress.student_id == student_id)
    by_activity = (
        select(Module.course_id)
        .join(Lesson, Lesson.module_id == Module.id)
        .join(LessonActivity, LessonActivity.lesson_id == Lesson.id)
        .join(ActivityProgress, ActivityProgress.activity_id == LessonActivity.id)
        .where(ActivityProgress.student_id == student_id)
    )
    return {r[0] for r in db.execute(by_lesson.union(by_activity)).all()}


def visible_course_ids_for_student(
    db: Session, student_id: uuid.UUID, class_id: Optional[str]
) -> set[str]:
    visible: set[str] = set()

    if class_id is not None:
        rows = db.execute(
            select(Course.id)
            .join(ClassCourse, ClassCourse.course_id == Course.id)
            .where(ClassCourse.class_id == class_id, Course.status != "draft")
        ).all()
        visible |= {r[0] for r in rows}

    rows = db.execute(
        select(Course.id).where(Course.owner_id.is_not(None), Course.status == "published")
    ).all()
    visible |= {r[0] for r in rows}

    unpublished = {
        r[0]
        for r in db.execute(
            select(Course.id).where(Course.owner_id.is_not(None), Course.status == "unpublished")
        ).all()
    }
    if unpublished:
        visible |= unpublished & _progressed_course_ids(db, student_id)

    held = access_for_student(db, student_id, class_id)
    visible |= {course_id for course_id, entry in held.items() if entry["state"] == ACTIVE}
    return visible


def _class_course_ids(db: Session, class_id: Optional[str]) -> set[str]:
    if class_id is None:
        return set()
    rows = db.execute(select(ClassCourse.course_id).where(ClassCourse.class_id == class_id)).all()
    return {r[0] for r in rows}


def access_for_student(
    db: Session, student_id: uuid.UUID, class_id: Optional[str], course_ids=None
) -> dict[str, dict]:
    """{course_id: {"state", "expires_at"}}, in two queries however many courses.

    With course_ids, those courses. Without, only the courses the student has an access
    row for. The time always comes from the server, never the phone.
    """
    now = datetime.now(timezone.utc)
    rows = select(CourseAccess).where(CourseAccess.student_id == student_id)
    if course_ids is not None:
        rows = rows.where(CourseAccess.course_id.in_(course_ids))
    held = {a.course_id: a for a in db.execute(rows).scalars()}
    wanted = set(held) if course_ids is None else set(course_ids)
    if not wanted:
        return {}
    prices = dict(db.execute(select(Course.id, Course.price).where(Course.id.in_(wanted))).all())
    in_class = _class_course_ids(db, class_id)

    out = {}
    for course_id, price in prices.items():
        row = held.get(course_id)
        out[course_id] = {
            "state": access_state(
                price,
                course_id in in_class,
                row.expires_at if row else None,
                row.revoked_at if row else None,
                row is not None,
                now,
            ),
            "expires_at": row.expires_at if row else None,
        }
    return out


def student_can_open_course(
    db: Session, student_id: uuid.UUID, class_id: Optional[str], course_id: str
) -> bool:
    entry = access_for_student(db, student_id, class_id, [course_id]).get(course_id)
    return entry is not None and entry["state"] in OPEN_STATES


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
    row = db.execute(
        select(Module.course_id)
        .join(Lesson, Lesson.module_id == Module.id)
        .where(
            Lesson.id == lesson_id,
            Lesson.archived_at.is_(None),
            Module.archived_at.is_(None),
        )
    ).first()
    if row is None:
        return False
    # Every lesson route comes through here, so this one check guards all paid content.
    return row[0] in visible_course_ids_for_student(
        db, student_id, class_id
    ) and student_can_open_course(db, student_id, class_id, row[0])
