"""Who may edit or see what in Course Studio.

Editing:
  * an owned course: only its owner;
  * an ownerless (legacy) course: any teacher who teaches a class that has it,
    exactly as before.
Seeing, for a student:
  * a course given to their class (never a draft);
  * a published course that has an owner (global);
  * an unpublished owned course they already have progress in.
Everything that is not allowed answers 404, so a draft and a missing course look
the same.
"""
import uuid
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import and_, exists, or_, select
from sqlalchemy.orm import Session

from app.models import (
    ActivityProgress,
    ClassCourse,
    ClassTeacher,
    Course,
    Lesson,
    LessonActivity,
    LessonProgress,
    Module,
)


def editable_course_clause(teacher_id: uuid.UUID):
    taught = exists(
        select(1)
        .select_from(ClassCourse)
        .join(ClassTeacher, ClassTeacher.class_id == ClassCourse.class_id)
        .where(ClassCourse.course_id == Course.id, ClassTeacher.teacher_id == teacher_id)
    )
    return or_(Course.owner_id == teacher_id, and_(Course.owner_id.is_(None), taught))


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
    return visible


def visible_course_ids_for_teacher(db: Session, teacher_id: uuid.UUID) -> set[str]:
    taught = select(ClassCourse.course_id).join(
        ClassTeacher, ClassTeacher.class_id == ClassCourse.class_id
    ).where(ClassTeacher.teacher_id == teacher_id)
    owned = select(Course.id).where(Course.owner_id == teacher_id)
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
    return row[0] in visible_course_ids_for_student(db, student_id, class_id)
