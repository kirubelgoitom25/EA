"""Needs-attention flags for a class, computed from data we already store.

Rules (active students only):
  never_active  no XP, quiz, practice or activity completion at all
  inactive      last activity 7 or more days ago
  low_quizzes   latest attempt is under 60% on at least 2 different quizzes
  repeated_low  3 or more attempts on one quiz and the best is still under 70%
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

INACTIVE_DAYS = 7
LOW_SCORE = 0.6
REPEATED_ATTEMPTS = 3
REPEATED_BEST_BELOW = 0.7

LABELS = {
    "never_active": "Never active",
    "inactive": "Inactive {days} days",
    "low_quizzes": "Low scores on {n} quizzes",
    "repeated_low": "Repeated attempts, still low",
}

CLASS_LAST_ACTIVITY_QUERY = text("""
    select p.id as student_id, max(a.at) as last_at
    from profiles p
    join (
        select student_id, created_at as at from xp_events
        union all select student_id, created_at from quiz_attempts
        union all select student_id, created_at from practice_attempts
        union all select student_id, completed_at from activity_progress
    ) a on a.student_id = p.id
    where p.role = 'student' and p.class_id = :class_id
    group by p.id
""")

# One row per student and quiz: attempts, best and latest score fraction.
CLASS_QUIZ_SCORES_QUERY = text("""
    select qa.student_id, qa.quiz_id, count(*) as attempts,
           max(qa.score::float / nullif(qa.total_questions, 0)) as best,
           (array_agg(qa.score::float / nullif(qa.total_questions, 0)
                      order by qa.created_at desc, qa.id desc))[1] as latest
    from quiz_attempts qa
    join profiles p on p.id = qa.student_id
    where p.role = 'student' and p.class_id = :class_id
    group by qa.student_id, qa.quiz_id
""")


def attention_flags(last_at, quiz_rows, now=None) -> list[dict]:
    """last_at: datetime or None. quiz_rows: dicts with attempts, best, latest."""
    now = now or datetime.now(timezone.utc)
    flags = []
    if last_at is None:
        flags.append({"code": "never_active", "label": LABELS["never_active"]})
    else:
        if last_at.tzinfo is None:
            last_at = last_at.replace(tzinfo=timezone.utc)
        if now - last_at >= timedelta(days=INACTIVE_DAYS):
            days = (now - last_at).days
            flags.append({"code": "inactive", "label": LABELS["inactive"].format(days=days)})
    low = sum(1 for r in quiz_rows if r["latest"] is not None and r["latest"] < LOW_SCORE)
    if low >= 2:
        flags.append({"code": "low_quizzes", "label": LABELS["low_quizzes"].format(n=low)})
    if any(
        r["attempts"] >= REPEATED_ATTEMPTS and r["best"] is not None and r["best"] < REPEATED_BEST_BELOW
        for r in quiz_rows
    ):
        flags.append({"code": "repeated_low", "label": LABELS["repeated_low"]})
    return flags


def class_attention(db, class_id: str, active_ids: list[str]) -> dict[str, list[dict]]:
    """{student_id: flags} for the given active students (unflagged ones map to [])."""
    last = {
        str(r["student_id"]): r["last_at"]
        for r in db.execute(CLASS_LAST_ACTIVITY_QUERY, {"class_id": class_id}).mappings()
    }
    quizzes: dict[str, list[dict]] = {}
    for r in db.execute(CLASS_QUIZ_SCORES_QUERY, {"class_id": class_id}).mappings():
        quizzes.setdefault(str(r["student_id"]), []).append(dict(r))
    return {sid: attention_flags(last.get(sid), quizzes.get(sid, [])) for sid in active_ids}
