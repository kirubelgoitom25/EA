import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models import Course, LessonProgress, Module
from app.schemas import CourseDetailOut, CourseListItemOut

router = APIRouter(prefix="/courses", tags=["courses"])


def _completed_lesson_ids(db: Session, student_id: uuid.UUID) -> set[str]:
    rows = (
        db.query(LessonProgress.lesson_id)
        .filter(LessonProgress.student_id == student_id)
        .all()
    )
    return {row[0] for row in rows}


def _course_to_dict(course: Course, completed: set[str]) -> dict:
    modules_out = [
        {
            "id": module.id,
            "title": module.title,
            "lessons": [
                {
                    "id": lesson.id,
                    "title": lesson.title,
                    "duration": lesson.duration,
                    "video_url": lesson.video_url,
                    "completed": lesson.id in completed,
                }
                for lesson in module.lessons
            ],
        }
        for module in course.modules
    ]

    total = sum(len(module["lessons"]) for module in modules_out)
    done = sum(
        1
        for module in modules_out
        for lesson in module["lessons"]
        if lesson["completed"]
    )

    return {
        "id": course.id,
        "title": course.title,
        "description": course.description,
        "total_lessons": total,
        "completed_lessons": done,
        "progress": round((done / total) * 100) if total else 0,
        "modules": modules_out,
    }


@router.get("", response_model=list[CourseListItemOut])
def list_courses(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    completed = _completed_lesson_ids(db, uuid.UUID(current_user["id"]))
    courses = (
        db.query(Course)
        .options(selectinload(Course.modules).selectinload(Module.lessons))
        .order_by(Course.sort_order)
        .all()
    )
    return [_course_to_dict(course, completed) for course in courses]


@router.get("/{course_id}", response_model=CourseDetailOut)
def get_course(
    course_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
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
