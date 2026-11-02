"""Course Studio routes.

Teacher routes live under /teacher and need a teacher account. The two student
routes are the only new ones a student can reach; every older student route is
unchanged.
"""
import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import studio_service
from app.database import get_db
from app.deps import require_student, require_teacher
from app.studio_schemas import (
    ActivityCreateIn,
    ActivityOrderIn,
    ActivityOut,
    ActivityUpdateIn,
    ClassAssignmentOut,
    CompleteOut,
    CourseCreateIn,
    CourseOutlineOut,
    CourseStatsOut,
    CourseStudioOut,
    CourseUpdateIn,
    IdOrderIn,
    LessonCreateIn,
    LessonStudioOut,
    LessonUpdateIn,
    ModuleIn,
    ModuleStudioOut,
    ModuleUpdateIn,
    RemovedOut,
    StudentLessonActivitiesOut,
)

teacher_router = APIRouter(prefix="/teacher", tags=["course-studio"])
student_router = APIRouter(tags=["course-studio"])


def _tid(current_user: dict) -> uuid.UUID:
    return uuid.UUID(current_user["id"])


# ---- courses -------------------------------------------------------------------


@teacher_router.get("/courses", response_model=list[CourseStudioOut])
def my_courses(current_user: dict = Depends(require_teacher), db: Session = Depends(get_db)):
    return studio_service.list_my_courses(db, _tid(current_user))


@teacher_router.post("/courses", response_model=CourseStudioOut, status_code=201)
def create_course(
    body: CourseCreateIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.create_course(db, _tid(current_user), body.title, body.description)


@teacher_router.get("/courses/{course_id}", response_model=CourseOutlineOut)
def course_outline(
    course_id: str,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.get_outline(db, _tid(current_user), course_id)


@teacher_router.patch("/courses/{course_id}", response_model=CourseStudioOut)
def update_course(
    course_id: str,
    body: CourseUpdateIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.update_course(
        db, _tid(current_user), course_id, body.model_dump(exclude_unset=True)
    )


@teacher_router.post("/courses/{course_id}/publish", response_model=CourseStudioOut)
def publish_course(
    course_id: str,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.set_course_status(db, _tid(current_user), course_id, "publish")


@teacher_router.post("/courses/{course_id}/unpublish", response_model=CourseStudioOut)
def unpublish_course(
    course_id: str,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.set_course_status(db, _tid(current_user), course_id, "unpublish")


@teacher_router.delete("/courses/{course_id}", response_model=RemovedOut)
def delete_course(
    course_id: str,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.delete_course(db, _tid(current_user), course_id)


@teacher_router.get("/courses/{course_id}/stats", response_model=CourseStatsOut)
def course_stats(
    course_id: str,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.course_stats(db, _tid(current_user), course_id)


@teacher_router.get("/courses/{course_id}/classes", response_model=list[ClassAssignmentOut])
def course_classes(
    course_id: str,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.course_classes(db, _tid(current_user), course_id)


@teacher_router.put("/courses/{course_id}/classes/{class_id}", response_model=ClassAssignmentOut)
def give_course_to_class(
    course_id: str,
    class_id: str,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.set_class_assignment(db, _tid(current_user), course_id, class_id, True)


@teacher_router.delete("/courses/{course_id}/classes/{class_id}", response_model=ClassAssignmentOut)
def take_course_from_class(
    course_id: str,
    class_id: str,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.set_class_assignment(db, _tid(current_user), course_id, class_id, False)


# ---- chapters (modules) -----------------------------------------------------------


@teacher_router.post("/courses/{course_id}/modules", response_model=ModuleStudioOut, status_code=201)
def create_module(
    course_id: str,
    body: ModuleIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.create_module(db, _tid(current_user), course_id, body.title)


@teacher_router.put("/courses/{course_id}/modules/order", response_model=list[ModuleStudioOut])
def reorder_modules(
    course_id: str,
    body: IdOrderIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.reorder_modules(db, _tid(current_user), course_id, body.ids)


@teacher_router.patch("/modules/{module_id}", response_model=ModuleStudioOut)
def update_module(
    module_id: str,
    body: ModuleUpdateIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.update_module(
        db, _tid(current_user), module_id, body.model_dump(exclude_unset=True)
    )


@teacher_router.delete("/modules/{module_id}", response_model=RemovedOut)
def delete_module(
    module_id: str,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.delete_module(db, _tid(current_user), module_id)


# ---- lessons ---------------------------------------------------------------------------


@teacher_router.post("/modules/{module_id}/lessons", response_model=LessonStudioOut, status_code=201)
def create_lesson(
    module_id: str,
    body: LessonCreateIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.create_lesson(db, _tid(current_user), module_id, body.model_dump())


@teacher_router.put("/modules/{module_id}/lessons/order", response_model=list[LessonStudioOut])
def reorder_lessons(
    module_id: str,
    body: IdOrderIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.reorder_lessons(db, _tid(current_user), module_id, body.ids)


@teacher_router.patch("/lessons/{lesson_id}", response_model=LessonStudioOut)
def update_lesson(
    lesson_id: str,
    body: LessonUpdateIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.update_lesson(
        db, _tid(current_user), lesson_id, body.model_dump(exclude_unset=True)
    )


@teacher_router.delete("/lessons/{lesson_id}", response_model=RemovedOut)
def delete_lesson(
    lesson_id: str,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.delete_lesson(db, _tid(current_user), lesson_id)


# ---- activities ---------------------------------------------------------------------------


@teacher_router.get("/lessons/{lesson_id}/activities", response_model=list[ActivityOut])
def list_activities(
    lesson_id: str,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.list_activities(db, _tid(current_user), lesson_id)


@teacher_router.post("/lessons/{lesson_id}/activities", response_model=ActivityOut, status_code=201)
def create_activity(
    lesson_id: str,
    body: ActivityCreateIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.create_activity(
        db, _tid(current_user), lesson_id, body.model_dump(exclude_unset=True)
    )


@teacher_router.put("/lessons/{lesson_id}/activities/order", response_model=list[ActivityOut])
def reorder_activities(
    lesson_id: str,
    body: ActivityOrderIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.reorder_activities(db, _tid(current_user), lesson_id, body.ids)


@teacher_router.patch("/activities/{activity_id}", response_model=ActivityOut)
def update_activity(
    activity_id: int,
    body: ActivityUpdateIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.update_activity(
        db, _tid(current_user), activity_id, body.model_dump(exclude_unset=True)
    )


@teacher_router.delete("/activities/{activity_id}", response_model=RemovedOut)
def delete_activity(
    activity_id: int,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return studio_service.delete_activity(db, _tid(current_user), activity_id)


# ---- student ------------------------------------------------------------------------------------


@student_router.get("/lessons/{lesson_id}/activities", response_model=StudentLessonActivitiesOut)
def lesson_activities(
    lesson_id: str,
    current_user: dict = Depends(require_student),
    db: Session = Depends(get_db),
):
    return studio_service.student_lesson_activities(
        db, uuid.UUID(current_user["id"]), current_user.get("class_id"), lesson_id
    )


@student_router.post("/activities/{activity_id}/complete", response_model=CompleteOut)
def complete_activity(
    activity_id: int,
    current_user: dict = Depends(require_student),
    db: Session = Depends(get_db),
):
    return studio_service.mark_activity_complete(
        db, uuid.UUID(current_user["id"]), current_user.get("class_id"), activity_id
    )
