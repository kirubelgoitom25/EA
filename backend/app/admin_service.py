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

from app import supabase_admin
from app.account_rules import clean_password, normalize_phone, visible_email
from app.config import settings
from app.content_rules import ContentError, clean_text, make_id
from app.content_service import transaction
from app.models import Course, CourseAccess, PaymentRequest, Plan, Profile, StudentProfile
from app.payment_rules import (
    SOURCE_ADMIN,
    clean_access_days,
    clean_instructions,
    clean_price,
)
from app.payment_service import (
    _log,
    _now,
    grant,
    grant_membership,
    lock_student,
    membership_out,
    membership_row,
    plan_out,
    request_out,
    row_state,
)

PERSON_FIELDS = """
    p.id, p.name, u.email, p.username, p.phone, p.role, p.is_active, p.is_admin, p.class_id,
    p.created_at
"""


def _person_out(r) -> dict:
    return {
        "id": str(uuid.UUID(str(r["id"]))),
        "name": r["name"],
        # A student's hidden internal address is never shown.
        "email": visible_email(r["email"], settings.student_email_domain),
        "username": r["username"],
        "phone": r["phone"],
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
        term = query.strip()
        conditions = [
            "lower(p.name) like :q escape '!'",
            "lower(u.email) like :q escape '!'",
            "p.username like :q escape '!'",
        ]
        phone = normalize_phone(term)
        if phone:
            conditions.append("p.phone = :phone")
            params["phone"] = phone
        else:
            conditions.append("p.phone like :q escape '!'")
        where.append("(" + " or ".join(conditions) + ")")
        params["q"] = _like(term)
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
        select(PaymentRequest, Course.title, Plan.title)
        .outerjoin(Course, Course.id == PaymentRequest.course_id)
        .outerjoin(Plan, Plan.id == PaymentRequest.plan_id)
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
    details = db.get(StudentProfile, person_id)
    return {
        **person,
        "school": details.school if details else None,
        "pro": membership_out(membership_row(db, person_id)),
        "requests": [request_out(req, ct or pt or "") for req, ct, pt in requests],
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


def _changeable(db: Session, actor: uuid.UUID, person_id: uuid.UUID) -> Profile:
    target = db.get(Profile, person_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Person not found")
    # Together these mean nobody can lock the only admin out by accident.
    if person_id == actor:
        raise ContentError("You can't change your own account here", status_code=409)
    if target.is_admin:
        raise ContentError("The main admin's account can't be changed here", status_code=409)
    return target


def update_person(db: Session, actor: uuid.UUID, person_id: uuid.UUID, values: dict) -> dict:
    target = _changeable(db, actor, person_id)

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


# ---- passwords ----------------------------------------------------------------------


def set_temporary_password(db: Session, actor: uuid.UUID, person_id: uuid.UUID, password) -> dict:
    """There is no email or SMS yet, so a student who forgot their password asks EA, and the
    admin sets a temporary one to tell them. Their old password stops working at once."""
    _changeable(db, actor, person_id)
    password = clean_password(password)
    try:
        supabase_admin.set_password(str(person_id), password)
    except supabase_admin.AuthAdminError as error:
        if error.code == "weak_password":
            raise ContentError("Choose a stronger password")
        raise HTTPException(status_code=503, detail="Couldn't change the password. Please try again.")
    _log(actor, "password_set", person_id)
    return {"ok": True}


# ---- Pro ------------------------------------------------------------------------------


def _student(db: Session, person_id: uuid.UUID) -> Profile:
    student = db.get(Profile, person_id)
    if student is None or student.role != "student":
        raise HTTPException(status_code=404, detail="Student not found")
    return student


def grant_pro(db: Session, actor: uuid.UUID, person_id: uuid.UUID, access_days) -> dict:
    """Give or extend Pro with no payment. access_days None means permanent. Never touches
    the student's course access."""
    days = clean_access_days(access_days)
    _student(db, person_id)
    with transaction(db):
        lock_student(db, person_id)
        row = grant_membership(db, person_id, days, SOURCE_ADMIN, actor)
        db.flush()
        out = membership_out(row)
    _log(actor, "pro_granted", person_id)
    return out


def revoke_pro(db: Session, actor: uuid.UUID, person_id: uuid.UUID) -> dict:
    """Ends Pro now. Courses the student bought, or kept as an existing learner, stay open:
    those are course_access rows, which this never reads or writes."""
    _student(db, person_id)
    with transaction(db):
        lock_student(db, person_id)
        row = membership_row(db, person_id)
        if row is None:
            raise HTTPException(status_code=404, detail="This student has no Pro to revoke")
        if row.revoked_at is not None:
            raise ContentError("This Pro membership has already been revoked", status_code=409)
        row.revoked_at = _now()
        row.revoked_by = actor
        db.flush()
        out = membership_out(row)
    _log(actor, "pro_revoked", person_id)
    return out


# ---- Pro plans ------------------------------------------------------------------------

MAX_PLAN_TITLE = 80


def _plan_days(value) -> int:
    days = clean_access_days(value)
    if days is None:
        raise ContentError("A Pro plan needs a duration in days")
    return days


def _plan_price(value):
    price = clean_price(value)
    if not price:
        raise ContentError("A Pro plan needs a price above 0")
    return price


def list_plans(db: Session) -> list[dict]:
    rows = db.execute(select(Plan).order_by(Plan.sort_order, Plan.price, Plan.id)).scalars().all()
    return [plan_out(p) for p in rows]


def create_plan(db: Session, actor: uuid.UUID, values: dict) -> dict:
    title = clean_text(values.get("title"), "Title", MAX_PLAN_TITLE)
    instructions = clean_instructions(values.get("payment_instructions"))
    if not instructions:
        raise ContentError("Tell students how to pay for Pro")
    with transaction(db):
        plan = Plan(
            id=make_id(title, "pro"),
            title=title,
            price=_plan_price(values.get("price")),
            access_days=_plan_days(values.get("access_days")),
            payment_instructions=instructions,
            is_active=True,
            sort_order=len(db.execute(select(Plan.id)).all()),
        )
        db.add(plan)
        db.flush()
        out = plan_out(plan)
    _log(actor, "plan_created", plan.id)
    return out


def update_plan(db: Session, actor: uuid.UUID, plan_id: str, values: dict) -> dict:
    """Changing a price or duration never changes a request already sent: each request keeps
    a copy of the terms the student saw."""
    plan = db.get(Plan, plan_id)
    if plan is None:
        raise HTTPException(status_code=404, detail="Plan not found")
    changes = {}
    if values.get("title") is not None:
        changes["title"] = clean_text(values["title"], "Title", MAX_PLAN_TITLE)
    if values.get("price") is not None:
        changes["price"] = _plan_price(values["price"])
    if values.get("access_days") is not None:
        changes["access_days"] = _plan_days(values["access_days"])
    if values.get("payment_instructions") is not None:
        instructions = clean_instructions(values["payment_instructions"])
        if not instructions:
            raise ContentError("Tell students how to pay for Pro")
        changes["payment_instructions"] = instructions
    if values.get("is_active") is not None:
        changes["is_active"] = bool(values["is_active"])
    if values.get("sort_order") is not None:
        changes["sort_order"] = int(values["sort_order"])
    with transaction(db):
        for field, value in changes.items():
            setattr(plan, field, value)
        plan.updated_at = _now()
        db.flush()
        out = plan_out(plan)
    _log(actor, "plan_updated", plan_id)
    return out
