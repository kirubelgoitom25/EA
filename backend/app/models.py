import uuid

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(UUID(as_uuid=True), primary_key=True)
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    class_id = Column(String, ForeignKey("classes.id"), nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    


class Course(Base):
    __tablename__ = "courses"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)

    modules = relationship(
        "Module", back_populates="course", order_by="Module.sort_order"
    )


class Module(Base):
    __tablename__ = "modules"

    id = Column(String, primary_key=True)
    course_id = Column(
        String, ForeignKey("courses.id", ondelete="CASCADE"), nullable=False
    )
    title = Column(String, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)

    course = relationship("Course", back_populates="modules")
    lessons = relationship(
        "Lesson", back_populates="module", order_by="Lesson.sort_order"
    )


class Lesson(Base):
    __tablename__ = "lessons"

    id = Column(String, primary_key=True)
    module_id = Column(
        String, ForeignKey("modules.id", ondelete="CASCADE"), nullable=False
    )
    title = Column(String, nullable=False)
    duration = Column(String, nullable=False)
    video_url = Column(String, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)

    module = relationship("Module", back_populates="lessons")


class LessonProgress(Base):
    __tablename__ = "lesson_progress"
    __table_args__ = (
        UniqueConstraint("student_id", "lesson_id", name="uq_student_lesson"),
    )

    id = Column(Integer, primary_key=True)
    student_id = Column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    lesson_id = Column(
        String, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False
    )
    completed_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Quiz(Base):
    __tablename__ = "quizzes"

    id = Column(Integer, primary_key=True)
    lesson_id = Column(
        String,
        ForeignKey("lessons.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )

    questions = relationship(
        "QuizQuestion", back_populates="quiz", order_by="QuizQuestion.sort_order"
    )


class QuizQuestion(Base):
    __tablename__ = "quiz_questions"

    id = Column(Integer, primary_key=True)
    quiz_id = Column(
        Integer, ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False
    )
    question = Column(Text, nullable=False)
    options = Column(JSONB, nullable=False)
    correct_index = Column(Integer, nullable=False)
    explanation = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)

    quiz = relationship("Quiz", back_populates="questions")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id = Column(Integer, primary_key=True)
    student_id = Column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    quiz_id = Column(
        Integer, ForeignKey("quizzes.id", ondelete="CASCADE"), nullable=False
    )
    attempt_number = Column(Integer, nullable=False)
    score = Column(Integer, nullable=False)
    total_questions = Column(Integer, nullable=False)
    xp_earned = Column(Numeric(6, 2), nullable=False)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Practice(Base):
    __tablename__ = "practices"

    id = Column(Integer, primary_key=True)
    lesson_id = Column(
        String,
        ForeignKey("lessons.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    title = Column(String, nullable=False)

    items = relationship(
        "PracticeItem", back_populates="practice", order_by="PracticeItem.sort_order"
    )


class PracticeItem(Base):
    __tablename__ = "practice_items"

    id = Column(Integer, primary_key=True)
    practice_id = Column(
        Integer, ForeignKey("practices.id", ondelete="CASCADE"), nullable=False
    )
    type = Column(String, nullable=False)
    question = Column(Text, nullable=False)
    sentence = Column(Text, nullable=True)
    options = Column(JSONB, nullable=True)
    answer = Column(Text, nullable=True)
    correct_index = Column(Integer, nullable=True)
    explanation = Column(Text, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)

    practice = relationship("Practice", back_populates="items")


class PracticeAttempt(Base):
    __tablename__ = "practice_attempts"

    id = Column(Integer, primary_key=True)
    student_id = Column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    practice_id = Column(
        Integer, ForeignKey("practices.id", ondelete="CASCADE"), nullable=False
    )
    score = Column(Integer, nullable=False)
    total_items = Column(Integer, nullable=False)
    xp_earned = Column(Numeric(6, 2), nullable=False)
    is_first_completion = Column(Boolean, nullable=False)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class XPEvent(Base):
    __tablename__ = "xp_events"

    id = Column(Integer, primary_key=True)
    student_id = Column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    amount = Column(Numeric(6, 2), nullable=False)
    source = Column(String, nullable=False)
    source_id = Column(Integer, nullable=False)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class Streak(Base):
    __tablename__ = "streaks"

    student_id = Column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    current_streak = Column(Integer, nullable=False, default=0)
    longest_streak = Column(Integer, nullable=False, default=0)
    last_activity_date = Column(Date, nullable=True)
class Class(Base):
    __tablename__ = "classes"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now())


class ClassCourse(Base):
    __tablename__ = "class_courses"

    class_id = Column(String, ForeignKey("classes.id", ondelete="CASCADE"), primary_key=True)
    course_id = Column(String, ForeignKey("courses.id", ondelete="CASCADE"), primary_key=True)
    