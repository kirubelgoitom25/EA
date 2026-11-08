"""Request and response models for Course Studio.

Requests refuse unknown fields, so a client cannot slip in an owner_id, a status
or a sort_order. Reuses StrictIn from content_schemas.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, StrictBool, StrictInt

from app.content_schemas import StrictIn

# ---- teacher: courses, modules, lessons -------------------------------------


class CourseCreateIn(StrictIn):
    title: str
    description: str


class CourseUpdateIn(StrictIn):
    title: Optional[str] = None
    description: Optional[str] = None
    price: Optional[Decimal] = None
    # Sent as null, this means permanent access. Left out, it is not changed.
    access_days: Optional[int] = None
    payment_instructions: Optional[str] = None
    access_tier: Optional[str] = None
    # Paid courses only: also open to EA Pro members.
    pro_included: Optional[StrictBool] = None


class ModuleIn(StrictIn):
    title: str


class ModuleUpdateIn(StrictIn):
    title: Optional[str] = None
    archived: Optional[StrictBool] = None


class LessonCreateIn(StrictIn):
    title: str
    duration: Optional[str] = None


class LessonUpdateIn(StrictIn):
    title: Optional[str] = None
    duration: Optional[str] = None
    archived: Optional[StrictBool] = None


class IdOrderIn(StrictIn):
    ids: list[str]


class ActivityOrderIn(StrictIn):
    ids: list[StrictInt]


class ActivityCreateIn(StrictIn):
    kind: str
    title: Optional[str] = None
    is_required: Optional[StrictBool] = None
    video_url: Optional[str] = None
    reading_body: Optional[str] = None


class ActivityUpdateIn(StrictIn):
    title: Optional[str] = None
    is_required: Optional[StrictBool] = None
    video_url: Optional[str] = None
    reading_body: Optional[str] = None
    archived: Optional[StrictBool] = None


class ActivityOut(BaseModel):
    id: int
    lesson_id: str
    kind: str
    sort_order: int
    title: str
    is_required: bool
    video_url: Optional[str] = None
    quiz_id: Optional[int] = None
    practice_id: Optional[int] = None
    reading_body: Optional[str] = None
    archived: bool


class LessonStudioOut(BaseModel):
    id: str
    title: str
    duration: Optional[str] = None
    sort_order: int
    archived: bool
    activities: list[ActivityOut]


class ModuleStudioOut(BaseModel):
    id: str
    title: str
    sort_order: int
    archived: bool
    lessons: list[LessonStudioOut]


class CourseStudioOut(BaseModel):
    id: str
    title: str
    description: str
    status: str
    owned: bool
    editable: bool
    price: Decimal = Decimal("0")
    currency: str = "ETB"
    access_days: Optional[int] = None
    payment_instructions: Optional[str] = None
    access_tier: str = "free"
    pro_included: bool = False
    owner_id: Optional[str] = None
    published_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class CourseOutlineOut(CourseStudioOut):
    modules: list[ModuleStudioOut]


class RemovedOut(BaseModel):
    # deleted: the row is gone. archived: student records exist, so it was hidden.
    deleted: bool
    archived: bool


class CourseStatsOut(BaseModel):
    # None means "fewer than 3 learners": hidden to protect individual students.
    learners: Optional[int] = None
    completed_course: Optional[int] = None
    hidden: bool
    min_aggregate: int


class ClassAssignmentOut(BaseModel):
    class_id: str
    name: str
    assigned: bool
    students: int
    learners: int
    completed_course: int


# ---- student -----------------------------------------------------------------


class StudentActivityOut(BaseModel):
    id: int
    kind: str
    title: str
    sort_order: int
    is_required: bool
    completed: bool
    # False for a quiz/practice that has no questions yet; the app should skip it.
    ready: bool
    video_url: Optional[str] = None
    reading_body: Optional[str] = None


class StudentLessonActivitiesOut(BaseModel):
    lesson_id: str
    lesson_completed: bool
    activities: list[StudentActivityOut]


class CompleteOut(BaseModel):
    activity_id: int
    completed: bool
    lesson_completed: bool
