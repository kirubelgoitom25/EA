import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from app import snapshots, studio_access
from app.database import get_db
from app.deps import get_current_user
from app.models import Course, LessonProgress, Module
from app.payment_rules import OPEN_STATES
from app.schemas import CourseDetailOut, CourseListItemOut

router = APIRouter(prefix="/courses", tags=["courses"])


def _completed_lesson_ids(db: Session, student_id: uuid.UUID) -> set[str]:
    rows = (
        db.query(LessonProgress.lesson_id)
        .filter(LessonProgress.student_id == student_id)
        .all()
    )
    return {row[0] for row in rows}


def _visible_course_ids_for_teacher(db: Session, teacher_id: uuid.UUID) -> set[str]:
    return studio_access.visible_course_ids_for_teacher(db, teacher_id)


def _access_block(view: studio_access.CourseView) -> dict:
    return {
        "state": view.state,
        "expires_at": view.expires_at,
        "pending_requests": view.waiting,
    }


def _student_courses(db: Session, current_user: dict, course_ids=None) -> list[dict]:
    """The courses this student may see, from the shared catalogue: one query for their
    class, access and waiting payments, one for the lessons they finished."""
    student_id = uuid.UUID(current_user["id"])
    catalog = snapshots.catalog.get(db)
    views = studio_access.student_course_views(
        db, student_id, current_user.get("class_id"), course_ids, with_waiting=True, catalog=catalog
    )
    shown = [course for course in catalog.courses if course.id in views and views[course.id].visible]
    if not shown:
        return []
    completed = _completed_lesson_ids(db, student_id)
    return [_course_to_dict(course, completed, _access_block(views[course.id])) for course in shown]


def _course_to_dict(course: Course, completed: set[str], access: Optional[dict] = None) -> dict:
    # Chapter titles stay visible so a locked course can be sold. A video link is the
    # content itself, so a locked student never receives it.
    locked = access is not None and access["state"] not in OPEN_STATES
    modules_out = [
        {
            "id": module.id,
            "title": module.title,
            "lessons": [
                {
                    "id": lesson.id,
                    "title": lesson.title,
                    "duration": lesson.duration,
                    "video_url": None if locked else lesson.video_url,
                    "completed": lesson.id in completed,
                }
                for lesson in module.lessons
                if lesson.archived_at is None
            ],
        }
        for module in course.modules
        if module.archived_at is None
    ]

    total = sum(len(module["lessons"]) for module in modules_out)
    done = sum(1 for module in modules_out for lesson in module["lessons"] if lesson["completed"])

    return {
        "id": course.id,
        "title": course.title,
        "description": course.description,
        "total_lessons": total,
        "completed_lessons": done,
        "progress": round((done / total) * 100) if total else 0,
        "price": course.price,
        "currency": course.currency,
        "access_days": course.access_days,
        "payment_instructions": course.payment_instructions,
        # A student must never pay for something the server would then refuse.
        "purchasable": course.status == "published",
        "access": access,
        "modules": modules_out,
    }


@router.get("", response_model=list[CourseListItemOut])
def list_courses(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user["role"] == "student":
        return _student_courses(db, current_user)

    completed = _completed_lesson_ids(db, uuid.UUID(current_user["id"]))
    query = db.query(Course).options(selectinload(Course.modules).selectinload(Module.lessons))
    if current_user["role"] == "teacher":
        visible_ids = _visible_course_ids_for_teacher(db, uuid.UUID(current_user["id"]))
        query = query.filter(Course.id.in_(visible_ids)) if visible_ids else query.filter(False)
    courses = query.order_by(Course.sort_order).all()
    return [_course_to_dict(course, completed) for course in courses]


@router.get("/{course_id}", response_model=CourseDetailOut)
def get_course(
    course_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user["role"] == "student":
        found = _student_courses(db, current_user, [course_id])
        if not found:
            raise HTTPException(status_code=404, detail="Course not found")
        return found[0]

    if current_user["role"] == "teacher":
        visible_ids = _visible_course_ids_for_teacher(db, uuid.UUID(current_user["id"]))
        if course_id not in visible_ids:
            raise HTTPException(status_code=404, detail="Course not found")

    completed = _completed_lesson_ids(db, uuid.UUID(current_user["id"]))
    course = (
        db.query(Course)
        .options(selectinload(Course.modules).selectinload(Module.lessons))
        .filter(Course.id == course_id)
        .first()
    )
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return _course_to_dict(course, completed)
