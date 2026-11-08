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
    kind: Literal["course", "plan"] = "course"
    course_id: Optional[str] = None
    plan_id: Optional[str] = None
    # The course or plan title (the name is kept for older apps).
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
    # A real email only. Students who signed up by phone have none to show.
    email: Optional[str] = None
    username: Optional[str] = None
    phone: Optional[str] = None


class ReviewCourseOut(BaseModel):
    id: str
    title: str
    owner_id: Optional[str] = None
    # Today's terms, so a reviewer can see when they differ from what the student saw.
    price: Decimal
    currency: str
    access_days: Optional[int] = None


class ReviewPlanOut(BaseModel):
    id: str
    title: str
    price: Decimal
    currency: str
    access_days: int


class CurrentAccessOut(BaseModel):
    state: str  # active, expired or revoked
    expires_at: Optional[datetime] = None


class AfterApprovalOut(BaseModel):
    permanent: bool
    expires_at: Optional[datetime] = None


class ReviewRequestOut(BaseModel):
    id: str
    kind: Literal["course", "plan"] = "course"
    status: str
    student: PersonRefOut
    # Exactly one of these.
    course: Optional[ReviewCourseOut] = None
    plan: Optional[ReviewPlanOut] = None
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
    username: Optional[str] = None
    phone: Optional[str] = None
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


class MembershipOut(BaseModel):
    state: str  # none, active, expired or revoked
    active: bool
    expires_at: Optional[datetime] = None
    source: Optional[str] = None


class PersonDetailOut(PersonOut):
    school: Optional[str] = None
    pro: MembershipOut
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


class TemporaryPasswordIn(StrictIn):
    password: str


class ProGrantIn(StrictIn):
    # Required, and may be null: null means permanent.
    access_days: Optional[int]


# ---- Pro plans ----------------------------------------------------------------------


class PlanOut(BaseModel):
    id: str
    title: str
    price: Decimal
    currency: str
    access_days: int
    payment_instructions: str
    is_active: bool
    sort_order: int


class PlanCreateIn(StrictIn):
    title: str
    price: Decimal
    access_days: int
    payment_instructions: str


class PlanUpdateIn(StrictIn):
    title: Optional[str] = None
    price: Optional[Decimal] = None
    access_days: Optional[int] = None
    payment_instructions: Optional[str] = None
    is_active: Optional[StrictBool] = None
    sort_order: Optional[int] = None
