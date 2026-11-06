"""Payment requests and course access.

Student routes are limited to the student's own data. Teacher routes need a teacher
account and answer only for courses that teacher owns; the main admin sees them all
through the same routes, so there is no second workflow to keep in step.
"""
import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Query, Response, UploadFile
from sqlalchemy.orm import Session

from app import payment_service
from app.database import get_db
from app.deps import require_student, require_teacher
from app.payment_rules import MAX_PROOF_BYTES
from app.payment_schemas import (
    AccessRowOut,
    MyPaymentRequestOut,
    RejectIn,
    ReviewListOut,
    ReviewRequestOut,
)

student_router = APIRouter(tags=["payments"])
teacher_router = APIRouter(prefix="/teacher", tags=["payments"])


def _uid(current_user: dict) -> uuid.UUID:
    return uuid.UUID(current_user["id"])


# ---- student ----------------------------------------------------------------------


@student_router.post(
    "/courses/{course_id}/payment-requests",
    response_model=MyPaymentRequestOut,
    status_code=201,
)
def submit_payment_request(
    course_id: str,
    response: Response,
    proof: UploadFile = File(...),
    current_user: dict = Depends(require_student),
    db: Session = Depends(get_db),
):
    # One byte past the limit is enough to know it is too large.
    data = proof.file.read(MAX_PROOF_BYTES + 1)
    result, created = payment_service.submit_request(
        db, _uid(current_user), current_user.get("class_id"), course_id, data
    )
    if not created:
        response.status_code = 200
    return result


@student_router.get("/me/payment-requests", response_model=list[MyPaymentRequestOut])
def my_payment_requests(
    current_user: dict = Depends(require_student), db: Session = Depends(get_db)
):
    return payment_service.my_requests(db, _uid(current_user))


# ---- reviewing --------------------------------------------------------------------


@teacher_router.get("/payment-requests", response_model=ReviewListOut)
def payment_requests(
    status: Optional[Literal["pending", "approved", "rejected"]] = Query(None),
    course_id: Optional[str] = Query(None),
    teacher_id: Optional[uuid.UUID] = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return payment_service.list_for_review(
        db, _uid(current_user), status, course_id, teacher_id, limit, offset
    )


@teacher_router.get("/payment-requests/{request_id}/proof")
def payment_proof(
    request_id: uuid.UUID,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    # Streamed through here so the bucket stays private and the same ownership check
    # applies. A signed link would work for anyone who got hold of it.
    data, media_type = payment_service.read_proof(db, _uid(current_user), request_id)
    return Response(
        content=data,
        media_type=media_type,
        headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
    )


@teacher_router.post("/payment-requests/{request_id}/approve", response_model=ReviewRequestOut)
def approve_request(
    request_id: uuid.UUID,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return payment_service.approve(db, _uid(current_user), request_id)


@teacher_router.post("/payment-requests/{request_id}/reject", response_model=ReviewRequestOut)
def reject_request(
    request_id: uuid.UUID,
    body: Optional[RejectIn] = None,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return payment_service.reject(
        db, _uid(current_user), request_id, body.note if body else None
    )


@teacher_router.get("/courses/{course_id}/access", response_model=list[AccessRowOut])
def course_access(
    course_id: str,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return payment_service.list_access(db, _uid(current_user), course_id)


@teacher_router.delete("/courses/{course_id}/access/{student_id}", response_model=AccessRowOut)
def revoke_access(
    course_id: str,
    student_id: uuid.UUID,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return payment_service.revoke(db, _uid(current_user), course_id, student_id)
