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


# ---- practice --------------------------------------------------------------


class PracticeItemIn(StrictIn):
    type: str
    question: str
    sentence: Optional[str] = None
    options: Optional[list[str]] = None
    correct_index: Optional[StrictInt] = None
    answer: Optional[str] = None
    explanation: Optional[str] = None


class PracticeItemCreateIn(PracticeItemIn):
    practice_title: Optional[str] = None


class PracticeBulkIn(StrictIn):
    items: list[PracticeItemIn]
    practice_title: Optional[str] = None


class PracticeOrderIn(StrictIn):
    item_ids: list[StrictInt]


class PracticeTitleIn(StrictIn):
    title: str


class PracticeItemOut(BaseModel):
    id: int
    type: str
    question: str
    sentence: Optional[str] = None
    options: Optional[list[str]] = None
    correct_index: Optional[int] = None
    answer: Optional[str] = None
    explanation: Optional[str] = None
    sort_order: int


class TeacherPracticeOut(BaseModel):
    lesson_id: str
    practice_id: Optional[int] = None
    title: Optional[str] = None
    max_items: int
    items: list[PracticeItemOut]


class ParsedPracticeItem(BaseModel):
    number: int
    type: str
    question: str
    sentence: Optional[str] = None
    options: Optional[list[str]] = None
    correct_index: Optional[int] = None
    answer: Optional[str] = None
    explanation: Optional[str] = None


class PracticeParseOut(BaseModel):
    items: list[ParsedPracticeItem]
    errors: list[ParseErrorOut]
