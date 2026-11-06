"""Payment requests and course access.

Same shape as studio_service: every public function checks permission first, validates,
then writes inside one transaction.

payment_requests is the history and course_access is the current permission. Decisions
never rewrite history, and revoking keeps both.

Every write to course_access first locks the student's profile row. Locking course_access
itself would not work: on a first approval that row does not exist yet, so two approvals
could both see "no access" and one would lose its time. The profile row always exists.
FOR NO KEY UPDATE does not block the student's own activity, whose foreign keys only need
a key share lock.
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
from app.content_rules import ContentError
from app.content_service import transaction
from app.models import Course, CourseAccess, PaymentRequest, Profile
from app.payment_rules import (
    ACTIVE,
    APPROVED,
    CLASS,
    EXPIRED,
    MAX_PENDING_PER_COURSE,
    MAX_PROOF_BYTES,
    PENDING,
    REJECTED,
    REVOKED,
    SOURCE_PAYMENT,
    access_state,
    aware,
    clean_note,
    next_expiry,
    sniff_image,
)
from app.studio_rules import PUBLISHED

log = logging.getLogger("ea.payments")

EMAILS_QUERY = text("select id, email from auth.users where id in :ids").bindparams(
    bindparam("ids", expanding=True)
)


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
    """Add access. The caller holds lock_student and is inside a transaction."""
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


def row_state(row: CourseAccess) -> str:
    """active, expired or revoked: the row on its own, ignoring price and class."""
    if row.revoked_at is not None:
        return REVOKED
    if row.expires_at is None or aware(row.expires_at) > _now():
        return ACTIVE
    return EXPIRED


def people_by_id(db: Session, ids) -> dict[str, dict]:
    """{id: {"id", "name", "email"}} for these profiles, in two queries."""
    ids = list({i for i in ids if i is not None})
    if not ids:
        return {}
    names = dict(db.execute(select(Profile.id, Profile.name).where(Profile.id.in_(ids))).all())
    emails = {
        str(uuid.UUID(str(r[0]))): r[1] for r in db.execute(EMAILS_QUERY, {"ids": ids}).all()
    }
    return {
        str(i): {"id": str(i), "name": name, "email": emails.get(str(i))}
        for i, name in names.items()
    }


def _reviewable_clause(actor: uuid.UUID):
    # Only the owner reviews a course, and the main admin reviews all of them. A teacher
    # who merely teaches a class that has the course does not.
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
        .join(Course, Course.id == PaymentRequest.course_id)
        .where(PaymentRequest.id == request_id, _reviewable_clause(actor))
    ).scalar_one_or_none()
    if found is None:
        raise HTTPException(status_code=404, detail="Request not found")
    return found


# ---- student ----------------------------------------------------------------------


def request_out(req: PaymentRequest, course_title: str) -> dict:
    return {
        "id": str(req.id),
        "course_id": req.course_id,
        "course_title": course_title,
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
    if not course.price:
        raise ContentError("This course is free", status_code=409)
    entry = studio_access.access_for_student(db, student_id, class_id, [course.id])[course.id]
    if entry["state"] == CLASS:
        raise ContentError("Your class already has this course", status_code=409)
    if entry["state"] == ACTIVE and entry["expires_at"] is None:
        raise ContentError("You already have permanent access to this course", status_code=409)


def _pending_with_image(db: Session, student_id, course_id, sha256) -> Optional[PaymentRequest]:
    return db.execute(
        select(PaymentRequest).where(
            PaymentRequest.student_id == student_id,
            PaymentRequest.course_id == course_id,
            PaymentRequest.proof_sha256 == sha256,
            PaymentRequest.status == PENDING,
        )
    ).scalar_one_or_none()


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
    waiting = _pending_with_image(db, student_id, course_id, sha256)
    if waiting is not None:
        return request_out(waiting, course.title), False

    pending = db.execute(
        select(func.count(PaymentRequest.id)).where(
            PaymentRequest.student_id == student_id,
            PaymentRequest.course_id == course_id,
            PaymentRequest.status == PENDING,
        )
    ).scalar_one()
    if pending >= MAX_PENDING_PER_COURSE:
        raise ContentError(
            "You have several requests waiting for this course. "
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
        amount=course.price,
        currency=course.currency,
        access_days=course.access_days,
        proof_path=path,
        proof_type=media_type,
        proof_sha256=sha256,
        created_at=_now(),
    )
    try:
        with transaction(db):
            db.add(req)
            db.flush()
            result = request_out(req, course.title)
    except IntegrityError:
        # Two identical uploads raced, and the unique index let exactly one through.
        proof_storage.delete(path)
        winner = _pending_with_image(db, student_id, course_id, sha256)
        if winner is None:
            raise
        return request_out(winner, course.title), False
    except Exception:
        proof_storage.delete(path)
        raise
    _log(student_id, "payment_request_created", request_id)
    return result, True


def my_requests(db: Session, student_id: uuid.UUID) -> list[dict]:
    rows = db.execute(
        select(PaymentRequest, Course.title)
        .join(Course, Course.id == PaymentRequest.course_id)
        .where(PaymentRequest.student_id == student_id)
        .order_by(PaymentRequest.created_at.desc())
    ).all()
    return [request_out(req, title) for req, title in rows]


# ---- reviewing --------------------------------------------------------------------


def _review_items(db: Session, rows) -> list[dict]:
    """The review view of (request, course) rows, in a fixed number of queries."""
    if not rows:
        return []
    requests = [req for req, _ in rows]
    student_ids = {r.student_id for r in requests}
    course_ids = {r.course_id for r in requests}
    people = people_by_id(db, student_ids | {r.reviewed_by for r in requests})
    held = {
        (a.student_id, a.course_id): a
        for a in db.execute(
            select(CourseAccess).where(
                CourseAccess.student_id.in_(student_ids), CourseAccess.course_id.in_(course_ids)
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
    for req, course in rows:
        access = held.get((req.student_id, req.course_id))
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
                "status": req.status,
                "student": people.get(
                    str(req.student_id), {"id": str(req.student_id), "name": "Unknown", "email": None}
                ),
                "course": {
                    "id": course.id,
                    "title": course.title,
                    "owner_id": str(course.owner_id) if course.owner_id else None,
                    "price": course.price,
                    "currency": course.currency,
                    "access_days": course.access_days,
                },
                "amount": req.amount,
                "currency": req.currency,
                "access_days": req.access_days,
                "terms_changed": (
                    req.amount != course.price
                    or req.currency != course.currency
                    or req.access_days != course.access_days
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


def list_for_review(
    db: Session,
    actor: uuid.UUID,
    status: Optional[str],
    course_id: Optional[str],
    teacher_id: Optional[uuid.UUID],
    limit: int,
    offset: int,
) -> dict:
    """Ownership is part of the query, so another teacher's rows are never even read."""
    scope = [_reviewable_clause(actor)]
    if status:
        scope.append(PaymentRequest.status == status)
    if course_id:
        scope.append(PaymentRequest.course_id == course_id)
    if teacher_id:
        scope.append(Course.owner_id == teacher_id)

    # The oldest waiting request comes first. Decided ones show the newest first.
    order = (
        PaymentRequest.created_at.asc() if status == PENDING else PaymentRequest.created_at.desc()
    )
    rows = db.execute(
        select(PaymentRequest, Course)
        .join(Course, Course.id == PaymentRequest.course_id)
        .where(*scope)
        .order_by(order, PaymentRequest.id)
        .limit(limit)
        .offset(offset)
    ).all()
    total = db.execute(
        select(func.count(PaymentRequest.id))
        .join(Course, Course.id == PaymentRequest.course_id)
        .where(*scope)
    ).scalar_one()
    pending_total = db.execute(
        select(func.count(PaymentRequest.id))
        .join(Course, Course.id == PaymentRequest.course_id)
        .where(_reviewable_clause(actor), PaymentRequest.status == PENDING)
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
        select(PaymentRequest, Course)
        .join(Course, Course.id == PaymentRequest.course_id)
        .where(PaymentRequest.id == request_id)
        .execution_options(populate_existing=True)
    ).one()
    return _review_items(db, [row])[0]


def approve(db: Session, actor: uuid.UUID, request_id: uuid.UUID) -> dict:
    req = _reviewable_request(db, actor, request_id)
    student_id, course_id, access_days = req.student_id, req.course_id, req.access_days
    with transaction(db):
        lock_student(db, student_id)
        _decide(db, actor, request_id, APPROVED, None)
        # The copied duration: the student gets the deal they saw, whatever it is now.
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


def list_access(db: Session, actor: uuid.UUID, course_id: str) -> list[dict]:
    course = _reviewable_course(db, actor, course_id)
    rows = db.execute(
        select(CourseAccess)
        .where(CourseAccess.course_id == course.id)
        .order_by(CourseAccess.granted_at.desc())
    ).scalars().all()
    people = people_by_id(db, [r.student_id for r in rows])
    return [
        {
            "student": people.get(
                str(r.student_id), {"id": str(r.student_id), "name": "Unknown", "email": None}
            ),
            "state": row_state(r),
            "expires_at": r.expires_at,
            "source": r.source,
            "granted_at": r.granted_at,
        }
        for r in rows
    ]


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
    people = people_by_id(db, [student_id])
    return {
        "student": people.get(str(student_id), {"id": str(student_id), "name": "Unknown", "email": None}),
        "state": row_state(row),
        "expires_at": row.expires_at,
        "source": row.source,
        "granted_at": row.granted_at,
    }
