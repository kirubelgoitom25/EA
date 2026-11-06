"""Request and response models for payment requests, course access and the admin.

Requests refuse unknown fields. Nothing a student sends can set a price: their upload
carries only the image.
"""
from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, StrictBool

from app.content_schemas import StrictIn


class MyPaymentRequestOut(BaseModel):
    id: str
    course_id: str
    course_title: str
    status: str
    amount: Decimal
    currency: str
    access_days: Optional[int] = None
    review_note: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None


class PersonRefOut(BaseModel):
    id: str
    name: str
    email: Optional[str] = None


class ReviewCourseOut(BaseModel):
    id: str
    title: str
    owner_id: Optional[str] = None
    # Today's terms, so a reviewer can see when they differ from what the student saw.
    price: Decimal
    currency: str
    access_days: Optional[int] = None


class CurrentAccessOut(BaseModel):
    state: str  # active, expired or revoked
    expires_at: Optional[datetime] = None


class AfterApprovalOut(BaseModel):
    permanent: bool
    expires_at: Optional[datetime] = None


class ReviewRequestOut(BaseModel):
    id: str
    status: str
    student: PersonRefOut
    course: ReviewCourseOut
    amount: Decimal
    currency: str
    access_days: Optional[int] = None
    terms_changed: bool
    # The same screenshot appears on another request. A warning only.
    image_reused: bool
    current_access: Optional[CurrentAccessOut] = None
    # Pending requests only: what approving would give the student.
    after_approval: Optional[AfterApprovalOut] = None
    review_note: Optional[str] = None
    reviewed_by_name: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None


class ReviewListOut(BaseModel):
    items: list[ReviewRequestOut]
    total: int
    pending_total: int


class RejectIn(StrictIn):
    note: Optional[str] = None


class AccessRowOut(BaseModel):
    student: PersonRefOut
    state: str
    expires_at: Optional[datetime] = None
    source: str
    granted_at: datetime


# ---- admin ------------------------------------------------------------------------


class PersonOut(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    role: str
    is_active: bool
    is_admin: bool
    class_id: Optional[str] = None
    created_at: datetime


class PeopleListOut(BaseModel):
    items: list[PersonOut]
    total: int


class PersonCourseOut(BaseModel):
    id: str
    title: str
    status: str


class PersonAccessOut(BaseModel):
    course_id: str
    course_title: str
    state: str
    expires_at: Optional[datetime] = None
    source: str


class PersonDetailOut(PersonOut):
    requests: list[MyPaymentRequestOut]
    access: list[PersonAccessOut]
    owned_courses: list[PersonCourseOut]


class PersonUpdateIn(StrictIn):
    # Deliberately no is_admin: no API can create or remove an admin.
    is_active: Optional[StrictBool] = None
    role: Optional[Literal["student", "teacher"]] = None


class OwnerIn(StrictIn):
    owner_id: str


class GrantIn(StrictIn):
    # Required, and may be null: null means permanent.
    access_days: Optional[int]
