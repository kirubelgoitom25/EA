import uuid

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
        text("select current_streak from streaks where student_id = :sid"),
        {"sid": parsed_id},
    ).mappings().first()

    courses = db.execute(
        text("""
            select c.id, c.title,
                   count(l.id) as total,
                   count(lp.lesson_id) as done
            from class_courses cc
            join courses c on c.id = cc.course_id
            join modules m on m.course_id = c.id
            join lessons l on l.module_id = m.id
            left join lesson_progress lp on lp.lesson_id = l.id and lp.student_id = :sid
            where cc.class_id = :class_id
            group by c.id, c.title
        """),
        {"sid": parsed_id, "class_id": row["class_id"]},
    ).mappings().all()

    return {
        "id": str(row["id"]),
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "is_active": row["is_active"],
        "created_at": row["created_at"],
        "class_id": row["class_id"],
        "xp": stats["xp"],
        "current_streak": streak["current_streak"] if streak else 0,
        "courses": [
            {"id": c["id"], "title": c["title"], "progress": round((c["done"] / c["total"]) * 100) if c["total"] else 0}
            for c in courses
        ],
    }