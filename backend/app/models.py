import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
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
    # The main admin stays role "teacher" with this on, so every teacher route and the
    # dashboard login work unchanged. Set by hand in SQL; no API can write it.
    is_admin = Column(Boolean, nullable=False, default=False, server_default="false")
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    


class Course(Base):
    __tablename__ = "courses"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    # Course Studio. Legacy courses are ownerless and published; created_at and
    # published_at stay NULL for them because the real dates are unknown.
    owner_id = Column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    status = Column(String, nullable=False, default="draft", server_default="draft")
    created_at = Column(DateTime(timezone=True), nullable=True, server_default=func.now())
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    published_at = Column(DateTime(timezone=True), nullable=True)
    # Selling. Price 0 means free. access_days NULL means permanent access.
    price = Column(Numeric(10, 2), nullable=False, default=0, server_default="0")
    currency = Column(String, nullable=False, default="ETB", server_default="ETB")
    access_days = Column(Integer, nullable=True)
    payment_instructions = Column(Text, nullable=True)

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
    archived_at = Column(DateTime(timezone=True), nullable=True)

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
    duration = Column(String, nullable=True)
    video_url = Column(String, nullable=True)
    sort_order = Column(Integer, nullable=False, default=0)
    archived_at = Column(DateTime(timezone=True), nullable=True)

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
    # No ON DELETE CASCADE: student history must never vanish with content.
    lesson_id = Column(String, ForeignKey("lessons.id"), nullable=False)
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
    quiz_id = Column(Integer, ForeignKey("quizzes.id"), nullable=False)
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
    practice_id = Column(Integer, ForeignKey("practices.id"), nullable=False)
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
    
    
class ClassTeacher(Base):
    __tablename__ = "class_teachers"

    class_id = Column(String, ForeignKey("classes.id", ondelete="CASCADE"), primary_key=True)
    teacher_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True)


class LessonActivity(Base):
    """One ordered step inside a lesson: video, quiz, practice or reading.

    is_required is advisory only. It never blocks lesson completion.
    """

    __tablename__ = "lesson_activities"
    __table_args__ = (
        CheckConstraint(
            "kind in ('video','quiz','practice','reading')", name="lesson_activities_kind_check"
        ),
    )

    id = Column(Integer, primary_key=True)
    lesson_id = Column(
        String, ForeignKey("lessons.id", ondelete="CASCADE"), nullable=False
    )
    kind = Column(String, nullable=False)
    sort_order = Column(Integer, nullable=False, default=0)
    title = Column(String, nullable=False)
    is_required = Column(Boolean, nullable=False, default=False, server_default="false")
    video_url = Column(Text, nullable=True)
    quiz_id = Column(Integer, nullable=True)
    practice_id = Column(Integer, nullable=True)
    reading_body = Column(Text, nullable=True)
    legacy_ref = Column(String, nullable=True, unique=True)
    archived_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ActivityProgress(Base):
    __tablename__ = "activity_progress"
    __table_args__ = (
        UniqueConstraint(
            "student_id", "activity_id", name="activity_progress_student_activity_key"
        ),
    )

    id = Column(Integer, primary_key=True)
    student_id = Column(
        UUID(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    # No cascade: progress on an activity must block deleting it.
    activity_id = Column(Integer, ForeignKey("lesson_activities.id"), nullable=False)
    completed_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    source = Column(String, nullable=False, default="manual")


class PaymentRequest(Base):
    """One submission of payment proof: the permanent history.

    amount, currency and access_days are a copy of what the student saw, so a later
    price change cannot alter the deal. There is no teacher id: the reviewer comes from
    courses.owner_id, so ownership lives in one place.
    """

    __tablename__ = "payment_requests"
    __table_args__ = (
        CheckConstraint(
            "status in ('pending','approved','rejected')", name="payment_requests_status_check"
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # No cascade: payment history must never vanish with a course or an account.
    student_id = Column(UUID(as_uuid=True), ForeignKey("profiles.id"), nullable=False)
    course_id = Column(String, ForeignKey("courses.id"), nullable=False)
    status = Column(String, nullable=False, default="pending", server_default="pending")
    amount = Column(Numeric(10, 2), nullable=False)
    currency = Column(String, nullable=False)
    access_days = Column(Integer, nullable=True)
    proof_path = Column(Text, nullable=False)
    proof_type = Column(String, nullable=False)
    proof_sha256 = Column(String, nullable=False)
    reviewed_by = Column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True
    )
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    review_note = Column(Text, nullable=True)
    created_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class CourseAccess(Base):
    """A student's current permission for a paid course. Free courses write no rows.

    expires_at NULL means permanent. Revoking fills revoked_at and keeps the row.
    """

    __tablename__ = "course_access"

    student_id = Column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True
    )
    course_id = Column(String, ForeignKey("courses.id"), primary_key=True)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    granted_at = Column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    source = Column(String, nullable=False)
    granted_by = Column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True
    )
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    revoked_by = Column(
        UUID(as_uuid=True), ForeignKey("profiles.id", ondelete="SET NULL"), nullable=True
    )
