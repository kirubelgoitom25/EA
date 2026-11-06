"""What the main admin can do beyond the shared teacher routes.

Reuses what already exists: profiles.is_active turns an account off (enforced on every
request by get_current_user), and profiles.role promotes a teacher. There is deliberately
no way here to create, remove or change an admin.
"""
import uuid
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.content_rules import ContentError
from app.content_service import transaction
from app.models import Course, CourseAccess, PaymentRequest, Profile
from app.payment_rules import SOURCE_ADMIN, clean_access_days
from app.payment_service import _log, grant, lock_student, request_out, row_state

PERSON_FIELDS = """
    p.id, p.name, u.email, p.role, p.is_active, p.is_admin, p.class_id, p.created_at
"""


def _person_out(r) -> dict:
    return {
        "id": str(uuid.UUID(str(r["id"]))),
        "name": r["name"],
        "email": r["email"],
        "role": r["role"],
        "is_active": bool(r["is_active"]),
        "is_admin": bool(r["is_admin"]),
        "class_id": r["class_id"],
        "created_at": r["created_at"],
    }


def _like(term: str) -> str:
    escaped = term.lower().replace("!", "!!").replace("%", "!%").replace("_", "!_")
    return f"%{escaped}%"


def list_people(
    db: Session, role: Optional[str], query: Optional[str], limit: int, offset: int
) -> dict:
    where = ["1 = 1"]
    params: dict = {"limit": limit, "offset": offset}
    if role:
        where.append("p.role = :role")
        params["role"] = role
    if query and query.strip():
        where.append(
            "(lower(p.name) like :q escape '!' or lower(u.email) like :q escape '!')"
        )
        params["q"] = _like(query.strip())
    condition = " and ".join(where)
    source = "from profiles p join auth.users u on u.id = p.id"
    rows = db.execute(
        text(
            f"select {PERSON_FIELDS} {source} where {condition} "
            "order by lower(p.name), p.id limit :limit offset :offset"
        ),
        params,
    ).mappings().all()
    total = db.execute(text(f"select count(*) {source} where {condition}"), params).scalar_one()
    return {"items": [_person_out(r) for r in rows], "total": total}


def _person(db: Session, person_id: uuid.UUID) -> dict:
    row = db.execute(
        text(f"select {PERSON_FIELDS} from profiles p join auth.users u on u.id = p.id where p.id = :id"),
        {"id": person_id},
    ).mappings().first()
    if row is None:
        raise HTTPException(status_code=404, detail="Person not found")
    return _person_out(row)


def person_detail(db: Session, person_id: uuid.UUID) -> dict:
    person = _person(db, person_id)
    requests = db.execute(
        select(PaymentRequest, Course.title)
        .join(Course, Course.id == PaymentRequest.course_id)
        .where(PaymentRequest.student_id == person_id)
        .order_by(PaymentRequest.created_at.desc())
    ).all()
    access = db.execute(
        select(CourseAccess, Course.title)
        .join(Course, Course.id == CourseAccess.course_id)
        .where(CourseAccess.student_id == person_id)
        .order_by(Course.title)
    ).all()
    owned = db.execute(
        select(Course).where(Course.owner_id == person_id).order_by(Course.title)
    ).scalars().all()
    return {
        **person,
        "requests": [request_out(req, title) for req, title in requests],
        "access": [
            {
                "course_id": row.course_id,
                "course_title": title,
                "state": row_state(row),
                "expires_at": row.expires_at,
                "source": row.source,
            }
            for row, title in access
        ],
        "owned_courses": [{"id": c.id, "title": c.title, "status": c.status} for c in owned],
    }


def update_person(db: Session, actor: uuid.UUID, person_id: uuid.UUID, values: dict) -> dict:
    target = db.get(Profile, person_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Person not found")
    # Together these mean nobody can lock the only admin out by accident.
    if person_id == actor:
        raise ContentError("You can't change your own account here", status_code=409)
    if target.is_admin:
        raise ContentError("The main admin's account can't be changed here", status_code=409)

    role = values.get("role")
    is_active = values.get("is_active")
    if role == "student" and target.role == "teacher":
        owns = db.execute(select(Course.id).where(Course.owner_id == person_id).limit(1)).first()
        if owns is not None:
            raise ContentError(
                "Move this teacher's courses to another owner first", status_code=409
            )
    with transaction(db):
        if role is not None:
            target.role = role
        if is_active is not None:
            target.is_active = is_active
    _log(actor, "person_updated", f"{person_id}:{sorted(k for k in values)}")
    return _person(db, person_id)


def set_owner(db: Session, actor: uuid.UUID, course_id: str, owner_id: str) -> dict:
    """Moves a course to another teacher. Pending requests follow it, because the reviewer
    comes from the owner. A published legacy course that gains an owner becomes visible to
    all students, the same as any other published owned course."""
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    try:
        new_owner = db.get(Profile, uuid.UUID(owner_id))
    except ValueError:
        new_owner = None
    if new_owner is None or new_owner.role != "teacher" or not new_owner.is_active:
        raise ContentError("The new owner must be an active teacher")
    with transaction(db):
        course.owner_id = new_owner.id
    _log(actor, "course_owner_changed", f"{course_id}->{new_owner.id}")
    return {"id": course.id, "owner_id": str(new_owner.id)}


def grant_access(
    db: Session, actor: uuid.UUID, course_id: str, student_id: uuid.UUID, access_days
) -> dict:
    """Grant, or extend, access with no payment. access_days None means permanent."""
    days = clean_access_days(access_days)
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    student = db.get(Profile, student_id)
    if student is None or student.role != "student":
        raise HTTPException(status_code=404, detail="Student not found")
    with transaction(db):
        lock_student(db, student_id)
        row = grant(db, student_id, course.id, days, SOURCE_ADMIN, actor)
        db.flush()
        out = {
            "course_id": course.id,
            "course_title": course.title,
            "state": row_state(row),
            "expires_at": row.expires_at,
            "source": row.source,
        }
    _log(actor, "access_granted", f"{course.id}:{student_id}")
    return out
