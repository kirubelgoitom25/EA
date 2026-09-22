from fastapi import APIRouter, Depends, HTTPException

from app.deps import require_teacher
from app.schemas import StudentOut
from app.stub_data import STUB_USERS

router = APIRouter(prefix="/students", tags=["students"])


@router.get("", response_model=list[StudentOut])
def list_students(_: dict = Depends(require_teacher)):
    return [u for u in STUB_USERS if u["role"] == "student"]


@router.get("/{student_id}", response_model=StudentOut)
def get_student(student_id: int, _: dict = Depends(require_teacher)):
    for user in STUB_USERS:
        if user["id"] == student_id and user["role"] == "student":
            return user
    raise HTTPException(status_code=404, detail="Student not found")
