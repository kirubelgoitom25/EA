from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

# A simple email check: something@something.something, no spaces.
EMAIL_PATTERN = r"^[^@\s]+@[^@\s]+\.[^@\s]+$"

Role = Literal["student", "teacher"]


class LoginRequest(BaseModel):
    email: str = Field(pattern=EMAIL_PATTERN)
    password: str = Field(min_length=1)


class UserOut(BaseModel):
    id: int
    name: str
    email: str
    role: Role


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class StudentOut(BaseModel):
    id: int
    name: str
    email: str
    role: Role
    is_active: bool
    created_at: datetime
