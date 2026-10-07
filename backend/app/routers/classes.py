import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.course_activity import current_courses_for_class
from app.database import get_db
from app.deps import require_teacher
from app.schemas import (
    ClassCourseOut,
    ClassOut,
    ClassStandingOut,
    ClassStudentOut,
    RankingEntryOut,
)

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
    current_courses = current_courses_for_class(db, class_id)

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
                "current_course": current_courses.get(str(r["id"])),
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


# XP earned in ONE course by each active student of the class, with the same
# weekly / monthly / overall totals as the class ranking.
COURSE_RANKING_QUERY = text("""
    with ev as (
        select x.student_id, x.amount, x.created_at
        from xp_events x
        join quizzes q on x.source = 'quiz' and q.id = x.source_id
        join lessons l on l.id = q.lesson_id
        join modules m on m.id = l.module_id
        where m.course_id = :course_id
          and x.student_id in (select id from profiles where class_id = :class_id)
        union all
        select x.student_id, x.amount, x.created_at
        from xp_events x
        join practices pr on x.source = 'practice' and pr.id = x.source_id
        join lessons l on l.id = pr.lesson_id
        join modules m on m.id = l.module_id
        where m.course_id = :course_id
          and x.student_id in (select id from profiles where class_id = :class_id)
    )
    select p.id, p.name,
           coalesce(sum(ev.amount), 0) as xp,
           coalesce(sum(ev.amount) filter (where ev.created_at >= now() - interval '7 days'), 0) as weekly_xp,
           coalesce(sum(ev.amount) filter (where ev.created_at >= now() - interval '30 days'), 0) as monthly_xp
    from profiles p
    left join ev on ev.student_id = p.id
    where p.role = 'student' and p.is_active and p.class_id = :class_id
    group by p.id, p.name
    order by xp desc, p.name asc
""")

# Every class with at least one active student, ranked by TOTAL XP of its
# active students. count(distinct ...) because joining xp_events repeats rows.
STANDINGS_QUERY = text("""
    select c.id, c.name,
           count(distinct p.id) as student_count,
           coalesce(sum(x.amount), 0) as xp,
           coalesce(sum(x.amount) filter (where x.created_at >= now() - interval '7 days'), 0) as weekly_xp,
           coalesce(sum(x.amount) filter (where x.created_at >= now() - interval '30 days'), 0) as monthly_xp
    from classes c
    left join profiles p on p.class_id = c.id and p.role = 'student' and p.is_active
    left join xp_events x on x.student_id = p.id
    group by c.id, c.name
    having count(distinct p.id) > 0
    order by xp desc, c.name asc
""")


@router.get("/standings", response_model=list[ClassStandingOut])
def get_class_standings(
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    # Teachers see how their classes compare with the others. Other classes show
    # only a name and totals (no students, and no id).
    mine = _teacher_class_ids(db, uuid.UUID(current_user["id"]))
    if not mine:
        return []

    rows = db.execute(STANDINGS_QUERY).mappings().all()
    return [
        {
            "id": r["id"] if r["id"] in mine else None,
            "name": r["name"],
            "student_count": r["student_count"],
            "xp": r["xp"],
            "weekly_xp": r["weekly_xp"],
            "monthly_xp": r["monthly_xp"],
            "is_mine": r["id"] in mine,
        }
        for r in rows
    ]


@router.get("/{class_id}/courses/{course_id}/ranking", response_model=list[RankingEntryOut])
def get_course_ranking(
    class_id: str,
    course_id: str,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    _require_teacher_class(db, current_user, class_id)

    # Both ids come from the URL. The course must be assigned to this class.
    assigned = db.execute(
        text("select 1 from class_courses where class_id = :class_id and course_id = :course_id"),
        {"class_id": class_id, "course_id": course_id},
    ).first()
    if assigned is None:
        raise HTTPException(status_code=404, detail="Course not found")

    rows = db.execute(
        COURSE_RANKING_QUERY, {"class_id": class_id, "course_id": course_id}
    ).mappings().all()
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