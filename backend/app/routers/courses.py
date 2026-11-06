import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app import studio_access
from app.database import get_db
from app.deps import get_current_user
from app.models import Course, LessonProgress, Module, PaymentRequest
from app.payment_rules import OPEN_STATES, PENDING
from app.schemas import CourseDetailOut, CourseListItemOut

router = APIRouter(prefix="/courses", tags=["courses"])


def _completed_lesson_ids(db: Session, student_id: uuid.UUID) -> set[str]:
    rows = (
        db.query(LessonProgress.lesson_id)
        .filter(LessonProgress.student_id == student_id)
        .all()
    )
    return {row[0] for row in rows}


def _visible_course_ids_for_student(db: Session, student_id: uuid.UUID, class_id) -> set[str]:
    return studio_access.visible_course_ids_for_student(db, student_id, class_id)


def _visible_course_ids_for_teacher(db: Session, teacher_id: uuid.UUID) -> set[str]:
    return studio_access.visible_course_ids_for_teacher(db, teacher_id)


def _student_access(db: Session, current_user: dict, course_ids: list[str]) -> dict[str, dict]:
    """{course_id: the access block} for one student, in a fixed number of queries."""
    student_id = uuid.UUID(current_user["id"])
    access = studio_access.access_for_student(
        db, student_id, current_user.get("class_id"), course_ids
    )
    waiting = dict(
        db.execute(
            select(PaymentRequest.course_id, func.count(PaymentRequest.id))
            .where(
                PaymentRequest.student_id == student_id,
                PaymentRequest.status == PENDING,
                PaymentRequest.course_id.in_(course_ids),
            )
            .group_by(PaymentRequest.course_id)
        ).all()
    )
    return {
        course_id: {**entry, "pending_requests": waiting.get(course_id, 0)}
        for course_id, entry in access.items()
    }


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
    completed = _completed_lesson_ids(db, uuid.UUID(current_user["id"]))
    query = db.query(Course).options(selectinload(Course.modules).selectinload(Module.lessons))

    if current_user["role"] == "student":
        visible_ids = _visible_course_ids_for_student(
            db, uuid.UUID(current_user["id"]), current_user.get("class_id")
        )
        query = query.filter(Course.id.in_(visible_ids)) if visible_ids else query.filter(False)
    elif current_user["role"] == "teacher":
        visible_ids = _visible_course_ids_for_teacher(db, uuid.UUID(current_user["id"]))
        query = query.filter(Course.id.in_(visible_ids)) if visible_ids else query.filter(False)

    courses = query.order_by(Course.sort_order).all()
    access = {}
    if current_user["role"] == "student" and courses:
        access = _student_access(db, current_user, [course.id for course in courses])
    return [_course_to_dict(course, completed, access.get(course.id)) for course in courses]


@router.get("/{course_id}", response_model=CourseDetailOut)
def get_course(
    course_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user["role"] == "student":
        visible_ids = _visible_course_ids_for_student(
            db, uuid.UUID(current_user["id"]), current_user.get("class_id")
        )
        if course_id not in visible_ids:
            raise HTTPException(status_code=404, detail="Course not found")
    elif current_user["role"] == "teacher":
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
    access = None
    if current_user["role"] == "student":
        access = _student_access(db, current_user, [course.id]).get(course.id)
    return _course_to_dict(course, completed, access)
