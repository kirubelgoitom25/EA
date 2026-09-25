import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, selectinload

from app.database import get_db
from app.deps import get_current_user
from app.models import Course, LessonProgress, Module
from app.schemas import CourseDetailOut, CourseListItemOut

router = APIRouter(prefix="/courses", tags=["courses"])


def _completed_lesson_ids(db: Session, student_id: uuid.UUID) -> set[int]:
    rows = (
        db.query(LessonProgress.lesson_id)
        .filter(LessonProgress.student_id == student_id)
        .all()
    )
    return {row[0] for row in rows}


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

    result = []
    for course in courses:
        all_lessons = [lesson for module in course.modules for lesson in module.lessons]
        total = len(all_lessons)
        done = sum(1 for lesson in all_lessons if lesson.id in completed)
        result.append(
            {
                "id": course.id,
                "title": course.title,
                "description": course.description,
                "total_lessons": total,
                "completed_lessons": done,
                "progress": round((done / total) * 100) if total else 0,
            }
        )
    return result


@router.get("/{course_id}", response_model=CourseDetailOut)
def get_course(
    course_id: int,
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

    return {
        "id": course.id,
        "title": course.title,
        "description": course.description,
        "modules": modules_out,
    }
