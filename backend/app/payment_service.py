"""Payment requests, course access and Pro membership.

Same shape as studio_service: every public function checks permission first, validates,
then writes inside one transaction.

payment_requests is the history. course_access (per course) and memberships (Pro) are the
current permissions. Decisions never rewrite history, and revoking keeps everything.

A request is for exactly one thing: a course (reviewed by its owner, or the main admin) or
a Pro plan (reviewed by the main admin only). Course access and Pro never touch each other:
nothing that grants, renews, expires or revokes Pro reads or writes course_access, so Pro
ending can never take away a course the student bought.

Every write to course_access or memberships first locks the student's profile row. Locking
the access row itself would not work: on a first approval that row does not exist yet, so
two approvals could both see "no access" and one would lose its time. The profile row
always exists. FOR NO KEY UPDATE does not block the student's own activity, whose foreign
keys only need a key share lock.
"""
import hashlib
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import bindparam, func, or_, select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import proof_storage, studio_access
from app.account_rules import visible_email
from app.config import settings
from app.content_rules import ContentError
from app.content_service import transaction
from app.models import Course, CourseAccess, Membership, PaymentRequest, Plan, Profile
from app.payment_rules import (
    ACTIVE,
    APPROVED,
    CLASS,
    EXPIRED,
    MAX_PENDING_PER_COURSE,
    MAX_PROOF_BYTES,
    MEMBERSHIP_PRO,
    PENDING,
    REJECTED,
    REVOKED,
    SOURCE_PAYMENT,
    TIER_PAID,
    TIER_PRO,
    aware,
    clean_note,
    membership_state,
    next_expiry,
    sniff_image,
)
from app.studio_rules import PUBLISHED

log = logging.getLogger("ea.payments")

EMAILS_QUERY = text("select id, email from auth.users where id in :ids").bindparams(
    bindparam("ids", expanding=True)
)

KIND_COURSE, KIND_PLAN = "course", "plan"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _log(actor: uuid.UUID, action: str, resource) -> None:
    # Who did what to which row. Never a name, an email or an image.
    log.info("actor=%s action=%s resource=%s", actor, action, resource)


# ---- shared -----------------------------------------------------------------------


def lock_student(db: Session, student_id: uuid.UUID) -> None:
    db.execute(
        select(Profile.id).where(Profile.id == student_id).with_for_update(key_share=True)
    ).first()


def grant(
    db: Session,
    student_id: uuid.UUID,
    course_id: str,
    access_days: Optional[int],
    source: str,
    actor: uuid.UUID,
) -> CourseAccess:
    """Add course access. The caller holds lock_student and is inside a transaction."""
    row = db.execute(
        select(CourseAccess)
        .where(CourseAccess.student_id == student_id, CourseAccess.course_id == course_id)
        .execution_options(populate_existing=True)
    ).scalar_one_or_none()
    now = _now()
    if row is None:
        row = CourseAccess(
            student_id=student_id,
            course_id=course_id,
            expires_at=next_expiry(False, None, None, access_days, now),
            granted_at=now,
            source=source,
            granted_by=actor,
        )
        db.add(row)
        return row
    row.expires_at = next_expiry(True, row.expires_at, row.revoked_at, access_days, now)
    row.revoked_at = None
    row.revoked_by = None
    row.source = source
    row.granted_by = actor
    return row


def membership_row(db: Session, student_id: uuid.UUID) -> Optional[Membership]:
    return db.execute(
        select(Membership)
        .where(Membership.student_id == student_id, Membership.tier == MEMBERSHIP_PRO)
        .execution_options(populate_existing=True)
    ).scalar_one_or_none()


def grant_membership(
    db: Session,
    student_id: uuid.UUID,
    access_days: Optional[int],
    source: str,
    actor: uuid.UUID,
) -> Membership:
    """Add Pro time, the same way as grant(): running time is extended, otherwise it counts
    from now. The caller holds lock_student and is inside a transaction. Never touches
    course_access."""
    row = membership_row(db, student_id)
    now = _now()
    if row is None:
        row = Membership(
            student_id=student_id,
            tier=MEMBERSHIP_PRO,
            expires_at=next_expiry(False, None, None, access_days, now),
            granted_at=now,
            source=source,
            granted_by=actor,
        )
        db.add(row)
        return row
    row.expires_at = next_expiry(True, row.expires_at, row.revoked_at, access_days, now)
    row.revoked_at = None
    row.revoked_by = None
    row.source = source
    row.granted_by = actor
    return row


def membership_out(row: Optional[Membership]) -> dict:
    """{"state": none|active|expired|revoked, "active", "expires_at", "source"}."""
    state = membership_state(
        row is not None, row.expires_at if row else None, row.revoked_at if row else None, _now()
    )
    return {
        "state": state,
        "active": state == ACTIVE,
        "expires_at": row.expires_at if row else None,
        "source": row.source if row else None,
    }


def row_state(row) -> str:
    """active, expired or revoked: a course_access or membership row on its own."""
    if row.revoked_at is not None:
        return REVOKED
    if row.expires_at is None or aware(row.expires_at) > _now():
        return ACTIVE
    return EXPIRED


def _unknown(student_id) -> dict:
    return {"id": str(student_id), "name": "Unknown", "email": None, "username": None, "phone": None}


def people_by_id(db: Session, ids) -> dict[str, dict]:
    """{id: {"id", "name", "email", "username", "phone"}} for these profiles, in two queries.
    A student's hidden internal email is never included."""
    ids = list({i for i in ids if i is not None})
    if not ids:
        return {}
    rows = db.execute(
        select(Profile.id, Profile.name, Profile.username, Profile.phone).where(Profile.id.in_(ids))
    ).all()
    emails = {
        str(uuid.UUID(str(r[0]))): r[1] for r in db.execute(EMAILS_QUERY, {"ids": ids}).all()
    }
    domain = settings.student_email_domain
    return {
        str(r.id): {
            "id": str(r.id),
            "name": r.name,
            "email": visible_email(emails.get(str(r.id)), domain),
            "username": r.username,
            "phone": r.phone,
        }
        for r in rows
    }


def _reviewable_clause(actor: uuid.UUID):
    # Only the owner reviews a course, and the main admin reviews all of them. A teacher
    # who merely teaches a class that has the course does not. Plan requests have no
    # course (an outer join gives NULL), so only the admin matches them.
    return or_(Course.owner_id == actor, studio_access.admin_clause(actor))


def _reviewable_course(db: Session, actor: uuid.UUID, course_id: str) -> Course:
    course = db.execute(
        select(Course).where(Course.id == course_id, _reviewable_clause(actor))
    ).scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


def _reviewable_request(db: Session, actor: uuid.UUID, request_id: uuid.UUID) -> PaymentRequest:
    found = db.execute(
        select(PaymentRequest)
        .outerjoin(Course, Course.id == PaymentRequest.course_id)
        .where(PaymentRequest.id == request_id, _reviewable_clause(actor))
    ).scalar_one_or_none()
    if found is None:
        raise HTTPException(status_code=404, detail="Request not found")
    return found


# ---- student ----------------------------------------------------------------------


def request_out(req: PaymentRequest, title: str) -> dict:
    return {
        "id": str(req.id),
        "kind": KIND_PLAN if req.plan_id else KIND_COURSE,
        "course_id": req.course_id,
        "plan_id": req.plan_id,
        # The course or plan title. Named course_title for older apps.
        "course_title": title,
        "status": req.status,
        "amount": req.amount,
        "currency": req.currency,
        "access_days": req.access_days,
        "review_note": req.review_note,
        "created_at": req.created_at,
        "reviewed_at": req.reviewed_at,
    }


def _check_can_buy(db: Session, student_id, class_id, course: Course) -> None:
    if course.status != PUBLISHED:
        raise ContentError("This course isn't available to buy right now", status_code=409)
    if course.access_tier == TIER_PRO:
        raise ContentError("This course is part of EA Pro", status_code=409)
    if course.access_tier != TIER_PAID or not course.price:
        raise ContentError("This course is free", status_code=409)
    entry = studio_access.access_for_student(db, student_id, class_id, [course.id])[course.id]
    if entry["state"] == CLASS:
        raise ContentError("Your class already has this course", status_code=409)
    if entry["state"] == ACTIVE and entry["expires_at"] is None:
        raise ContentError("You already have permanent access to this course", status_code=409)


def _target_clause(course_id: Optional[str], plan_id: Optional[str]):
    if plan_id is not None:
        return PaymentRequest.plan_id == plan_id
    return PaymentRequest.course_id == course_id


def _pending_with_image(db: Session, student_id, course_id, plan_id, sha256) -> Optional[PaymentRequest]:
    return db.execute(
        select(PaymentRequest).where(
            PaymentRequest.student_id == student_id,
            _target_clause(course_id, plan_id),
            PaymentRequest.proof_sha256 == sha256,
            PaymentRequest.status == PENDING,
        )
    ).scalar_one_or_none()


def _create_request(
    db: Session,
    student_id: uuid.UUID,
    data: bytes,
    title: str,
    amount,
    currency: str,
    access_days: Optional[int],
    course_id: Optional[str] = None,
    plan_id: Optional[str] = None,
) -> tuple[dict, bool]:
    """Checks the image, stores it and records the request. Shared by courses and plans.
    amount, currency and access_days are the terms the student sees right now."""
    if not data:
        raise ContentError("Choose a screenshot of your payment")
    if len(data) > MAX_PROOF_BYTES:
        raise ContentError("That image is too large (at most 5 MB)", status_code=413)
    image = sniff_image(data)
    if image is None:
        raise ContentError("Please upload a JPG, PNG or WebP image", status_code=415)
    media_type, extension = image
    sha256 = hashlib.sha256(data).hexdigest()

    # A double tap or a retry: the same image is already waiting, so nothing new is made.
    waiting = _pending_with_image(db, student_id, course_id, plan_id, sha256)
    if waiting is not None:
        return request_out(waiting, title), False

    # Plans count together: one Pro membership, whichever plan.
    target = PaymentRequest.plan_id.is_not(None) if plan_id else PaymentRequest.course_id == course_id
    pending = db.execute(
        select(func.count(PaymentRequest.id)).where(
            PaymentRequest.student_id == student_id, target, PaymentRequest.status == PENDING
        )
    ).scalar_one()
    if pending >= MAX_PENDING_PER_COURSE:
        raise ContentError(
            "You have several requests waiting. "
            "You can send another once one has been reviewed.",
            status_code=429,
        )

    request_id = uuid.uuid4()
    path = f"{student_id}/{request_id}.{extension}"  # never a name the client chose
    try:
        proof_storage.upload(path, data, media_type)
    except proof_storage.ProofStorageError as error:
        log.error("proof upload failed: %s", error)
        raise ContentError("Couldn't save your screenshot. Please try again.", status_code=503)

    req = PaymentRequest(
        id=request_id,
        student_id=student_id,
        course_id=course_id,
        plan_id=plan_id,
        amount=amount,
        currency=currency,
        access_days=access_days,
        proof_path=path,
        proof_type=media_type,
        proof_sha256=sha256,
        created_at=_now(),
    )
    try:
        with transaction(db):
            db.add(req)
            db.flush()
            result = request_out(req, title)
    except IntegrityError:
        # Two identical uploads raced, and the unique index let exactly one through.
        proof_storage.delete(path)
        winner = _pending_with_image(db, student_id, course_id, plan_id, sha256)
        if winner is None:
            raise
        return request_out(winner, title), False
    except Exception:
        proof_storage.delete(path)
        raise
    _log(student_id, "payment_request_created", request_id)
    return result, True


def submit_request(
    db: Session, student_id: uuid.UUID, class_id: Optional[str], course_id: str, data: bytes
) -> tuple[dict, bool]:
    """Returns (the request, whether it is new). The student sends only an image: the
    amount, currency and duration are read from the course here."""
    if course_id not in studio_access.visible_course_ids_for_student(db, student_id, class_id):
        raise HTTPException(status_code=404, detail="Course not found")
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    _check_can_buy(db, student_id, class_id, course)
    return _create_request(
        db, student_id, data, course.title, course.price, course.currency, course.access_days,
        course_id=course.id,
    )


def submit_plan_request(
    db: Session, student_id: uuid.UUID, plan_id: str, data: bytes
) -> tuple[dict, bool]:
    """Pro, the same way: only an image comes from the student; the terms come from the plan."""
    plan = db.get(Plan, plan_id)
    if plan is None or not plan.is_active:
        raise HTTPException(status_code=404, detail="Plan not found")
    current = membership_row(db, student_id)
    if current is not None and row_state(current) == ACTIVE and current.expires_at is None:
        raise ContentError("You already have permanent Pro", status_code=409)
    return _create_request(
        db, student_id, data, plan.title, plan.price, plan.currency, plan.access_days,
        plan_id=plan.id,
    )


def my_requests(db: Session, student_id: uuid.UUID) -> list[dict]:
    rows = db.execute(
        select(PaymentRequest, Course.title, Plan.title)
        .outerjoin(Course, Course.id == PaymentRequest.course_id)
        .outerjoin(Plan, Plan.id == PaymentRequest.plan_id)
        .where(PaymentRequest.student_id == student_id)
        .order_by(PaymentRequest.created_at.desc())
    ).all()
    return [request_out(req, course_title or plan_title or "") for req, course_title, plan_title in rows]


def active_plans(db: Session) -> list[dict]:
    rows = db.execute(
        select(Plan).where(Plan.is_active.is_(True)).order_by(Plan.sort_order, Plan.price, Plan.id)
    ).scalars().all()
    return [plan_out(p) for p in rows]


def plan_out(plan: Plan) -> dict:
    return {
        "id": plan.id,
        "title": plan.title,
        "price": plan.price,
        "currency": plan.currency,
        "access_days": plan.access_days,
        "payment_instructions": plan.payment_instructions,
        "is_active": plan.is_active,
        "sort_order": plan.sort_order,
    }


# ---- reviewing --------------------------------------------------------------------


def _review_items(db: Session, rows) -> list[dict]:
    """The review view of (request, course, plan) rows, in a fixed number of queries."""
    if not rows:
        return []
    requests = [req for req, _, _ in rows]
    student_ids = {r.student_id for r in requests}
    course_ids = {r.course_id for r in requests if r.course_id}
    people = people_by_id(db, student_ids | {r.reviewed_by for r in requests})
    held = {}
    if course_ids:
        held = {
            (a.student_id, a.course_id): a
            for a in db.execute(
                select(CourseAccess).where(
                    CourseAccess.student_id.in_(student_ids), CourseAccess.course_id.in_(course_ids)
                )
            ).scalars()
        }
    plan_students = {r.student_id for r in requests if r.plan_id}
    memberships = {}
    if plan_students:
        memberships = {
            m.student_id: m
            for m in db.execute(
                select(Membership).where(
                    Membership.student_id.in_(plan_students), Membership.tier == MEMBERSHIP_PRO
                )
            ).scalars()
        }
    reused = {
        r[0]
        for r in db.execute(
            select(PaymentRequest.proof_sha256)
            .where(PaymentRequest.proof_sha256.in_({r.proof_sha256 for r in requests}))
            .group_by(PaymentRequest.proof_sha256)
            .having(func.count(PaymentRequest.id) > 1)
        ).all()
    }

    now = _now()
    items = []
    for req, course, plan in rows:
        if req.plan_id:
            access = memberships.get(req.student_id)
            terms = plan
        else:
            access = held.get((req.student_id, req.course_id))
            terms = course
        after = None
        if req.status == PENDING:
            ends = next_expiry(
                access is not None,
                access.expires_at if access else None,
                access.revoked_at if access else None,
                req.access_days,
                now,
            )
            after = {"permanent": ends is None, "expires_at": ends}
        reviewer = people.get(str(req.reviewed_by)) if req.reviewed_by else None
        items.append(
            {
                "id": str(req.id),
                "kind": KIND_PLAN if req.plan_id else KIND_COURSE,
                "status": req.status,
                "student": people.get(str(req.student_id), _unknown(req.student_id)),
                "course": (
                    {
                        "id": course.id,
                        "title": course.title,
                        "owner_id": str(course.owner_id) if course.owner_id else None,
                        "price": course.price,
                        "currency": course.currency,
                        "access_days": course.access_days,
                    }
                    if course is not None
                    else None
                ),
                "plan": (
                    {
                        "id": plan.id,
                        "title": plan.title,
                        "price": plan.price,
                        "currency": plan.currency,
                        "access_days": plan.access_days,
                    }
                    if plan is not None
                    else None
                ),
                "amount": req.amount,
                "currency": req.currency,
                "access_days": req.access_days,
                "terms_changed": terms is not None
                and (
                    req.amount != terms.price
                    or req.currency != terms.currency
                    or req.access_days != terms.access_days
                ),
                "image_reused": req.proof_sha256 in reused,
                "current_access": (
                    {"state": row_state(access), "expires_at": access.expires_at} if access else None
                ),
                "after_approval": after,
                "review_note": req.review_note,
                "reviewed_by_name": reviewer["name"] if reviewer else None,
                "created_at": req.created_at,
                "reviewed_at": req.reviewed_at,
            }
        )
    return items


def _review_select(*columns):
    return (
        select(*columns)
        .select_from(PaymentRequest)
        .outerjoin(Course, Course.id == PaymentRequest.course_id)
        .outerjoin(Plan, Plan.id == PaymentRequest.plan_id)
    )


def list_for_review(
    db: Session,
    actor: uuid.UUID,
    status: Optional[str],
    course_id: Optional[str],
    teacher_id: Optional[uuid.UUID],
    limit: int,
    offset: int,
    kind: Optional[str] = None,
) -> dict:
    """Ownership is part of the query, so another teacher's rows are never even read."""
    scope = [_reviewable_clause(actor)]
    if status:
        scope.append(PaymentRequest.status == status)
    if course_id:
        scope.append(PaymentRequest.course_id == course_id)
    if teacher_id:
        scope.append(Course.owner_id == teacher_id)
    if kind == KIND_PLAN:
        scope.append(PaymentRequest.plan_id.is_not(None))
    elif kind == KIND_COURSE:
        scope.append(PaymentRequest.course_id.is_not(None))

    # The oldest waiting request comes first. Decided ones show the newest first.
    order = (
        PaymentRequest.created_at.asc() if status == PENDING else PaymentRequest.created_at.desc()
    )
    rows = db.execute(
        _review_select(PaymentRequest, Course, Plan)
        .where(*scope)
        .order_by(order, PaymentRequest.id)
        .limit(limit)
        .offset(offset)
    ).all()
    total = db.execute(_review_select(func.count(PaymentRequest.id)).where(*scope)).scalar_one()
    pending_total = db.execute(
        _review_select(func.count(PaymentRequest.id)).where(
            _reviewable_clause(actor), PaymentRequest.status == PENDING
        )
    ).scalar_one()
    return {"items": _review_items(db, rows), "total": total, "pending_total": pending_total}


def read_proof(db: Session, actor: uuid.UUID, request_id: uuid.UUID) -> tuple[bytes, str]:
    req = _reviewable_request(db, actor, request_id)
    try:
        return proof_storage.download(req.proof_path), req.proof_type
    except proof_storage.ProofStorageError as error:
        log.error("proof download failed: %s", error)
        raise ContentError("Couldn't load this image. Please try again.", status_code=503)


def _decide(db: Session, actor: uuid.UUID, request_id: uuid.UUID, status: str, note) -> int:
    """Move a request out of pending, or answer 409. The WHERE clause makes this safe
    against a double click, and against a teacher and the admin deciding at once."""
    changed = db.execute(
        update(PaymentRequest)
        .where(PaymentRequest.id == request_id, PaymentRequest.status == PENDING)
        .values(status=status, reviewed_by=actor, reviewed_at=_now(), review_note=note)
        .execution_options(synchronize_session=False)
    ).rowcount
    if changed == 0:
        raise ContentError("This request has already been decided", status_code=409)
    return changed


def _reviewed(db: Session, request_id: uuid.UUID) -> dict:
    row = db.execute(
        _review_select(PaymentRequest, Course, Plan)
        .where(PaymentRequest.id == request_id)
        .execution_options(populate_existing=True)
    ).one()
    return _review_items(db, [row])[0]


def approve(db: Session, actor: uuid.UUID, request_id: uuid.UUID) -> dict:
    req = _reviewable_request(db, actor, request_id)
    student_id, course_id, plan_id, access_days = (
        req.student_id, req.course_id, req.plan_id, req.access_days,
    )
    with transaction(db):
        lock_student(db, student_id)
        _decide(db, actor, request_id, APPROVED, None)
        # The copied duration: the student gets the deal they saw, whatever it is now.
        if plan_id:
            grant_membership(db, student_id, access_days, SOURCE_PAYMENT, actor)
        else:
            grant(db, student_id, course_id, access_days, SOURCE_PAYMENT, actor)
    _log(actor, "payment_request_approved", request_id)
    return _reviewed(db, request_id)


def reject(db: Session, actor: uuid.UUID, request_id: uuid.UUID, note) -> dict:
    _reviewable_request(db, actor, request_id)
    note = clean_note(note)
    with transaction(db):
        _decide(db, actor, request_id, REJECTED, note)
    _log(actor, "payment_request_rejected", request_id)
    return _reviewed(db, request_id)


# ---- who has access ---------------------------------------------------------------


def _access_out(row: CourseAccess, people: dict) -> dict:
    return {
        "student": people.get(str(row.student_id), _unknown(row.student_id)),
        "state": row_state(row),
        "expires_at": row.expires_at,
        "source": row.source,
        "granted_at": row.granted_at,
    }


def list_access(db: Session, actor: uuid.UUID, course_id: str) -> list[dict]:
    course = _reviewable_course(db, actor, course_id)
    rows = db.execute(
        select(CourseAccess)
        .where(CourseAccess.course_id == course.id)
        .order_by(CourseAccess.granted_at.desc())
    ).scalars().all()
    people = people_by_id(db, [r.student_id for r in rows])
    return [_access_out(r, people) for r in rows]


def revoke(db: Session, actor: uuid.UUID, course_id: str, student_id: uuid.UUID) -> dict:
    """Ends access now. The row and every payment request stay."""
    course = _reviewable_course(db, actor, course_id)
    with transaction(db):
        lock_student(db, student_id)
        row = db.execute(
            select(CourseAccess)
            .where(CourseAccess.student_id == student_id, CourseAccess.course_id == course.id)
            .execution_options(populate_existing=True)
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="This student has no access to revoke")
        if row.revoked_at is not None:
            raise ContentError("This access has already been revoked", status_code=409)
        row.revoked_at = _now()
        row.revoked_by = actor
        db.flush()
    _log(actor, "access_revoked", f"{course.id}:{student_id}")
    return _access_out(row, people_by_id(db, [student_id]))
