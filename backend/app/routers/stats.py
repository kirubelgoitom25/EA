import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user, require_student
from app.models import Streak
from app.schemas import MeStatsOut, RankingEntryOut

router = APIRouter(tags=["stats"])

STATS_QUERY = """
    select
      coalesce(sum(amount), 0) as total_xp,
      coalesce(sum(amount) filter (where created_at >= now() - interval '7 days'), 0) as weekly_xp,
      coalesce(sum(amount) filter (where created_at >= now() - interval '30 days'), 0) as monthly_xp
    from public.xp_events
    where student_id = :student_id
"""

RANKING_QUERY = """
    select p.id, p.name,
           coalesce(sum(x.amount), 0) as xp,
           coalesce(sum(x.amount) filter (where x.created_at >= now() - interval '7 days'), 0) as weekly_xp,
           coalesce(sum(x.amount) filter (where x.created_at >= now() - interval '30 days'), 0) as monthly_xp
    from public.profiles p
    left join public.xp_events x on x.student_id = p.id
    where p.role = 'student' and p.is_active
    group by p.id, p.name
    order by xp desc, p.name asc
"""


@router.get("/me/stats", response_model=MeStatsOut)
def get_my_stats(
    current_user: dict = Depends(require_student), db: Session = Depends(get_db)
):
    student_id = uuid.UUID(current_user["id"])
    row = db.execute(text(STATS_QUERY), {"student_id": student_id}).mappings().first()
    streak = db.get(Streak, student_id)

    return {
        "xp": row["total_xp"],
        "weekly_xp": row["weekly_xp"],
        "monthly_xp": row["monthly_xp"],
        "current_streak": streak.current_streak if streak else 0,
        "longest_streak": streak.longest_streak if streak else 0,
    }


@router.get("/ranking", response_model=list[RankingEntryOut])
def get_ranking(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.execute(text(RANKING_QUERY)).mappings().all()
    return [
        {
            "id": str(row["id"]),
            "name": row["name"],
            "xp": row["xp"],
            "weekly_xp": row["weekly_xp"],
            "monthly_xp": row["monthly_xp"],
        }
        for row in rows
    ]
