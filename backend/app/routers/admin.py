"""Main admin routes. Everyone else gets the same 404 as a route that does not exist."""
import uuid
from typing import Literal, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app import admin_service
from app.database import get_db
from app.deps import require_admin
from app.payment_schemas import (
    GrantIn,
    MembershipOut,
    OwnerIn,
    PeopleListOut,
    PersonAccessOut,
    PersonDetailOut,
    PersonOut,
    PersonUpdateIn,
    PlanCreateIn,
    PlanOut,
    PlanUpdateIn,
    ProGrantIn,
    TemporaryPasswordIn,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/people", response_model=PeopleListOut)
def people(
    role: Optional[Literal["student", "teacher"]] = Query(None),
    q: Optional[str] = Query(None, max_length=100),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return admin_service.list_people(db, role, q, limit, offset)


@router.get("/people/{person_id}", response_model=PersonDetailOut)
def person(
    person_id: uuid.UUID,
    current_user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return admin_service.person_detail(db, person_id)


@router.patch("/people/{person_id}", response_model=PersonOut)
def update_person(
    person_id: uuid.UUID,
    body: PersonUpdateIn,
    current_user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return admin_service.update_person(
        db, uuid.UUID(current_user["id"]), person_id, body.model_dump(exclude_none=True)
    )


@router.put("/courses/{course_id}/owner")
def set_owner(
    course_id: str,
    body: OwnerIn,
    current_user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return admin_service.set_owner(db, uuid.UUID(current_user["id"]), course_id, body.owner_id)


@router.put("/courses/{course_id}/access/{student_id}", response_model=PersonAccessOut)
def grant_access(
    course_id: str,
    student_id: uuid.UUID,
    body: GrantIn,
    current_user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return admin_service.grant_access(
        db, uuid.UUID(current_user["id"]), course_id, student_id, body.access_days
    )


def _actor(current_user: dict) -> uuid.UUID:
    return uuid.UUID(current_user["id"])


@router.put("/people/{person_id}/password")
def set_temporary_password(
    person_id: uuid.UUID,
    body: TemporaryPasswordIn,
    current_user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return admin_service.set_temporary_password(db, _actor(current_user), person_id, body.password)


@router.put("/people/{person_id}/pro", response_model=MembershipOut)
def grant_pro(
    person_id: uuid.UUID,
    body: ProGrantIn,
    current_user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return admin_service.grant_pro(db, _actor(current_user), person_id, body.access_days)


@router.delete("/people/{person_id}/pro", response_model=MembershipOut)
def revoke_pro(
    person_id: uuid.UUID,
    current_user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return admin_service.revoke_pro(db, _actor(current_user), person_id)


@router.get("/plans", response_model=list[PlanOut])
def plans(current_user: dict = Depends(require_admin), db: Session = Depends(get_db)):
    return admin_service.list_plans(db)


@router.post("/plans", response_model=PlanOut, status_code=201)
def create_plan(
    body: PlanCreateIn,
    current_user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return admin_service.create_plan(db, _actor(current_user), body.model_dump())


@router.patch("/plans/{plan_id}", response_model=PlanOut)
def update_plan(
    plan_id: str,
    body: PlanUpdateIn,
    current_user: dict = Depends(require_admin),
    db: Session = Depends(get_db),
):
    return admin_service.update_plan(db, _actor(current_user), plan_id, body.model_dump(exclude_none=True))
