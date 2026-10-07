import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_teacher
from app.schemas import ClassCourseOut, ClassOut, ClassStudentOut, RankingEntryOut

router = APIRouter(prefix="/classes", tags=["classes"])

LIST_CLASSES_QUERY = text("""
    select c.id, c.name, count(p.id) as student_count
    from classes c
    left join profiles p on p.class_id = c.id and p.role = 'student'
    where c.id in :class_ids
    group by c.id, c.name
    order by c.name
""").bindparams(bindparam("class_ids", expanding=True))

CLASS_RANKING_QUERY = text("""
    select p.id, p.name,
           coalesce(sum(x.amount), 0) as xp,
           coalesce(sum(x.amount) filter (where x.created_at >= now() - interval '7 days'), 0) as weekly_xp,
           coalesce(sum(x.amount) filter (where x.created_at >= now() - interval '30 days'), 0) as monthly_xp
    from public.profiles p
    left join public.xp_events x on x.student_id = p.id
    where p.role = 'student' and p.is_active and p.class_id = :class_id
    group by p.id, p.name
    order by xp desc, p.name asc
""")

# One row per student: XP totals, last time they earned XP, and a streak that
# counts only if they were active today or yesterday (the stored streak is not
# reset until the student earns XP again).
CLASS_STUDENTS_QUERY = text("""
    select p.id, p.name, p.is_active,
           coalesce(sum(x.amount), 0) as xp,
           coalesce(sum(x.amount) filter (where x.created_at >= now() - interval '7 days'), 0) as weekly_xp,
           coalesce(sum(x.amount) filter (where x.created_at >= now() - interval '30 days'), 0) as monthly_xp,
           max(x.created_at) as last_active_at,
           coalesce(max(case when s.last_activity_date >= current_date - 1
                             then s.current_streak end), 0) as current_streak
    from profiles p
    left join xp_events x on x.student_id = p.id
    left join streaks s on s.student_id = p.id
    where p.role = 'student' and p.class_id = :class_id
    group by p.id, p.name, p.is_active
    order by p.name
""")

# How many lessons the class's courses contain in total.
CLASS_LESSON_TOTAL_QUERY = text("""
    select count(l.id)
    from class_courses cc
    join modules m on m.course_id = cc.course_id
    join lessons l on l.module_id = m.id
    where cc.class_id = :class_id
""")

# How many of those lessons each student finished.
CLASS_LESSONS_DONE_QUERY = text("""
    select lp.student_id, count(lp.id) as done
    from lesson_progress lp
    join profiles p on p.id = lp.student_id
    where p.role = 'student' and p.class_id = :class_id
      and lp.lesson_id in (
          select l.id
          from class_courses cc
          join modules m on m.course_id = cc.course_id
          join lessons l on l.module_id = m.id
          where cc.class_id = :class_id
      )
    group by lp.student_id
""")

CLASS_COURSES_QUERY = text("""
    select c.id, c.title, count(l.id) as total_lessons
    from class_courses cc
    join courses c on c.id = cc.course_id
    join modules m on m.course_id = c.id
    join lessons l on l.module_id = m.id
    where cc.class_id = :class_id
    group by c.id, c.title, c.sort_order
    order by c.sort_order
""")

# Finished lessons per course, counting active students of the class only.
CLASS_COURSE_DONE_QUERY = text("""
    select m.course_id, count(lp.id) as done
    from lesson_progress lp
    join profiles p on p.id = lp.student_id
    join lessons l on l.id = lp.lesson_id
    join modules m on m.id = l.module_id
    join class_courses cc on cc.course_id = m.course_id and cc.class_id = :class_id
    where p.role = 'student' and p.is_active and p.class_id = :class_id
    group by m.course_id
""")

ACTIVE_STUDENTS_QUERY = text("""
    select count(*) from profiles
    where role = 'student' and is_active and class_id = :class_id
""")


def _teacher_class_ids(db: Session, teacher_id: uuid.UUID) -> set[str]:
    rows = db.execute(
        text("select class_id from class_teachers where teacher_id = :teacher_id"),
        {"teacher_id": teacher_id},
    ).all()
    return {row[0] for row in rows}


def _require_teacher_class(db: Session, current_user: dict, class_id: str) -> None:
    # The class id comes from the URL, so it is always checked against the
    # classes this teacher is linked to. Anything else is a 404.
    class_ids = _teacher_class_ids(db, uuid.UUID(current_user["id"]))
    if class_id not in class_ids:
        raise HTTPException(status_code=404, detail="Class not found")


@router.get("", response_model=list[ClassOut])
def list_my_classes(
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    class_ids = _teacher_class_ids(db, uuid.UUID(current_user["id"]))
    if not class_ids:
        return []

    rows = db.execute(LIST_CLASSES_QUERY, {"class_ids": list(class_ids)}).mappings().all()
    return [{"id": r["id"], "name": r["name"], "student_count": r["student_count"]} for r in rows]


@router.get("/{class_id}/ranking", response_model=list[RankingEntryOut])
def get_class_ranking(
    class_id: str,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    class_ids = _teacher_class_ids(db, uuid.UUID(current_user["id"]))
    if class_id not in class_ids:
        raise HTTPException(status_code=404, detail="Class not found")

    rows = db.execute(CLASS_RANKING_QUERY, {"class_id": class_id}).mappings().all()
    return [
        {
            "id": str(r["id"]),
            "name": r["name"],
            "xp": r["xp"],
            "weekly_xp": r["weekly_xp"],
            "monthly_xp": r["monthly_xp"],
        }
        for r in rows
    ]


@router.get("/{class_id}/students", response_model=list[ClassStudentOut])
def list_class_students(
    class_id: str,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    _require_teacher_class(db, current_user, class_id)

    rows = db.execute(CLASS_STUDENTS_QUERY, {"class_id": class_id}).mappings().all()
    total_lessons = db.execute(CLASS_LESSON_TOTAL_QUERY, {"class_id": class_id}).scalar() or 0
    done_rows = db.execute(CLASS_LESSONS_DONE_QUERY, {"class_id": class_id}).mappings().all()
    done_by_student = {str(r["student_id"]): r["done"] for r in done_rows}

    result = []
    for r in rows:
        done = done_by_student.get(str(r["id"]), 0)
        result.append(
            {
                "id": str(r["id"]),
                "name": r["name"],
                "is_active": r["is_active"],
                "xp": r["xp"],
                "weekly_xp": r["weekly_xp"],
                "monthly_xp": r["monthly_xp"],
                "current_streak": r["current_streak"],
                "progress": round((done / total_lessons) * 100) if total_lessons else 0,
                "last_active_at": r["last_active_at"],
            }
        )
    return result


@router.get("/{class_id}/courses", response_model=list[ClassCourseOut])
def list_class_courses(
    class_id: str,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    _require_teacher_class(db, current_user, class_id)

    courses = db.execute(CLASS_COURSES_QUERY, {"class_id": class_id}).mappings().all()
    done_rows = db.execute(CLASS_COURSE_DONE_QUERY, {"class_id": class_id}).mappings().all()
    done_by_course = {r["course_id"]: r["done"] for r in done_rows}
    active = db.execute(ACTIVE_STUDENTS_QUERY, {"class_id": class_id}).scalar() or 0

    result = []
    for c in courses:
        possible = active * c["total_lessons"]
        done = done_by_course.get(c["id"], 0)
        result.append(
            {
                "id": c["id"],
                "title": c["title"],
                "total_lessons": c["total_lessons"],
                "avg_progress": round((done / possible) * 100) if possible else 0,
            }
        )
    return result