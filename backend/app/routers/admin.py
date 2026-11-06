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
    OwnerIn,
    PeopleListOut,
    PersonAccessOut,
    PersonDetailOut,
    PersonOut,
    PersonUpdateIn,
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
