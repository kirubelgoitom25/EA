import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import Streak, XPEvent


def award_xp(
    db: Session, student_id: uuid.UUID, amount: Decimal, source: str, source_id: int
) -> None:
    if amount <= 0:
        return

    db.add(
        XPEvent(
            student_id=student_id, amount=amount, source=source, source_id=source_id
        )
    )

    streak = db.get(Streak, student_id)
    today = date.today()

    if streak is None:
        db.add(
            Streak(
                student_id=student_id,
                current_streak=1,
                longest_streak=1,
                last_activity_date=today,
            )
        )
        return

    if streak.last_activity_date == today:
        pass
    elif streak.last_activity_date == today - timedelta(days=1):
        streak.current_streak += 1
        streak.last_activity_date = today
        streak.longest_streak = max(streak.longest_streak, streak.current_streak)
    else:
        streak.current_streak = 1
        streak.last_activity_date = today
