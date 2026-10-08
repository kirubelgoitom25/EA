import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_student, require_teacher
from app.schemas import HeartbeatIn, PresenceOut

router = APIRouter(tags=["presence"])

# A student counts as online if the server heard from them within this many
# seconds. The student app sends a heartbeat every 45 seconds, so one or two
# missed beats are tolerated.
ONLINE_WINDOW_SECONDS = 120

# The lesson must belong to a course assigned to the student's own class.
LESSON_IN_CLASS_QUERY = text("""
    select 1
    from lessons l
    join modules m on m.id = l.module_id
    join class_courses cc on cc.course_id = m.course_id
    where l.id = :lesson_id and cc.class_id = :class_id
""")

# One row per student. A write is skipped when the stored one is less than 20
# seconds old, unless the lesson changed, so the table cannot be hammered.
HEARTBEAT_UPSERT = text("""
    insert into student_presence (student_id, last_seen_at, current_lesson_id)
    values (:student_id, now(), :lesson_id)
    on conflict (student_id) do update
        set last_seen_at = now(),
            current_lesson_id = excluded.current_lesson_id
        where student_presence.last_seen_at < now() - interval '20 seconds'
           or student_presence.current_lesson_id is distinct from excluded.current_lesson_id
""")

CLASS_PRESENCE_QUERY = text("""
    select p.id as student_id,
           extract(epoch from (now() - sp.last_seen_at))::int as seconds_since_seen,
           l.id as lesson_id, l.title as lesson_title,
           c.id as course_id, c.title as course_title
    from profiles p
    left join student_presence sp on sp.student_id = p.id
    left join lessons l on l.id = sp.current_lesson_id
    left join modules m on m.id = l.module_id
    left join courses c on c.id = m.course_id
    where p.role = 'student' and p.class_id = :class_id
""")


@router.post("/me/heartbeat", status_code=204)
def heartbeat(
    body: Optional[HeartbeatIn] = None,
    current_user: dict = Depends(require_student),
    db: Session = Depends(get_db),
):
    # Who the student is comes from the token, never from the request body.
    student_id = uuid.UUID(current_user["id"])

    # The lesson id comes from the client, so it is only stored when it is a
    # lesson of a course assigned to this student's own class.
    lesson_id = None
    requested = body.lesson_id if body else None
    if requested and current_user.get("class_id"):
        found = db.execute(
            LESSON_IN_CLASS_QUERY,
            {"lesson_id": requested, "class_id": current_user["class_id"]},
        ).first()
        if found is not None:
            lesson_id = requested

    db.execute(HEARTBEAT_UPSERT, {"student_id": student_id, "lesson_id": lesson_id})
    db.commit()
    return Response(status_code=204)


@router.get("/classes/{class_id}/presence", response_model=list[PresenceOut])
def class_presence(
    class_id: str,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    # The class id comes from the URL, so it is checked against the classes
    # this teacher is linked to. Anything else is a 404.
    linked = db.execute(
        text("select 1 from class_teachers where teacher_id = :teacher_id and class_id = :class_id"),
        {"teacher_id": uuid.UUID(current_user["id"]), "class_id": class_id},
    ).first()
    if linked is None:
        raise HTTPException(status_code=404, detail="Class not found")

    rows = db.execute(CLASS_PRESENCE_QUERY, {"class_id": class_id}).mappings().all()

    result = []
    for r in rows:
        seconds = r["seconds_since_seen"]
        online = seconds is not None and seconds <= ONLINE_WINDOW_SECONDS
        result.append(
            {
                "student_id": str(r["student_id"]),
                "online": online,
                "seconds_since_seen": seconds,
                # The open lesson and its course are shown only while online.
                "lesson": {"id": r["lesson_id"], "title": r["lesson_title"]}
                if online and r["lesson_id"]
                else None,
                "course": {"id": r["course_id"], "title": r["course_title"]}
                if online and r["course_id"]
                else None,
            }
        )
    return result