"""What day it is for EA's students.

Streaks count calendar days, and a calendar day depends on where you are. The server runs
on UTC; EA's students are in Ethiopia (UTC+3, no daylight saving), so studying at 01:00 in
Addis Ababa is "today" there but still "yesterday" in UTC. Every streak decision uses this
local day. Set APP_TIMEZONE to change it.
"""
from datetime import date, datetime, timedelta
from functools import lru_cache
from typing import Optional
from zoneinfo import ZoneInfo

from app.config import settings


@lru_cache(maxsize=1)
def _zone() -> ZoneInfo:
    return ZoneInfo(settings.app_timezone)


def local_today(now: Optional[datetime] = None) -> date:
    return (now or datetime.now(_zone())).astimezone(_zone()).date()


def streak_is_live(last_activity_date: Optional[date], today: Optional[date] = None) -> bool:
    """A stored streak is reset only when the student next earns XP, so it still counts
    only if their last active day was today or yesterday."""
    if last_activity_date is None:
        return False
    today = today or local_today()
    return last_activity_date >= today - timedelta(days=1)
