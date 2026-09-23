from datetime import datetime
from typing import Literal

from pydantic import BaseModel

Role = Literal["student", "teacher"]


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: Role


class StudentOut(BaseModel):
    id: str
    name: str
    email: str
    role: Role
    is_active: bool
    created_at: datetime
