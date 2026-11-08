import uuid
from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, Field

Role = Literal["student", "teacher"]


class ProStatusOut(BaseModel):
    state: str  # none, active, expired or revoked
    active: bool
    expires_at: Optional[datetime] = None
    source: Optional[str] = None


class UserOut(BaseModel):
    id: str
    name: str
    email: str
    role: Role
    is_admin: bool = False
    # Students only.
    username: Optional[str] = None
    phone: Optional[str] = None
    profile_complete: Optional[bool] = None
    pro: Optional[ProStatusOut] = None


class RegisteredOut(BaseModel):
    # The hidden address the app signs in with. Never shown to the student.
    login_email: str


class LoginEmailOut(BaseModel):
    email: str


class MyProfileOut(BaseModel):
    name: str
    username: Optional[str] = None
    phone: Optional[str] = None
    school: Optional[str] = None
    profile_complete: bool


class StudentOut(BaseModel):
    id: str
    name: str
    email: str
    role: Role
    is_active: bool
    created_at: datetime


class LessonOut(BaseModel):
    id: str
    title: str
    duration: Optional[str] = None
    video_url: Optional[str] = None
    completed: bool


class ModuleOut(BaseModel):
    id: str
    title: str
    lessons: list[LessonOut]


class CourseAccessOut(BaseModel):
    # free, class, active, pro (open) or expired, revoked, locked, pro_locked (closed)
    state: str
    expires_at: Optional[datetime] = None
    pending_requests: int = 0


class CourseListItemOut(BaseModel):
    id: str
    title: str
    description: str
    total_lessons: int
    completed_lessons: int
    progress: int
    price: Decimal = Decimal("0")
    currency: str = "ETB"
    access_days: Optional[int] = None
    payment_instructions: Optional[str] = None
    access_tier: str = "free"
    # A paid course that EA Pro members also open.
    pro_included: bool = False
    purchasable: bool = True
    # Students only. Absent for teachers, who are not buying anything.
    access: Optional[CourseAccessOut] = None
    modules: list[ModuleOut]


class CourseDetailOut(BaseModel):
    id: str
    title: str
    description: str
    price: Decimal = Decimal("0")
    currency: str = "ETB"
    access_days: Optional[int] = None
    payment_instructions: Optional[str] = None
    access_tier: str = "free"
    # A paid course that EA Pro members also open.
    pro_included: bool = False
    purchasable: bool = True
    access: Optional[CourseAccessOut] = None
    modules: list[ModuleOut]


class QuizQuestionOut(BaseModel):
    id: int
    question: str
    options: list[str]
    correct_index: int
    explanation: Optional[str] = None


class QuizOut(BaseModel):
    lesson_id: str
    attempt_number: int
    xp_per_correct: Decimal
    questions: list[QuizQuestionOut]


class QuizAnswerIn(BaseModel):
    question_id: int
    selected_index: int


class QuizSubmitIn(BaseModel):
    answers: list[QuizAnswerIn]
    # Optional, sent by current apps: the same id for every try of one chapter submission.
    submission_id: Optional[uuid.UUID] = None


class QuizResultOut(BaseModel):
    attempt_number: int
    score: int
    total_questions: int
    xp_earned: Decimal
    xp_per_correct: Decimal
    next_xp_per_correct: Decimal
    all_correct: bool


class PracticeItemOut(BaseModel):
    id: int
    type: Literal["fill", "choose"]
    question: str
    sentence: Optional[str] = None
    options: Optional[list[str]] = None
    answer: Optional[str] = None
    correct_index: Optional[int] = None
    explanation: Optional[str] = None
    xp: Decimal


class PracticeOut(BaseModel):
    lesson_id: str
    title: str
    already_completed: bool
    items: list[PracticeItemOut]


class PracticeAnswerIn(BaseModel):
    item_id: int
    text_answer: Optional[str] = None
    selected_index: Optional[int] = None


class PracticeSubmitIn(BaseModel):
    answers: list[PracticeAnswerIn]
    submission_id: Optional[uuid.UUID] = None


class PracticeResultOut(BaseModel):
    score: int
    total_items: int
    xp_earned: Decimal
    xp_possible: Decimal
    is_first_completion: bool


class MeStatsOut(BaseModel):
    name: Optional[str] = None
    xp: Decimal
    weekly_xp: Decimal
    monthly_xp: Decimal
    current_streak: int
    longest_streak: int


class RankingEntryOut(BaseModel):
    id: str
    name: str
    xp: Decimal
    weekly_xp: Decimal
    monthly_xp: Decimal
    position: Optional[int] = None
    pro: bool = False

class ClassOut(BaseModel):
    id: str
    name: str
    student_count: int

class CurrentCourseOut(BaseModel):
    id: str
    title: str


class StudentProgressCourseOut(BaseModel):
    id: str
    title: str
    progress: int
    total_lessons: int
    completed_lessons: int
    xp: Decimal
    rank: Optional[int] = None
    class_size: int


class StudentDetailOut(StudentOut):
    class_id: Optional[str] = None
    xp: Decimal
    current_streak: int
    courses: list[StudentProgressCourseOut]
    current_course: Optional[CurrentCourseOut] = None
    

class AttentionFlagOut(BaseModel):
    code: str
    label: str


class ClassStudentOut(BaseModel):
    id: str
    name: str
    is_active: bool
    xp: Decimal
    weekly_xp: Decimal
    monthly_xp: Decimal
    current_streak: int
    progress: int
    last_active_at: Optional[datetime] = None
    current_course: Optional[CurrentCourseOut] = None
    attention: list[AttentionFlagOut] = []


class ClassCourseOut(BaseModel):
    id: str
    title: str
    total_lessons: int
    avg_progress: int
    
class ClassStandingOut(BaseModel):
    id: Optional[str] = None
    name: str
    student_count: int
    xp: Decimal
    weekly_xp: Decimal
    monthly_xp: Decimal
    is_mine: bool
    
class HeartbeatIn(BaseModel):
    lesson_id: Optional[str] = Field(default=None, max_length=100)


class PresenceLessonOut(BaseModel):
    id: str
    title: str


class PresenceOut(BaseModel):
    student_id: str
    online: bool
    seconds_since_seen: Optional[int] = None
    lesson: Optional[PresenceLessonOut] = None
    course: Optional[CurrentCourseOut] = None