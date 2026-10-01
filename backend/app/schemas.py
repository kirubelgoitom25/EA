from datetime import datetime
from decimal import Decimal
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
    id: str
    title: str
    duration: Optional[str] = None
    video_url: Optional[str] = None
    completed: bool


class ModuleOut(BaseModel):
    id: str
    title: str
    lessons: list[LessonOut]


class CourseListItemOut(BaseModel):
    id: str
    title: str
    description: str
    total_lessons: int
    completed_lessons: int
    progress: int
    modules: list[ModuleOut]


class CourseDetailOut(BaseModel):
    id: str
    title: str
    description: str
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


class PracticeResultOut(BaseModel):
    score: int
    total_items: int
    xp_earned: Decimal
    xp_possible: Decimal
    is_first_completion: bool


class MeStatsOut(BaseModel):
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
