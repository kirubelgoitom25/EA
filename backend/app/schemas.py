from datetime import datetime
from typing import Literal, Optional

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


class LessonOut(BaseModel):
    id: int
    title: str
    duration: str
    video_url: Optional[str] = None
    completed: bool


class ModuleOut(BaseModel):
    id: int
    title: str
    lessons: list[LessonOut]


class CourseListItemOut(BaseModel):
    id: int
    title: str
    description: str
    total_lessons: int
    completed_lessons: int
    progress: int


class CourseDetailOut(BaseModel):
    id: int
    title: str
    description: str
    modules: list[ModuleOut]
