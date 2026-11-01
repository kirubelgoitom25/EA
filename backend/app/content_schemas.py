"""Request and response models for the teacher content routes.

Kept out of schemas.py on purpose, so the other branch that edits that file
does not clash with this one. Requests refuse unknown fields, so a client
cannot slip in an id, a quiz_id or a sort_order.
"""
from typing import Optional

from pydantic import BaseModel, ConfigDict, StrictInt


class StrictIn(BaseModel):
    model_config = ConfigDict(extra="forbid")


# ---- quiz ------------------------------------------------------------------


class QuizQuestionIn(StrictIn):
    question: str
    options: list[str]
    correct_index: StrictInt  # a bool is refused
    explanation: Optional[str] = None


class QuizBulkIn(StrictIn):
    questions: list[QuizQuestionIn]


class PasteIn(StrictIn):
    text: str


class OrderIn(StrictIn):
    question_ids: list[StrictInt]


class QuizQuestionOut(BaseModel):
    id: int
    question: str
    options: list[str]
    correct_index: int
    explanation: Optional[str] = None
    sort_order: int


class TeacherQuizOut(BaseModel):
    lesson_id: str
    quiz_id: Optional[int] = None
    max_questions: int
    questions: list[QuizQuestionOut]


class ParsedQuizQuestion(BaseModel):
    number: int
    question: str
    options: list[str]
    correct_index: int
    explanation: Optional[str] = None


class ParseErrorOut(BaseModel):
    number: int
    message: str


class QuizParseOut(BaseModel):
    questions: list[ParsedQuizQuestion]
    errors: list[ParseErrorOut]
