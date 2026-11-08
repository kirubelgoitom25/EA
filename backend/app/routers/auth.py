import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app import account_service, payment_service, rate_limit
from app.account_rules import normalize_phone
from app.content_schemas import StrictIn
from app.database import get_db
from app.deps import get_current_user, require_student
from app.schemas import (
    LoginEmailOut,
    MyProfileOut,
    RegisteredOut,
    UserOut,
)

router = APIRouter(prefix="/auth", tags=["auth"])
profile_router = APIRouter(tags=["auth"])

# Per network, per phone or username, and overall. See app/rate_limit.py.
TEN_MINUTES = 600
REGISTER_LIMITS = [("network", 30, TEN_MINUTES), ("all", 300, TEN_MINUTES)]
RESOLVE_LIMITS = [("network", 120, TEN_MINUTES), ("all", 3000, TEN_MINUTES)]
RESOLVE_PER_TARGET = 20


class RegisterIn(StrictIn):
    # Optional here so a missing field gets the same friendly message as a bad one.
    username: Optional[str] = None
    phone: Optional[str] = None
    password: Optional[str] = None
    school: Optional[str] = None


class ResolveLoginIn(StrictIn):
    identifier: Optional[str] = None


class ProfileUpdateIn(StrictIn):
    username: Optional[str] = None
    phone: Optional[str] = None
    school: Optional[str] = None


@router.get("/me", response_model=UserOut)
def me(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    if current_user["role"] != "student":
        return current_user
    student_id = uuid.UUID(current_user["id"])
    profile = account_service.my_profile(db, student_id)
    return {
        **current_user,
        "username": profile["username"],
        "phone": profile["phone"],
        "profile_complete": profile["profile_complete"],
        "pro": payment_service.membership_out(payment_service.membership_row(db, student_id)),
    }


@router.post("/register", response_model=RegisteredOut, status_code=201)
def register(body: RegisterIn, request: Request, db: Session = Depends(get_db)):
    """Public. Creates a student account and answers with the address to sign in with."""
    rate_limit.check("register", request, REGISTER_LIMITS)
    phone = normalize_phone(body.phone) or (body.phone or "").strip()
    rate_limit.check("register", request, [(f"target:{phone}", 5, TEN_MINUTES)])
    return account_service.register(db, body.model_dump())


@router.post("/resolve-login", response_model=LoginEmailOut)
def resolve_login(body: ResolveLoginIn, request: Request, db: Session = Depends(get_db)):
    """Public. Phone number or username in, the address to sign in with out."""
    target = (body.identifier or "").strip().lower()
    rate_limit.check(
        "resolve",
        request,
        RESOLVE_LIMITS + [(f"target:{target}", RESOLVE_PER_TARGET, TEN_MINUTES)],
    )
    return account_service.resolve_login(db, body.identifier)


@profile_router.get("/me/profile", response_model=MyProfileOut)
def my_profile(current_user: dict = Depends(require_student), db: Session = Depends(get_db)):
    return account_service.my_profile(db, uuid.UUID(current_user["id"]))


@profile_router.patch("/me/profile", response_model=MyProfileOut)
def update_my_profile(
    body: ProfileUpdateIn,
    current_user: dict = Depends(require_student),
    db: Session = Depends(get_db),
):
    return account_service.update_my_profile(
        db, uuid.UUID(current_user["id"]), body.model_dump(exclude_none=True)
    )
