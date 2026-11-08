import uuid
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import snapshots
from app.clock import streak_is_live
from app.snapshots import PRO_BADGE_SQL
from app.database import get_db
from app.deps import require_student
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

CLASS_RANKING_QUERY = """
    select p.id, p.name, """ + PRO_BADGE_SQL + """ as pro,
           coalesce(sum(x.amount), 0) as xp,
           coalesce(sum(x.amount) filter (where x.created_at >= now() - interval '7 days'), 0) as weekly_xp,
           coalesce(sum(x.amount) filter (where x.created_at >= now() - interval '30 days'), 0) as monthly_xp
    from public.profiles p
    left join public.xp_events x on x.student_id = p.id
    where p.role = 'student' and p.is_active and p.class_id = :class_id
    group by p.id, p.name
    order by xp desc, p.name asc
"""

# Only this many students are listed nationally, plus the student asking.
NATIONAL_TOP = 50

PERIOD_XP = {"weekly": "weekly_xp", "monthly": "monthly_xp", "overall": "xp"}


def public_name(name: str) -> str:
    """"Abebe Kebede" becomes "Abebe K.". Same rule the app shows."""
    parts = (name or "").split()
    if not parts:
        return "Student"
    if len(parts) == 1:
        return parts[0]
    return f"{parts[0]} {parts[-1][0].upper()}."


def national_board(rows, my_id: str, period: str) -> list[dict]:
    """Anyone can register, so this is built to be safe to send to a stranger: first name
    and last initial, the top of the board plus the student's own row, and no id but their
    own. Each row carries its real position, so a rank outside the top still reads true."""
    key = PERIOD_XP[period]
    ranked = sorted(rows, key=lambda row: (-row[key], row["name"]))
    board = []
    for position, row in enumerate(ranked, start=1):
        mine = str(row["id"]) == my_id
        if position <= NATIONAL_TOP or mine:
            board.append(
                {
                    "id": str(row["id"]) if mine else "",
                    "name": public_name(row["name"]),
                    "xp": row["xp"],
                    "weekly_xp": row["weekly_xp"],
                    "monthly_xp": row["monthly_xp"],
                    "position": position,
                    "pro": bool(row.get("pro")),
                }
            )
    return board


def _national_rows(db: Session, current_user: dict) -> list:
    """Every active student's XP totals. Shared by all students and rebuilt after any new
    XP or profile change (see snapshots), except the asking student's own row, which is
    always read fresh: their own XP and position are never behind."""
    me = uuid.UUID(current_user["id"])
    mine = db.execute(text(STATS_QUERY), {"student_id": me}).mappings().first()
    my_pro = db.execute(
        text("select " + PRO_BADGE_SQL.replace("p.id", ":me")), {"me": me}
    ).scalar()
    others = [row for row in snapshots.national_totals.get(db) if row["id"] != me]
    return others + [
        {
            "id": me,
            "name": current_user["name"],
            "pro": bool(my_pro),
            "xp": mine["total_xp"],
            "weekly_xp": mine["weekly_xp"],
            "monthly_xp": mine["monthly_xp"],
        }
    ]


@router.get("/me/stats", response_model=MeStatsOut)
def get_my_stats(current_user: dict = Depends(require_student), db: Session = Depends(get_db)):
    student_id = uuid.UUID(current_user["id"])
    row = db.execute(text(STATS_QUERY), {"student_id": student_id}).mappings().first()
    streak = db.get(Streak, student_id)

    return {
        # The name rides along so the app needs no separate /auth/me to refresh.
        "name": current_user["name"],
        "xp": row["total_xp"],
        "weekly_xp": row["weekly_xp"],
        "monthly_xp": row["monthly_xp"],
        # Same rule teachers see: a streak whose last day was before yesterday has ended,
        # even though the stored number is only reset at the next XP.
        "current_streak": streak.current_streak
        if streak and streak_is_live(streak.last_activity_date)
        else 0,
        "longest_streak": streak.longest_streak if streak else 0,
    }


@router.get("/ranking", response_model=list[RankingEntryOut])
def get_ranking(
    scope: Literal["class", "national"] = Query("class"),
    period: Literal["weekly", "monthly", "overall"] = Query("overall"),
    current_user: dict = Depends(require_student),
    db: Session = Depends(get_db),
):
    # Students only. Teachers have their own class views and must not be able
    # to list every student of every class.
    if scope == "class":
        class_id = current_user.get("class_id")
        if class_id is None:
            # A student with no class has no classmates. Before this check, the
            # query matched every other class-less account.
            return []
        rows = db.execute(text(CLASS_RANKING_QUERY), {"class_id": class_id}).mappings().all()
    else:
        return national_board(_national_rows(db, current_user), current_user["id"], period)

    return [
        {
            "id": str(row["id"]),
            "name": row["name"],
            "xp": row["xp"],
            "weekly_xp": row["weekly_xp"],
            "monthly_xp": row["monthly_xp"],
            "pro": bool(row["pro"]),
        }
        for row in rows
    ]