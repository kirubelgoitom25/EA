import uuid
from datetime import date, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_teacher
from app.schemas import StudentDetailOut, StudentOut

router = APIRouter(prefix="/students", tags=["students"])

LIST_STUDENTS_QUERY = text("""
    select u.id, p.name, u.email, p.role, p.is_active, p.created_at
    from profiles p
    join auth.users u on u.id = p.id
    where p.role = 'student' and p.class_id in :class_ids
    order by p.name
    limit :limit offset :offset
""").bindparams(bindparam("class_ids", expanding=True))

STUDENT_DETAIL_QUERY = text("""
    select u.id, p.name, u.email, p.role, p.is_active, p.created_at, p.class_id
    from profiles p
    join auth.users u on u.id = p.id
    where p.id = :student_id and p.role = 'student' and p.class_id in :class_ids
""").bindparams(bindparam("class_ids", expanding=True))

# Lessons done per course for one student, for the courses of their class.
COURSE_PROGRESS_QUERY = text("""
    select c.id, c.title,
           count(l.id) as total,
           count(lp.lesson_id) as done
    from class_courses cc
    join courses c on c.id = cc.course_id
    join modules m on m.course_id = c.id
    join lessons l on l.module_id = m.id
    left join lesson_progress lp on lp.lesson_id = l.id and lp.student_id = :sid
    where cc.class_id = :class_id
    group by c.id, c.title, c.sort_order
    order by c.sort_order
""")

# XP earned in each course by every active student of the class. XP events do
# not store a course, so the course is found through the quiz or practice that
# earned the XP: quiz/practice -> lesson -> module -> course.
CLASS_COURSE_XP_QUERY = text("""
    with ev as (
        select x.student_id, x.amount, m.course_id
        from xp_events x
        join quizzes q on x.source = 'quiz' and q.id = x.source_id
        join lessons l on l.id = q.lesson_id
        join modules m on m.id = l.module_id
        where x.student_id in (select id from profiles where class_id = :class_id)
        union all
        select x.student_id, x.amount, m.course_id
        from xp_events x
        join practices pr on x.source = 'practice' and pr.id = x.source_id
        join lessons l on l.id = pr.lesson_id
        join modules m on m.id = l.module_id
        where x.student_id in (select id from profiles where class_id = :class_id)
    )
    select cc.course_id, p.id as student_id, coalesce(sum(ev.amount), 0) as xp
    from class_courses cc
    join profiles p on p.class_id = cc.class_id and p.role = 'student' and p.is_active
    left join ev on ev.student_id = p.id and ev.course_id = cc.course_id
    where cc.class_id = :class_id
    group by cc.course_id, p.id
""")


def _teacher_class_ids(db: Session, teacher_id: uuid.UUID) -> set[str]:
    rows = db.execute(
        text("select class_id from class_teachers where teacher_id = :teacher_id"),
        {"teacher_id": teacher_id},
    ).all()
    return {row[0] for row in rows}


@router.get("", response_model=list[StudentOut])
def list_students(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    class_ids = _teacher_class_ids(db, uuid.UUID(current_user["id"]))
    if not class_ids:
        return []

    rows = db.execute(
        LIST_STUDENTS_QUERY,
        {"class_ids": list(class_ids), "limit": limit, "offset": offset},
    ).mappings().all()
    return [
        {
            "id": str(r["id"]),
            "name": r["name"],
            "email": r["email"],
            "role": r["role"],
            "is_active": r["is_active"],
            "created_at": r["created_at"],
        }
        for r in rows
    ]


@router.get("/{student_id}", response_model=StudentDetailOut)
def get_student(
    student_id: str,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    class_ids = _teacher_class_ids(db, uuid.UUID(current_user["id"]))
    if not class_ids:
        raise HTTPException(status_code=404, detail="Student not found")

    try:
        parsed_id = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Student not found")

    row = db.execute(
        STUDENT_DETAIL_QUERY,
        {"student_id": parsed_id, "class_ids": list(class_ids)},
    ).mappings().first()

    if row is None:
        raise HTTPException(status_code=404, detail="Student not found")

    stats = db.execute(
        text("select coalesce(sum(amount),0) as xp from xp_events where student_id = :sid"),
        {"sid": parsed_id},
    ).mappings().first()

    streak = db.execute(
        text("select current_streak, last_activity_date from streaks where student_id = :sid"),
        {"sid": parsed_id},
    ).mappings().first()

    # The stored streak is only reset when the student earns XP again, so it
    # counts only if the last activity was today or yesterday.
    today = date.today()
    streak_is_live = (
        streak is not None
        and streak["last_activity_date"] is not None
        and streak["last_activity_date"] >= today - timedelta(days=1)
    )
    current_streak = streak["current_streak"] if streak_is_live else 0

    progress_rows = db.execute(
        COURSE_PROGRESS_QUERY,
        {"sid": parsed_id, "class_id": row["class_id"]},
    ).mappings().all()

    xp_rows = db.execute(
        CLASS_COURSE_XP_QUERY, {"class_id": row["class_id"]}
    ).mappings().all()

    # {course_id: {student_id: xp in that course}} for the active students of the class
    xp_by_course: dict[str, dict[str, Decimal]] = {}
    for r in xp_rows:
        xp_by_course.setdefault(r["course_id"], {})[str(r["student_id"])] = r["xp"]

    me = str(parsed_id)
    courses_out = []
    for c in progress_rows:
        xp_map = xp_by_course.get(c["id"], {})
        my_xp = xp_map.get(me, Decimal("0"))

        # Rank only if this student is active and has earned XP in the course.
        # Students tied on XP share a rank.
        if me in xp_map and my_xp > 0:
            rank = 1 + sum(1 for value in xp_map.values() if value > my_xp)
        else:
            rank = None

        courses_out.append(
            {
                "id": c["id"],
                "title": c["title"],
                "progress": round((c["done"] / c["total"]) * 100) if c["total"] else 0,
                "total_lessons": c["total"],
                "completed_lessons": c["done"],
                "xp": my_xp,
                "rank": rank,
                "class_size": len(xp_map),
            }
        )

    return {
        "id": str(row["id"]),
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "is_active": row["is_active"],
        "created_at": row["created_at"],
        "class_id": row["class_id"],
        "xp": stats["xp"],
        "current_streak": current_streak,
        "courses": courses_out,
    }