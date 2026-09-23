import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_teacher
from app.schemas import StudentOut

router = APIRouter(prefix="/students", tags=["students"])

STUDENT_QUERY = """
    select p.id, p.name, u.email, p.role, p.is_active, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.role = 'student'
"""


def _row_to_student(row) -> dict:
    return {
        "id": str(row["id"]),
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "is_active": row["is_active"],
        "created_at": row["created_at"],
    }


@router.get("", response_model=list[StudentOut])
def list_students(_: dict = Depends(require_teacher), db: Session = Depends(get_db)):
    rows = db.execute(text(STUDENT_QUERY + " order by p.name")).mappings().all()
    return [_row_to_student(row) for row in rows]


@router.get("/{student_id}", response_model=StudentOut)
def get_student(
    student_id: str, _: dict = Depends(require_teacher), db: Session = Depends(get_db)
):
    try:
        parsed_id = uuid.UUID(student_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Student not found")

    row = (
        db.execute(
            text(STUDENT_QUERY + " and p.id = :student_id"),
            {"student_id": parsed_id},
        )
        .mappings()
        .first()
    )

    if row is None:
        raise HTTPException(status_code=404, detail="Student not found")
    return _row_to_student(row)
