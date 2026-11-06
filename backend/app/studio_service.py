"""The database writes for Course Studio.

Same shape as content_service: every public function checks access first,
validates, then writes inside one transaction.

Student records are never destroyed. Removing something that students have
progress or attempts on archives it instead (archived_at), and the row stays.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import delete, exists, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import studio_access, studio_sync
from app.content_rules import (
    ContentError,
    clean_description,
    clean_duration,
    clean_text,
    clean_title,
    make_id,
    MAX_TITLE_LEN,
)
from app.content_service import _log, transaction
from app.models import (
    ActivityProgress,
    Class,
    ClassCourse,
    ClassTeacher,
    Course,
    CourseAccess,
    Lesson,
    LessonActivity,
    LessonProgress,
    Module,
    PaymentRequest,
    Practice,
    PracticeAttempt,
    PracticeItem,
    Profile,
    Quiz,
    QuizAttempt,
    QuizQuestion,
)
from app.payment_rules import (
    SOURCE_EXISTING,
    clean_access_days,
    clean_instructions,
    clean_price,
)
from app.studio_rules import (
    DRAFT,
    MARK_COMPLETE_KINDS,
    MIN_AGGREGATE,
    PUBLISHED,
    clean_activity,
    next_status,
    suppress_small,
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# ---- shared helpers ----------------------------------------------------------


def _lessons_with_records(db: Session, lesson_ids: list[str]) -> set[str]:
    """Lessons that any student has progress or an attempt on."""
    if not lesson_ids:
        return set()
    found: set[str] = set()
    queries = [
        select(LessonProgress.lesson_id).where(LessonProgress.lesson_id.in_(lesson_ids)),
        select(Quiz.lesson_id)
        .join(QuizAttempt, QuizAttempt.quiz_id == Quiz.id)
        .where(Quiz.lesson_id.in_(lesson_ids)),
        select(Practice.lesson_id)
        .join(PracticeAttempt, PracticeAttempt.practice_id == Practice.id)
        .where(Practice.lesson_id.in_(lesson_ids)),
        select(LessonActivity.lesson_id)
        .join(ActivityProgress, ActivityProgress.activity_id == LessonActivity.id)
        .where(LessonActivity.lesson_id.in_(lesson_ids)),
    ]
    for query in queries:
        found |= {row[0] for row in db.execute(query.distinct()).all()}
    return found


def _purge_lessons(db: Session, lesson_ids: list[str]) -> None:
    """Hard delete lessons that have no student records. Spelled out child by
    child so it does not depend on cascades."""
    if not lesson_ids:
        return
    quiz_ids = select(Quiz.id).where(Quiz.lesson_id.in_(lesson_ids))
    practice_ids = select(Practice.id).where(Practice.lesson_id.in_(lesson_ids))
    db.execute(delete(LessonActivity).where(LessonActivity.lesson_id.in_(lesson_ids)))
    db.execute(delete(QuizQuestion).where(QuizQuestion.quiz_id.in_(quiz_ids)))
    db.execute(delete(Quiz).where(Quiz.lesson_id.in_(lesson_ids)))
    db.execute(delete(PracticeItem).where(PracticeItem.practice_id.in_(practice_ids)))
    db.execute(delete(Practice).where(Practice.lesson_id.in_(lesson_ids)))
    db.execute(delete(Lesson).where(Lesson.id.in_(lesson_ids)))


def _apply_order(active: list, archived: list, ids: list, label: str) -> None:
    current = {row.id: row for row in active}
    if len(ids) != len(set(ids)) or set(ids) != set(current):
        raise ContentError(f"The order must list every {label} exactly once")
    for position, row_id in enumerate(ids):
        current[row_id].sort_order = position
    for offset, row in enumerate(archived):
        row.sort_order = len(ids) + offset  # archived ones stay out of the way


def _next_sort(db: Session, column, *conditions) -> int:
    highest = db.execute(select(func.max(column)).where(*conditions)).scalar()
    return 0 if highest is None else highest + 1


# ---- courses -------------------------------------------------------------------


def _course_out(course: Course, teacher_id: uuid.UUID, editable: bool) -> dict:
    return {
        "id": course.id,
        "title": course.title,
        "description": course.description,
        "status": course.status,
        "owned": course.owner_id == teacher_id,
        "editable": editable,
        "price": course.price,
        "currency": course.currency,
        "access_days": course.access_days,
        "payment_instructions": course.payment_instructions,
        "owner_id": str(course.owner_id) if course.owner_id else None,
        "published_at": course.published_at,
        "created_at": course.created_at,
        "updated_at": course.updated_at,
    }


def create_course(db: Session, teacher_id: uuid.UUID, title, description) -> dict:
    title = clean_title(title)
    description = clean_description(description)
    with transaction(db):
        course = Course(
            id=make_id(title, "course"),
            title=title,
            description=description,
            owner_id=teacher_id,
            status=DRAFT,
            sort_order=_next_sort(db, Course.sort_order),
        )
        db.add(course)
        db.flush()
        db.refresh(course)
        result = _course_out(course, teacher_id, True)
    _log(teacher_id, "course_created", course.id)
    return result


def list_my_courses(db: Session, teacher_id: uuid.UUID) -> list[dict]:
    """Courses the teacher owns plus the ones given to their classes."""
    ids = studio_access.visible_course_ids_for_teacher(db, teacher_id)
    if not ids:
        return []
    editable_ids = {
        r[0]
        for r in db.execute(
            select(Course.id).where(
                Course.id.in_(ids), studio_access.editable_course_clause(teacher_id)
            )
        ).all()
    }
    courses = db.execute(
        select(Course).where(Course.id.in_(ids)).order_by(Course.sort_order, Course.id)
    ).scalars()
    return [_course_out(c, teacher_id, c.id in editable_ids) for c in courses]


def _activity_out(a: LessonActivity) -> dict:
    return {
        "id": a.id,
        "lesson_id": a.lesson_id,
        "kind": a.kind,
        "sort_order": a.sort_order,
        "title": a.title,
        "is_required": a.is_required,
        "video_url": a.video_url,
        "quiz_id": a.quiz_id,
        "practice_id": a.practice_id,
        "reading_body": a.reading_body,
        "archived": a.archived_at is not None,
    }


def get_outline(db: Session, teacher_id: uuid.UUID, course_id: str) -> dict:
    course = studio_access.get_editable_course(db, teacher_id, course_id)
    modules = db.execute(
        select(Module).where(Module.course_id == course.id).order_by(Module.sort_order, Module.id)
    ).scalars().all()
    module_ids = [m.id for m in modules]
    lessons = (
        db.execute(
            select(Lesson)
            .where(Lesson.module_id.in_(module_ids))
            .order_by(Lesson.sort_order, Lesson.id)
        ).scalars().all()
        if module_ids
        else []
    )
    lesson_ids = [lesson.id for lesson in lessons]
    activities = (
        db.execute(
            select(LessonActivity)
            .where(LessonActivity.lesson_id.in_(lesson_ids))
            .order_by(LessonActivity.sort_order, LessonActivity.id)
        ).scalars().all()
        if lesson_ids
        else []
    )
    by_lesson: dict[str, list] = {}
    for a in activities:
        by_lesson.setdefault(a.lesson_id, []).append(_activity_out(a))
    lessons_by_module: dict[str, list] = {}
    for lesson in lessons:
        lessons_by_module.setdefault(lesson.module_id, []).append(
            {
                "id": lesson.id,
                "title": lesson.title,
                "duration": lesson.duration,
                "sort_order": lesson.sort_order,
                "archived": lesson.archived_at is not None,
                "activities": by_lesson.get(lesson.id, []),
            }
        )
    out = _course_out(course, teacher_id, True)
    out["modules"] = [
        {
            "id": m.id,
            "title": m.title,
            "sort_order": m.sort_order,
            "archived": m.archived_at is not None,
            "lessons": lessons_by_module.get(m.id, []),
        }
        for m in modules
    ]
    return out


def update_course(db: Session, teacher_id: uuid.UUID, course_id: str, values: dict) -> dict:
    course = studio_access.get_editable_course(db, teacher_id, course_id)
    changes = {}
    if "title" in values:
        changes["title"] = clean_title(values["title"])
    if "description" in values:
        changes["description"] = clean_description(values["description"])
    changes.update(_pricing_changes(course, values))
    becomes_paid = not course.price and bool(changes.get("price"))
    with transaction(db):
        for field, value in changes.items():
            setattr(course, field, value)
        if becomes_paid:
            _keep_existing_learners(db, course, teacher_id)
        course.updated_at = _now()
        db.flush()
        result = _course_out(course, teacher_id, True)
    _log(teacher_id, "course_updated", course_id)
    return result


def _pricing_changes(course: Course, values: dict) -> dict:
    """The pricing fields that were sent, checked together with what is already saved."""
    changes = {}
    if values.get("price") is not None:
        changes["price"] = clean_price(values["price"])
    if "access_days" in values:
        changes["access_days"] = clean_access_days(values["access_days"])
    if "payment_instructions" in values:
        changes["payment_instructions"] = clean_instructions(values["payment_instructions"])
    if not changes:
        return changes

    price = changes.get("price", course.price)
    instructions = changes.get("payment_instructions", course.payment_instructions)
    if price:
        if course.owner_id is None:
            raise ContentError("A course needs an owner before it can have a price")
        if not instructions:
            raise ContentError("Tell students how to pay before setting a price")
    return changes


def _keep_existing_learners(db: Session, course: Course, granted_by: uuid.UUID) -> None:
    """A free course became paid: anyone with recorded progress keeps it, permanently.

    Archived lessons count too. Existing rows are left alone, so going free and back
    to paid never revives expired or revoked access. Courses a student only added on
    their phone leave no trace on the server, so those students cannot be found here.
    """
    lesson_ids = [
        r[0]
        for r in db.execute(
            select(Lesson.id)
            .join(Module, Module.id == Lesson.module_id)
            .where(Module.course_id == course.id)
        ).all()
    ]
    if not lesson_ids:
        return
    _, started = _progress_by_student(db, lesson_ids)
    held = {
        r[0]
        for r in db.execute(
            select(CourseAccess.student_id).where(CourseAccess.course_id == course.id)
        ).all()
    }
    for student_id in started - held:
        db.add(
            CourseAccess(
                student_id=student_id,
                course_id=course.id,
                expires_at=None,
                source=SOURCE_EXISTING,
                granted_by=granted_by,
            )
        )


def _require_owner(db: Session, course: Course, teacher_id: uuid.UUID, what: str) -> None:
    if course.owner_id != teacher_id and not studio_access.is_admin(db, teacher_id):
        raise HTTPException(status_code=403, detail=f"Only the owner can {what}")


def set_course_status(db: Session, teacher_id: uuid.UUID, course_id: str, action: str) -> dict:
    course = studio_access.get_editable_course(db, teacher_id, course_id)
    _require_owner(db, course, teacher_id, action)  # ownerless legacy courses are always published
    target = next_status(course.status, action)
    if target == PUBLISHED:
        lessons = db.execute(
            select(func.count(Lesson.id))
            .join(Module, Module.id == Lesson.module_id)
            .where(
                Module.course_id == course.id,
                Module.archived_at.is_(None),
                Lesson.archived_at.is_(None),
            )
        ).scalar_one()
        if lessons == 0:
            raise ContentError("Add at least one lesson before publishing")
    with transaction(db):
        course.status = target
        if target == PUBLISHED and course.published_at is None:
            course.published_at = _now()
        course.updated_at = _now()
        db.flush()
        result = _course_out(course, teacher_id, True)
    _log(teacher_id, f"course_{action}ed", course_id)
    return result


def _has_payment_records(db: Session, course_id: str) -> bool:
    return bool(
        db.execute(
            select(
                exists().where(PaymentRequest.course_id == course_id)
                | exists().where(CourseAccess.course_id == course_id)
            )
        ).scalar()
    )


def delete_course(db: Session, teacher_id: uuid.UUID, course_id: str) -> dict:
    """Hard delete only a course no student has touched. Otherwise: unpublish it."""
    course = studio_access.get_editable_course(db, teacher_id, course_id)
    _require_owner(db, course, teacher_id, "delete this course")
    lesson_ids = [
        r[0]
        for r in db.execute(
            select(Lesson.id)
            .join(Module, Module.id == Lesson.module_id)
            .where(Module.course_id == course.id)
        ).all()
    ]
    if _lessons_with_records(db, lesson_ids):
        raise HTTPException(
            status_code=409,
            detail="Students have progress in this course. Unpublish it instead of deleting it.",
        )
    if _has_payment_records(db, course.id):
        raise HTTPException(
            status_code=409,
            detail="This course has payment records. Unpublish it instead of deleting it.",
        )
    with transaction(db):
        _purge_lessons(db, lesson_ids)
        db.execute(delete(Module).where(Module.course_id == course.id))
        db.execute(delete(ClassCourse).where(ClassCourse.course_id == course.id))
        db.execute(delete(Course).where(Course.id == course.id))
    _log(teacher_id, "course_deleted", course_id)
    return {"deleted": True, "archived": False}


# ---- modules (chapters) ----------------------------------------------------------


def _module_out(m: Module) -> dict:
    return {
        "id": m.id,
        "title": m.title,
        "sort_order": m.sort_order,
        "archived": m.archived_at is not None,
        "lessons": [],
    }


def create_module(db: Session, teacher_id: uuid.UUID, course_id: str, title) -> dict:
    course = studio_access.get_editable_course(db, teacher_id, course_id)
    title = clean_title(title)
    with transaction(db):
        module = Module(
            id=make_id(title, "module"),
            course_id=course.id,
            title=title,
            sort_order=_next_sort(db, Module.sort_order, Module.course_id == course.id),
        )
        db.add(module)
        db.flush()
        result = _module_out(module)
    _log(teacher_id, "module_created", module.id)
    return result


def update_module(db: Session, teacher_id: uuid.UUID, module_id: str, values: dict) -> dict:
    module = studio_access.get_editable_module(db, teacher_id, module_id)
    title = clean_title(values["title"]) if "title" in values else None
    with transaction(db):
        if title is not None:
            module.title = title
        if "archived" in values and values["archived"] is not None:
            module.archived_at = _now() if values["archived"] else None
        db.flush()
        result = _module_out(module)
    _log(teacher_id, "module_updated", module_id)
    return result


def delete_module(db: Session, teacher_id: uuid.UUID, module_id: str) -> dict:
    module = studio_access.get_editable_module(db, teacher_id, module_id)
    lesson_ids = [r[0] for r in db.execute(select(Lesson.id).where(Lesson.module_id == module.id)).all()]
    with transaction(db):
        if _lessons_with_records(db, lesson_ids):
            module.archived_at = module.archived_at or _now()
            result = {"deleted": False, "archived": True}
        else:
            _purge_lessons(db, lesson_ids)
            db.execute(delete(Module).where(Module.id == module.id))
            result = {"deleted": True, "archived": False}
    _log(teacher_id, "module_removed", module_id)
    return result


def reorder_modules(db: Session, teacher_id: uuid.UUID, course_id: str, ids: list[str]) -> list[dict]:
    course = studio_access.get_editable_course(db, teacher_id, course_id)
    with transaction(db):
        modules = db.execute(
            select(Module).where(Module.course_id == course.id).order_by(Module.sort_order, Module.id)
        ).scalars().all()
        _apply_order(
            [m for m in modules if m.archived_at is None],
            [m for m in modules if m.archived_at is not None],
            ids,
            "chapter",
        )
        db.flush()
        result = [_module_out(m) for m in sorted(modules, key=lambda m: (m.sort_order, m.id))]
    _log(teacher_id, "modules_reordered", course_id)
    return result


# ---- lessons ----------------------------------------------------------------------


def _lesson_out(lesson: Lesson, activities: Optional[list] = None) -> dict:
    return {
        "id": lesson.id,
        "title": lesson.title,
        "duration": lesson.duration,
        "sort_order": lesson.sort_order,
        "archived": lesson.archived_at is not None,
        "activities": activities or [],
    }


def create_lesson(db: Session, teacher_id: uuid.UUID, module_id: str, values: dict) -> dict:
    module = studio_access.get_editable_module(db, teacher_id, module_id)
    title = clean_title(values.get("title"))
    duration = clean_duration(values.get("duration"))
    with transaction(db):
        lesson = Lesson(
            id=make_id(title, "lesson"),
            module_id=module.id,
            title=title,
            duration=duration,
            video_url=None,  # videos are activities now; this stays a synced legacy copy
            sort_order=_next_sort(db, Lesson.sort_order, Lesson.module_id == module.id),
        )
        db.add(lesson)
        db.flush()
        result = _lesson_out(lesson)
    _log(teacher_id, "lesson_created", lesson.id)
    return result


def update_lesson(db: Session, teacher_id: uuid.UUID, lesson_id: str, values: dict) -> dict:
    lesson = studio_access.get_editable_lesson(db, teacher_id, lesson_id)
    changes = {}
    if "title" in values:
        changes["title"] = clean_title(values["title"])
    if "duration" in values:
        changes["duration"] = clean_duration(values["duration"])
    with transaction(db):
        for field, value in changes.items():
            setattr(lesson, field, value)
        if "archived" in values and values["archived"] is not None:
            lesson.archived_at = _now() if values["archived"] else None
        db.flush()
        result = _lesson_out(lesson)
    _log(teacher_id, "lesson_updated", lesson_id)
    return result


def delete_lesson(db: Session, teacher_id: uuid.UUID, lesson_id: str) -> dict:
    lesson = studio_access.get_editable_lesson(db, teacher_id, lesson_id)
    with transaction(db):
        if _lessons_with_records(db, [lesson.id]):
            lesson.archived_at = lesson.archived_at or _now()
            result = {"deleted": False, "archived": True}
        else:
            _purge_lessons(db, [lesson.id])
            result = {"deleted": True, "archived": False}
    _log(teacher_id, "lesson_removed", lesson_id)
    return result


def reorder_lessons(db: Session, teacher_id: uuid.UUID, module_id: str, ids: list[str]) -> list[dict]:
    module = studio_access.get_editable_module(db, teacher_id, module_id)
    with transaction(db):
        lessons = db.execute(
            select(Lesson).where(Lesson.module_id == module.id).order_by(Lesson.sort_order, Lesson.id)
        ).scalars().all()
        _apply_order(
            [x for x in lessons if x.archived_at is None],
            [x for x in lessons if x.archived_at is not None],
            ids,
            "lesson",
        )
        db.flush()
        result = [_lesson_out(x) for x in sorted(lessons, key=lambda x: (x.sort_order, x.id))]
    _log(teacher_id, "lessons_reordered", module_id)
    return result


# ---- activities -----------------------------------------------------------------------


def list_activities(db: Session, teacher_id: uuid.UUID, lesson_id: str) -> list[dict]:
    studio_access.get_editable_lesson(db, teacher_id, lesson_id)
    rows = db.execute(
        select(LessonActivity)
        .where(LessonActivity.lesson_id == lesson_id)
        .order_by(LessonActivity.sort_order, LessonActivity.id)
    ).scalars()
    return [_activity_out(a) for a in rows]


def create_activity(db: Session, teacher_id: uuid.UUID, lesson_id: str, body: dict) -> dict:
    lesson = studio_access.get_editable_lesson(db, teacher_id, lesson_id)
    kind = body.get("kind")
    cleaned = clean_activity(kind, {k: v for k, v in body.items() if k != "kind"}, creating=True)

    try:
        with transaction(db):
            fields: dict = {}
            if kind == "quiz":
                quiz = db.execute(select(Quiz).where(Quiz.lesson_id == lesson.id)).scalar_one_or_none()
                if quiz is not None and db.execute(
                    select(LessonActivity.id).where(LessonActivity.quiz_id == quiz.id)
                ).first():
                    raise HTTPException(
                        status_code=409,
                        detail="This lesson already has a quiz. Restore it if it was archived.",
                    )
                if quiz is None:
                    quiz = Quiz(lesson_id=lesson.id)
                    db.add(quiz)
                    db.flush()
                fields["quiz_id"] = quiz.id
            elif kind == "practice":
                practice = db.execute(
                    select(Practice).where(Practice.lesson_id == lesson.id)
                ).scalar_one_or_none()
                if practice is not None and db.execute(
                    select(LessonActivity.id).where(LessonActivity.practice_id == practice.id)
                ).first():
                    raise HTTPException(
                        status_code=409,
                        detail="This lesson already has a practice. Restore it if it was archived.",
                    )
                if practice is None:
                    practice = Practice(
                        lesson_id=lesson.id,
                        title=clean_text(
                            f"{lesson.title} practice", "Practice title", MAX_TITLE_LEN
                        ),
                    )
                    db.add(practice)
                    db.flush()
                fields["practice_id"] = practice.id

            activity = LessonActivity(
                lesson_id=lesson.id,
                kind=kind,
                sort_order=studio_sync.next_sort_order(db, lesson.id),
                **fields,
                **cleaned,
            )
            db.add(activity)
            db.flush()
            if kind == "video":
                studio_sync.sync_lesson_video(db, lesson.id)
            result = _activity_out(activity)
    except IntegrityError:
        raise HTTPException(status_code=409, detail="This lesson already has that activity")

    _log(teacher_id, "activity_created", f"lesson={lesson.id} kind={kind}")
    return result


def update_activity(db: Session, teacher_id: uuid.UUID, activity_id: int, body: dict) -> dict:
    activity = studio_access.get_editable_activity(db, teacher_id, activity_id)
    fields = {k: v for k, v in body.items() if k != "archived"}
    cleaned = clean_activity(activity.kind, fields, creating=False)

    with transaction(db):
        for field, value in cleaned.items():
            setattr(activity, field, value)
        if body.get("archived") is not None:
            activity.archived_at = _now() if body["archived"] else None
        activity.updated_at = _now()
        db.flush()
        if activity.kind == "video":
            studio_sync.sync_lesson_video(db, activity.lesson_id)
        result = _activity_out(activity)
    _log(teacher_id, "activity_updated", activity_id)
    return result


def delete_activity(db: Session, teacher_id: uuid.UUID, activity_id: int) -> dict:
    """Quiz and practice activities are only ever archived (their questions and
    every attempt stay). Video and reading are deleted unless a student has
    completed them, in which case they are archived."""
    activity = studio_access.get_editable_activity(db, teacher_id, activity_id)
    has_progress = db.execute(
        select(ActivityProgress.id).where(ActivityProgress.activity_id == activity.id).limit(1)
    ).first() is not None

    with transaction(db):
        if activity.kind in ("quiz", "practice") or has_progress:
            activity.archived_at = activity.archived_at or _now()
            activity.updated_at = _now()
            result = {"deleted": False, "archived": True}
        else:
            db.delete(activity)
            result = {"deleted": True, "archived": False}
        db.flush()
        if activity.kind == "video":
            studio_sync.sync_lesson_video(db, activity.lesson_id)
    _log(teacher_id, "activity_removed", activity_id)
    return result


def reorder_activities(db: Session, teacher_id: uuid.UUID, lesson_id: str, ids: list[int]) -> list[dict]:
    studio_access.get_editable_lesson(db, teacher_id, lesson_id)
    with transaction(db):
        rows = db.execute(
            select(LessonActivity)
            .where(LessonActivity.lesson_id == lesson_id)
            .order_by(LessonActivity.sort_order, LessonActivity.id)
        ).scalars().all()
        _apply_order(
            [a for a in rows if a.archived_at is None],
            [a for a in rows if a.archived_at is not None],
            ids,
            "activity",
        )
        db.flush()
        studio_sync.sync_lesson_video(db, lesson_id)  # the first video may have changed
        result = [_activity_out(a) for a in sorted(rows, key=lambda a: (a.sort_order, a.id))]
    _log(teacher_id, "activities_reordered", lesson_id)
    return result


# ---- students -----------------------------------------------------------------------------


def _is_ready(db: Session, activity: LessonActivity) -> bool:
    if activity.kind == "quiz":
        return db.execute(
            select(func.count(QuizQuestion.id)).where(QuizQuestion.quiz_id == activity.quiz_id)
        ).scalar_one() > 0
    if activity.kind == "practice":
        return db.execute(
            select(func.count(PracticeItem.id)).where(PracticeItem.practice_id == activity.practice_id)
        ).scalar_one() > 0
    return True


def student_lesson_activities(
    db: Session, student_id: uuid.UUID, class_id: Optional[str], lesson_id: str
) -> dict:
    # Looking at the list never completes anything.
    if not studio_access.student_can_see_lesson(db, student_id, class_id, lesson_id):
        raise HTTPException(status_code=404, detail="Lesson not found")
    rows = db.execute(
        select(LessonActivity)
        .where(LessonActivity.lesson_id == lesson_id, LessonActivity.archived_at.is_(None))
        .order_by(LessonActivity.sort_order, LessonActivity.id)
    ).scalars().all()
    done = {
        r[0]
        for r in db.execute(
            select(ActivityProgress.activity_id).where(
                ActivityProgress.student_id == student_id,
                ActivityProgress.activity_id.in_([a.id for a in rows] or [0]),
            )
        ).all()
    }
    lesson_done = db.execute(
        select(LessonProgress.id).where(
            LessonProgress.student_id == student_id, LessonProgress.lesson_id == lesson_id
        )
    ).first() is not None
    return {
        "lesson_id": lesson_id,
        "lesson_completed": lesson_done,
        "activities": [
            {
                "id": a.id,
                "kind": a.kind,
                "title": a.title,
                "sort_order": a.sort_order,
                "is_required": a.is_required,
                "completed": a.id in done,
                "ready": _is_ready(db, a),
                "video_url": a.video_url,
                "reading_body": a.reading_body,
            }
            for a in rows
        ],
    }


def mark_activity_complete(
    db: Session, student_id: uuid.UUID, class_id: Optional[str], activity_id: int
) -> dict:
    """Explicit Mark Complete for a video or reading. Completes the lesson too.

    is_required plays no part: any completed activity completes the lesson, and
    nothing else does.
    """
    activity = db.get(LessonActivity, activity_id)
    if activity is None or activity.archived_at is not None:
        raise HTTPException(status_code=404, detail="Activity not found")
    if not studio_access.student_can_see_lesson(db, student_id, class_id, activity.lesson_id):
        raise HTTPException(status_code=404, detail="Activity not found")
    if activity.kind not in MARK_COMPLETE_KINDS:
        raise HTTPException(
            status_code=422,
            detail="Quizzes and practices are completed by submitting them",
        )

    lesson_id = activity.lesson_id
    try:
        with transaction(db):
            already = db.execute(
                select(ActivityProgress.id).where(
                    ActivityProgress.student_id == student_id,
                    ActivityProgress.activity_id == activity_id,
                )
            ).first()
            if already is None:
                db.add(
                    ActivityProgress(student_id=student_id, activity_id=activity_id, source="manual")
                )
            studio_sync.complete_lesson(db, student_id, lesson_id)
    except IntegrityError:
        # A double tap raced itself. The first one won; the result is the same.
        db.rollback()
    return {"activity_id": activity_id, "completed": True, "lesson_completed": True}


# ---- aggregate statistics -----------------------------------------------------------------------


def _live_lesson_ids(db: Session, course_id: str) -> list[str]:
    return [
        r[0]
        for r in db.execute(
            select(Lesson.id)
            .join(Module, Module.id == Lesson.module_id)
            .where(
                Module.course_id == course_id,
                Module.archived_at.is_(None),
                Lesson.archived_at.is_(None),
            )
        ).all()
    ]


def _progress_by_student(db: Session, lesson_ids: list[str]):
    """({student: lessons finished}, {students who have started}) for these lessons."""
    done_by_student: dict[uuid.UUID, set[str]] = {}
    for student, lesson in db.execute(
        select(LessonProgress.student_id, LessonProgress.lesson_id).where(
            LessonProgress.lesson_id.in_(lesson_ids)
        )
    ).all():
        done_by_student.setdefault(student, set()).add(lesson)
    started = set(done_by_student)
    started |= {
        r[0]
        for r in db.execute(
            select(ActivityProgress.student_id)
            .join(LessonActivity, LessonActivity.id == ActivityProgress.activity_id)
            .where(LessonActivity.lesson_id.in_(lesson_ids))
        ).all()
    }
    return done_by_student, started


def course_stats(db: Session, teacher_id: uuid.UUID, course_id: str) -> dict:
    """Global, anonymous counts for the owner. No student is identified, and a
    count below MIN_AGGREGATE is hidden. Class statistics live in /classes."""
    course = studio_access.get_editable_course(db, teacher_id, course_id)
    _require_owner_or_404(db, course, teacher_id)
    lesson_ids = [
        r[0]
        for r in db.execute(
            select(Lesson.id)
            .join(Module, Module.id == Lesson.module_id)
            .where(
                Module.course_id == course.id,
                Module.archived_at.is_(None),
                Lesson.archived_at.is_(None),
            )
        ).all()
    ]
    if not lesson_ids:
        return {"learners": 0, "completed_course": 0, "hidden": False, "min_aggregate": MIN_AGGREGATE}

    done_by_student, started = _progress_by_student(db, lesson_ids)
    finished = sum(1 for done in done_by_student.values() if len(done) == len(lesson_ids))

    learners, completed = suppress_small(len(started)), suppress_small(finished)
    return {
        "learners": learners,
        "completed_course": completed,
        "hidden": learners is None or completed is None,
        "min_aggregate": MIN_AGGREGATE,
    }


def _require_owner_or_404(db: Session, course: Course, teacher_id: uuid.UUID) -> None:
    # Course-wide numbers cover students from every class, so only the owner gets them.
    if course.owner_id != teacher_id and not studio_access.is_admin(db, teacher_id):
        raise HTTPException(status_code=404, detail="Course not found")


# ---- giving a course to a class -------------------------------------------------------------------------


def _taught_class(db: Session, teacher_id: uuid.UUID, class_id: str) -> Class:
    found = db.execute(
        select(Class)
        .join(ClassTeacher, ClassTeacher.class_id == Class.id)
        .where(Class.id == class_id, ClassTeacher.teacher_id == teacher_id)
    ).scalar_one_or_none()
    if found is None:
        raise HTTPException(status_code=404, detail="Class not found")
    return found


def course_classes(db: Session, teacher_id: uuid.UUID, course_id: str) -> list[dict]:
    """The classes this teacher teaches, whether each has the course, and that class's own
    numbers. Class numbers are kept apart from the course-wide ones: the teacher already
    sees their own class's students, so these are not hidden below 3."""
    course = studio_access.get_editable_course(db, teacher_id, course_id)
    _require_owner_or_404(db, course, teacher_id)
    classes = db.execute(
        select(Class)
        .join(ClassTeacher, ClassTeacher.class_id == Class.id)
        .where(ClassTeacher.teacher_id == teacher_id)
        .order_by(Class.name)
    ).scalars().all()
    assigned = {
        r[0]
        for r in db.execute(select(ClassCourse.class_id).where(ClassCourse.course_id == course.id)).all()
    }
    lesson_ids = _live_lesson_ids(db, course.id)
    done_by_student, started = _progress_by_student(db, lesson_ids) if lesson_ids else ({}, set())

    out = []
    for cls in classes:
        students = {
            r[0]
            for r in db.execute(
                select(Profile.id).where(
                    Profile.class_id == cls.id, Profile.role == "student", Profile.is_active.is_(True)
                )
            ).all()
        }
        out.append(
            {
                "class_id": cls.id,
                "name": cls.name,
                "assigned": cls.id in assigned,
                "students": len(students),
                "learners": len(students & started),
                "completed_course": sum(
                    1
                    for sid in students
                    if lesson_ids and len(done_by_student.get(sid, set())) == len(lesson_ids)
                ),
            }
        )
    return out


def set_class_assignment(
    db: Session, teacher_id: uuid.UUID, course_id: str, class_id: str, assigned: bool
) -> dict:
    course = studio_access.get_editable_course(db, teacher_id, course_id)
    _require_owner(db, course, teacher_id, "give this course to a class")
    cls = _taught_class(db, teacher_id, class_id)
    with transaction(db):
        existing = db.get(ClassCourse, (cls.id, course.id))
        if assigned and existing is None:
            db.add(ClassCourse(class_id=cls.id, course_id=course.id))
        elif not assigned and existing is not None:
            db.delete(existing)
    _log(teacher_id, "course_assigned" if assigned else "course_unassigned", f"{course.id}->{cls.id}")
    return next(c for c in course_classes(db, teacher_id, course_id) if c["class_id"] == cls.id)
