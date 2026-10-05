import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_teacher
from app.schemas import ClassOut, RankingEntryOut

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


def _teacher_class_ids(db: Session, teacher_id: uuid.UUID) -> set[str]:
    rows = db.execute(
        text("select class_id from class_teachers where teacher_id = :teacher_id"),
        {"teacher_id": teacher_id},
    ).all()
    return {row[0] for row in rows}


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