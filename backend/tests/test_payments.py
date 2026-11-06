"""Plain-Python tests for selling courses: access, payment requests, approvals, expiry
and the main admin. Run from the repo root with the backend virtualenv:
    .venv/bin/python -I backend/tests/test_payments.py

No server and no Postgres: an in-memory SQLite database stands in, and proof storage is an
in-memory fake. SQLite cannot prove row locks, so the race itself is covered separately by
tests/race_check_payments.py against a real Postgres.
"""
import io
import os
import sqlite3
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://x:x@localhost/x")
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")

from fastapi import HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, func, select, text  # noqa: E402
from sqlalchemy.dialects.postgresql import JSONB  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

sqlite3.register_adapter(uuid.UUID, lambda u: u.hex)


@compiles(JSONB, "sqlite")
def _jsonb_as_json(type_, compiler, **kw):
    return "JSON"


from app import (  # noqa: E402
    admin_service,
    content_service,
    payment_rules,
    payment_service,
    proof_storage,
    studio_access,
    studio_service,
)
from app.database import Base, get_db  # noqa: E402
from app.deps import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    ActivityProgress,
    Class,
    ClassCourse,
    ClassTeacher,
    Course,
    CourseAccess,
    Lesson,
    LessonProgress,
    PaymentRequest,
    Practice,
    PracticeItem,
    Profile,
    Quiz,
    QuizQuestion,
)
from app.payment_rules import (  # noqa: E402
    MAX_PENDING_PER_COURSE,
    MAX_PROOF_BYTES,
    access_state,
    clean_access_days,
    clean_price,
    next_expiry,
    sniff_image,
)
from app.routers import presence, stats  # noqa: E402

PNG = b"\x89PNG\r\n\x1a\n" + b"p" * 100
JPEG = b"\xff\xd8\xff" + b"j" * 100
WEBP = b"RIFF\x00\x00\x00\x00WEBP" + b"w" * 100
YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
NOW = datetime(2026, 11, 6, 12, 0, tzinfo=timezone.utc)


class FakeStorage:
    def __init__(self):
        self.files = {}
        self.fail = False

    def upload(self, path, data, content_type):
        if self.fail:
            raise proof_storage.ProofStorageError("down")
        self.files[path] = (data, content_type)

    def download(self, path):
        if self.fail:
            raise proof_storage.ProofStorageError("down")
        return self.files[path][0]

    def delete(self, path):
        self.files.pop(path, None)


class Case(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
        )
        with self.engine.begin() as conn:
            conn.exec_driver_sql("ATTACH ':memory:' AS auth")
            conn.exec_driver_sql("create table auth.users (id char(32) primary key, email text)")
        self.addCleanup(self.engine.dispose)
        Base.metadata.create_all(self.engine)
        self.db = sessionmaker(bind=self.engine, autoflush=False)()
        self.addCleanup(self.db.close)

        self.storage = FakeStorage()
        originals = (proof_storage.upload, proof_storage.download, proof_storage.delete)
        proof_storage.upload = self.storage.upload
        proof_storage.download = self.storage.download
        proof_storage.delete = self.storage.delete

        def restore():
            proof_storage.upload, proof_storage.download, proof_storage.delete = originals

        self.addCleanup(restore)

        self.db.add_all([Class(id="class-a", name="A"), Class(id="class-b", name="B")])
        self.db.flush()
        self.owner = self.person("teacher", name="Owner")
        self.rival = self.person("teacher", name="Rival")
        self.admin = self.person("teacher", name="Admin", is_admin=True)
        self.student = self.person("student", name="Student")
        self.classmate = self.person("student", "class-a", name="Classmate")
        self.db.add(ClassTeacher(class_id="class-a", teacher_id=self.owner.id))
        self.db.commit()

        self.course_id, self.lesson_id = self.paid_course()

    def person(self, role, class_id=None, name=None, is_admin=False):
        p = Profile(
            id=uuid.uuid4(), name=name or role, role=role, class_id=class_id, is_admin=is_admin
        )
        self.db.add(p)
        self.db.flush()
        self.db.execute(
            text("insert into auth.users (id, email) values (:id, :email)"),
            {"id": p.id, "email": f"{(name or role).lower()}-{p.id.hex[:6]}@example.com"},
        )
        return p

    def paid_course(self, owner=None, price="500", days=30):
        owner = owner or self.owner
        course = studio_service.create_course(self.db, owner.id, "Biology", "About life")
        module = studio_service.create_module(self.db, owner.id, course["id"], "Cells")
        lesson = studio_service.create_lesson(self.db, owner.id, module["id"], {"title": "L1"})
        studio_service.set_course_status(self.db, owner.id, course["id"], "publish")
        if price:
            studio_service.update_course(
                self.db,
                owner.id,
                course["id"],
                {"price": Decimal(price), "access_days": days, "payment_instructions": "Send to 0911"},
            )
        return course["id"], lesson["id"]

    def submit(self, student=None, data=PNG, course_id=None):
        student = student or self.student
        return payment_service.submit_request(
            self.db, student.id, student.class_id, course_id or self.course_id, data
        )

    def request_id(self, result):
        return uuid.UUID(result[0]["id"])

    def can_open(self, student=None, lesson_id=None):
        student = student or self.student
        return studio_access.student_can_see_lesson(
            self.db, student.id, student.class_id, lesson_id or self.lesson_id
        )

    def state(self, student=None, course_id=None):
        student = student or self.student
        course_id = course_id or self.course_id
        return studio_access.access_for_student(
            self.db, student.id, student.class_id, [course_id]
        )[course_id]["state"]

    def access_row(self, student=None, course_id=None):
        student = student or self.student
        return self.db.get(CourseAccess, (student.id, course_id or self.course_id))

    def set_expiry(self, when, student=None):
        row = self.access_row(student)
        row.expires_at = when
        self.db.commit()

    def status_of(self, fn, *args, **kwargs):
        with self.assertRaises(HTTPException) as ctx:
            fn(*args, **kwargs)
        return ctx.exception.status_code


class PureRules(unittest.TestCase):
    def test_access_state(self):
        past, future = NOW - timedelta(days=1), NOW + timedelta(days=1)
        self.assertEqual(access_state(Decimal("0"), False, None, None, False, NOW), "free")
        self.assertEqual(access_state(Decimal("5"), True, None, None, False, NOW), "class")
        self.assertEqual(access_state(Decimal("5"), False, None, None, False, NOW), "locked")
        self.assertEqual(access_state(Decimal("5"), False, None, None, True, NOW), "active")
        self.assertEqual(access_state(Decimal("5"), False, future, None, True, NOW), "active")
        self.assertEqual(access_state(Decimal("5"), False, past, None, True, NOW), "expired")
        self.assertEqual(access_state(Decimal("5"), False, future, NOW, True, NOW), "revoked")
        self.assertEqual(access_state(Decimal("5"), False, None, NOW, True, NOW), "revoked")

    def test_exactly_at_expiry_is_expired(self):
        self.assertEqual(access_state(Decimal("5"), False, NOW, None, True, NOW), "expired")

    def test_next_expiry(self):
        days = timedelta(days=30)
        future = NOW + timedelta(days=10)
        past = NOW - timedelta(days=10)
        self.assertEqual(next_expiry(False, None, None, 30, NOW), NOW + days)  # first approval
        self.assertIsNone(next_expiry(False, None, None, None, NOW))  # first, permanent
        self.assertEqual(next_expiry(True, future, None, 30, NOW), future + days)  # renew, running
        self.assertEqual(next_expiry(True, past, None, 30, NOW), NOW + days)  # renew, expired
        self.assertIsNone(next_expiry(True, future, None, None, NOW))  # upgraded to permanent
        self.assertIsNone(next_expiry(True, None, None, 30, NOW))  # permanent stays permanent
        self.assertEqual(next_expiry(True, None, NOW, 30, NOW), NOW + days)  # after revoke
        self.assertEqual(next_expiry(True, future, NOW, 30, NOW), NOW + days)  # no leftover time

    def test_prices(self):
        self.assertEqual(clean_price("500"), Decimal("500.00"))
        self.assertEqual(clean_price(Decimal("0")), Decimal("0.00"))
        for bad in ("-1", "abc", "1.234", "NaN", "Infinity", "1000000.01"):
            with self.assertRaises(HTTPException, msg=bad):
                clean_price(bad)

    def test_durations(self):
        self.assertIsNone(clean_access_days(None))
        self.assertEqual(clean_access_days(90), 90)
        for bad in (0, -1, 36501, True, "30", 1.5):
            with self.assertRaises(HTTPException, msg=repr(bad)):
                clean_access_days(bad)

    def test_file_types_come_from_the_bytes(self):
        self.assertEqual(sniff_image(PNG), ("image/png", "png"))
        self.assertEqual(sniff_image(JPEG), ("image/jpeg", "jpg"))
        self.assertEqual(sniff_image(WEBP), ("image/webp", "webp"))
        for bad in (b"", b"<svg onload=alert(1)>", b"<html>", b"GIF89a", b"RIFF1234WAVE", b"%PDF-1.7"):
            self.assertIsNone(sniff_image(bad))


class AccessRule(Case):
    def test_existing_free_course_is_unchanged(self):
        course_id, lesson_id = self.paid_course(price=None)
        self.assertEqual(self.state(course_id=course_id), "free")
        self.assertTrue(self.can_open(lesson_id=lesson_id))

    def test_paid_course_is_visible_but_closed(self):
        self.assertIn(
            self.course_id,
            studio_access.visible_course_ids_for_student(self.db, self.student.id, None),
        )
        self.assertEqual(self.state(), "locked")
        self.assertFalse(self.can_open())

    def test_class_gives_free_access_and_taking_it_back_ends_it(self):
        self.db.add(ClassCourse(class_id="class-a", course_id=self.course_id))
        self.db.commit()
        self.assertEqual(self.state(self.classmate), "class")
        self.assertTrue(self.can_open(self.classmate))
        self.assertFalse(self.can_open(self.student))  # not in the class
        self.db.delete(self.db.get(ClassCourse, ("class-a", self.course_id)))
        self.db.commit()
        self.assertFalse(self.can_open(self.classmate))

    def test_purchase_survives_the_class_being_taken_back(self):
        payment_service.approve(self.db, self.owner.id, self.request_id(self.submit(self.classmate)))
        self.db.add(ClassCourse(class_id="class-a", course_id=self.course_id))
        self.db.commit()
        self.assertEqual(self.state(self.classmate), "class")
        self.db.delete(self.db.get(ClassCourse, ("class-a", self.course_id)))
        self.db.commit()
        self.assertEqual(self.state(self.classmate), "active")

    def test_expiry_is_enforced_with_no_background_job(self):
        payment_service.approve(self.db, self.owner.id, self.request_id(self.submit()))
        self.assertTrue(self.can_open())
        self.set_expiry(datetime.now(timezone.utc) - timedelta(seconds=1))
        self.assertEqual(self.state(), "expired")
        self.assertFalse(self.can_open())

    def test_expiry_keeps_progress(self):
        payment_service.approve(self.db, self.owner.id, self.request_id(self.submit()))
        self.db.add(LessonProgress(student_id=self.student.id, lesson_id=self.lesson_id))
        self.db.commit()
        self.set_expiry(datetime.now(timezone.utc) - timedelta(days=1))
        self.assertFalse(self.can_open())
        count = self.db.execute(select(func.count(LessonProgress.id))).scalar_one()
        self.assertEqual(count, 1)

    def test_old_progress_on_an_unpublished_course_is_not_a_way_in(self):
        self.db.add(LessonProgress(student_id=self.student.id, lesson_id=self.lesson_id))
        self.db.commit()
        studio_service.set_course_status(self.db, self.owner.id, self.course_id, "unpublish")
        self.assertIn(
            self.course_id,
            studio_access.visible_course_ids_for_student(self.db, self.student.id, None),
        )
        self.assertFalse(self.can_open())

    def test_unpublishing_does_not_strand_a_paid_student_with_no_progress(self):
        payment_service.approve(self.db, self.owner.id, self.request_id(self.submit()))
        studio_service.set_course_status(self.db, self.owner.id, self.course_id, "unpublish")
        self.assertTrue(self.can_open())

    def test_draft_lessons_stay_closed_even_with_a_row(self):
        course = studio_service.create_course(self.db, self.owner.id, "Draft", "d")
        module = studio_service.create_module(self.db, self.owner.id, course["id"], "M")
        lesson = studio_service.create_lesson(self.db, self.owner.id, module["id"], {"title": "L"})
        self.assertFalse(self.can_open(lesson_id=lesson["id"]))


class Pricing(Case):
    def test_defaults_are_free_and_etb(self):
        course = self.db.get(Course, self.paid_course(price=None)[0])
        self.assertEqual(course.price, 0)
        self.assertEqual(course.currency, "ETB")
        self.assertIsNone(course.access_days)

    def test_a_price_needs_payment_instructions(self):
        course_id, _ = self.paid_course(price=None)
        self.assertEqual(
            self.status_of(
                studio_service.update_course, self.db, self.owner.id, course_id, {"price": Decimal("10")}
            ),
            422,
        )

    def test_instructions_cannot_be_cleared_while_paid(self):
        self.assertEqual(
            self.status_of(
                studio_service.update_course,
                self.db,
                self.owner.id,
                self.course_id,
                {"payment_instructions": "  "},
            ),
            422,
        )

    def test_null_means_permanent_and_absent_means_unchanged(self):
        studio_service.update_course(self.db, self.owner.id, self.course_id, {"title": "New"})
        self.assertEqual(self.db.get(Course, self.course_id).access_days, 30)
        studio_service.update_course(self.db, self.owner.id, self.course_id, {"access_days": None})
        self.assertIsNone(self.db.get(Course, self.course_id).access_days)

    def test_another_teacher_cannot_price_a_course(self):
        self.assertEqual(
            self.status_of(
                studio_service.update_course, self.db, self.rival.id, self.course_id, {"price": Decimal("1")}
            ),
            404,
        )

    def test_an_ownerless_course_cannot_be_priced(self):
        self.db.add(Course(id="legacy", title="Old", description="d", status="published"))
        self.db.add(ClassCourse(class_id="class-a", course_id="legacy"))
        self.db.commit()
        self.assertEqual(
            self.status_of(
                studio_service.update_course,
                self.db,
                self.owner.id,
                "legacy",
                {"price": Decimal("10"), "payment_instructions": "x"},
            ),
            422,
        )

    def test_free_to_paid_keeps_existing_learners_only(self):
        course_id, lesson_id = self.paid_course(price=None)
        learner = self.person("student")
        by_activity = self.person("student")
        by_archived = self.person("student")
        archived = studio_service.create_lesson(
            self.db,
            self.owner.id,
            self.db.get(Lesson, lesson_id).module_id,
            {"title": "Old"},
        )
        activity = studio_service.create_activity(
            self.db, self.owner.id, lesson_id, {"kind": "video", "video_url": YOUTUBE}
        )
        self.db.add(LessonProgress(student_id=learner.id, lesson_id=lesson_id))
        self.db.add(ActivityProgress(student_id=by_activity.id, activity_id=activity["id"]))
        self.db.add(LessonProgress(student_id=by_archived.id, lesson_id=archived["id"]))
        self.db.commit()
        studio_service.update_lesson(self.db, self.owner.id, archived["id"], {"archived": True})

        studio_service.update_course(
            self.db,
            self.owner.id,
            course_id,
            {"price": Decimal("100"), "access_days": 30, "payment_instructions": "x"},
        )

        for student in (learner, by_activity, by_archived):
            row = self.access_row(student, course_id)
            self.assertEqual(row.source, "existing_learner")
            self.assertIsNone(row.expires_at)
            self.assertTrue(self.can_open(student, lesson_id))
        self.assertEqual(self.state(self.student, course_id), "locked")  # no recorded progress

    def test_going_free_and_back_does_not_revive_expired_access(self):
        request = self.request_id(self.submit())
        payment_service.approve(self.db, self.owner.id, request)
        self.db.add(LessonProgress(student_id=self.student.id, lesson_id=self.lesson_id))
        self.db.commit()
        self.set_expiry(datetime.now(timezone.utc) - timedelta(days=1))
        studio_service.update_course(self.db, self.owner.id, self.course_id, {"price": Decimal("0")})
        self.assertEqual(self.state(), "free")
        studio_service.update_course(self.db, self.owner.id, self.course_id, {"price": Decimal("500")})
        self.assertEqual(self.state(), "expired")

    def test_a_course_with_payment_records_cannot_be_deleted(self):
        self.submit()
        self.assertEqual(
            self.status_of(studio_service.delete_course, self.db, self.owner.id, self.course_id), 409
        )


class Submitting(Case):
    def test_terms_come_from_the_course_and_are_copied(self):
        result, created = self.submit()
        self.assertTrue(created)
        self.assertEqual(result["status"], "pending")
        self.assertEqual(result["amount"], Decimal("500.00"))
        self.assertEqual(result["currency"], "ETB")
        self.assertEqual(result["access_days"], 30)

    def test_price_change_does_not_touch_history_or_the_deal(self):
        request = self.request_id(self.submit())
        studio_service.update_course(
            self.db, self.owner.id, self.course_id, {"price": Decimal("900"), "access_days": 7}
        )
        row = self.db.get(PaymentRequest, request)
        self.assertEqual((row.amount, row.access_days), (Decimal("500.00"), 30))
        item = payment_service.list_for_review(self.db, self.owner.id, None, None, None, 50, 0)["items"][0]
        self.assertTrue(item["terms_changed"])
        before = datetime.now(timezone.utc)
        payment_service.approve(self.db, self.owner.id, request)
        ends = payment_rules.aware(self.access_row().expires_at)
        self.assertGreater(ends, before + timedelta(days=29))  # 30 days, not 7

    def test_many_independent_requests_while_others_are_pending(self):
        ids = {self.submit(data=PNG + bytes([i]))[0]["id"] for i in range(3)}
        self.assertEqual(len(ids), 3)
        self.assertEqual(len(payment_service.my_requests(self.db, self.student.id)), 3)

    def test_same_image_while_pending_is_one_request(self):
        first, created = self.submit()
        again, created_again = self.submit()
        self.assertTrue(created)
        self.assertFalse(created_again)
        self.assertEqual(first["id"], again["id"])
        self.assertEqual(len(self.storage.files), 1)

    def test_same_image_can_be_sent_again_after_a_rejection(self):
        payment_service.reject(self.db, self.owner.id, self.request_id(self.submit()), None)
        _, created = self.submit()
        self.assertTrue(created)

    def test_undecided_limit_clears_when_a_teacher_decides(self):
        ids = [self.request_id(self.submit(data=PNG + bytes([i]))) for i in range(MAX_PENDING_PER_COURSE)]
        self.assertEqual(self.status_of(self.submit, data=PNG + b"over"), 429)
        payment_service.reject(self.db, self.owner.id, ids[0], None)
        self.assertTrue(self.submit(data=PNG + b"over")[1])

    def test_limit_is_per_course(self):
        for i in range(MAX_PENDING_PER_COURSE):
            self.submit(data=PNG + bytes([i]))
        other_course, _ = self.paid_course(owner=self.rival)
        self.assertTrue(self.submit(course_id=other_course)[1])

    def test_bad_files_are_refused_and_nothing_is_stored(self):
        self.assertEqual(self.status_of(self.submit, data=b"<svg onload=alert(1)>"), 415)
        self.assertEqual(self.status_of(self.submit, data=b""), 422)
        self.assertEqual(self.status_of(self.submit, data=PNG + b"x" * MAX_PROOF_BYTES), 413)
        self.assertEqual(self.storage.files, {})

    def test_stored_name_is_generated_by_the_server(self):
        result, _ = self.submit()
        path = self.db.get(PaymentRequest, uuid.UUID(result["id"])).proof_path
        self.assertEqual(path, f"{self.student.id}/{result['id']}.png")

    def test_storage_failure_saves_nothing(self):
        self.storage.fail = True
        self.assertEqual(self.status_of(self.submit), 503)
        self.assertEqual(self.db.execute(select(func.count(PaymentRequest.id))).scalar_one(), 0)

    def test_refused_when_there_is_nothing_to_buy(self):
        free, _ = self.paid_course(price=None)
        self.assertEqual(self.status_of(self.submit, course_id=free), 409)
        self.assertEqual(self.status_of(self.submit, course_id="missing"), 404)
        self.db.add(ClassCourse(class_id="class-a", course_id=self.course_id))
        self.db.commit()
        self.assertEqual(self.status_of(self.submit, student=self.classmate), 409)
        studio_service.set_course_status(self.db, self.owner.id, self.course_id, "unpublish")
        self.assertEqual(self.status_of(self.submit), 404)  # not visible to them any more

    def test_refused_when_access_is_already_permanent(self):
        studio_service.update_course(self.db, self.owner.id, self.course_id, {"access_days": None})
        payment_service.approve(self.db, self.owner.id, self.request_id(self.submit()))
        self.assertEqual(self.status_of(self.submit, data=JPEG), 409)

    def test_renewing_is_allowed_while_time_is_left(self):
        payment_service.approve(self.db, self.owner.id, self.request_id(self.submit()))
        self.assertTrue(self.submit(data=JPEG)[1])

    def test_students_only_see_their_own(self):
        self.submit()
        self.assertEqual(payment_service.my_requests(self.db, self.classmate.id), [])


class Reviewing(Case):
    def test_approve_grants_access_from_the_approval_time(self):
        request = self.request_id(self.submit())
        before = datetime.now(timezone.utc)
        out = payment_service.approve(self.db, self.owner.id, request)
        self.assertEqual(out["status"], "approved")
        row = self.access_row()
        self.assertEqual(row.source, "payment")
        self.assertEqual(row.granted_by, self.owner.id)
        self.assertGreaterEqual(payment_rules.aware(row.expires_at), before + timedelta(days=30))
        self.assertTrue(self.can_open())

    def test_reject_grants_nothing_and_the_reason_is_optional(self):
        without = payment_service.reject(self.db, self.owner.id, self.request_id(self.submit()), None)
        self.assertIsNone(without["review_note"])
        self.assertIsNone(self.access_row())
        with_note = payment_service.reject(
            self.db, self.owner.id, self.request_id(self.submit(data=JPEG)), " Blurry "
        )
        self.assertEqual(with_note["review_note"], "Blurry")
        notes = {r["review_note"] for r in payment_service.my_requests(self.db, self.student.id)}
        self.assertEqual(notes, {None, "Blurry"})

    def test_a_decision_is_final(self):
        request = self.request_id(self.submit())
        payment_service.approve(self.db, self.owner.id, request)
        self.assertEqual(self.status_of(payment_service.approve, self.db, self.owner.id, request), 409)
        self.assertEqual(self.status_of(payment_service.reject, self.db, self.admin.id, request, None), 409)
        row = self.db.get(PaymentRequest, request)
        self.db.refresh(row)
        self.assertEqual(row.status, "approved")

    def test_double_approve_adds_time_only_once(self):
        request = self.request_id(self.submit())
        payment_service.approve(self.db, self.owner.id, request)
        ends = self.access_row().expires_at
        self.status_of(payment_service.approve, self.db, self.owner.id, request)
        self.db.expire_all()
        self.assertEqual(self.access_row().expires_at, ends)

    def test_two_requests_stack(self):
        first = self.request_id(self.submit())
        second = self.request_id(self.submit(data=JPEG))
        before = datetime.now(timezone.utc)
        payment_service.approve(self.db, self.owner.id, first)
        payment_service.approve(self.db, self.owner.id, second)
        self.assertGreaterEqual(
            payment_rules.aware(self.access_row().expires_at), before + timedelta(days=60)
        )

    def test_timed_approval_never_shortens_permanent_access(self):
        timed = self.request_id(self.submit())
        studio_service.update_course(self.db, self.owner.id, self.course_id, {"access_days": None})
        payment_service.approve(self.db, self.owner.id, self.request_id(self.submit(data=JPEG)))
        self.assertIsNone(self.access_row().expires_at)
        payment_service.approve(self.db, self.owner.id, timed)
        self.db.expire_all()
        self.assertIsNone(self.access_row().expires_at)

    def test_reviewer_is_warned_before_approving(self):
        request = self.request_id(self.submit())
        payment_service.approve(self.db, self.owner.id, request)
        self.submit(data=JPEG)
        item = payment_service.list_for_review(self.db, self.owner.id, "pending", None, None, 50, 0)["items"][0]
        self.assertEqual(item["current_access"]["state"], "active")
        self.assertFalse(item["after_approval"]["permanent"])
        self.assertGreater(
            payment_rules.aware(item["after_approval"]["expires_at"]),
            datetime.now(timezone.utc) + timedelta(days=59),
        )

    def test_reused_screenshot_is_flagged_across_students(self):
        self.submit()
        self.submit(student=self.classmate)
        items = payment_service.list_for_review(self.db, self.owner.id, None, None, None, 50, 0)["items"]
        self.assertTrue(all(i["image_reused"] for i in items))

    def test_oldest_waiting_comes_first(self):
        first = self.submit()[0]["id"]
        second = self.submit(data=JPEG)[0]["id"]
        self.db.get(PaymentRequest, uuid.UUID(first)).created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        self.db.commit()
        items = payment_service.list_for_review(self.db, self.owner.id, "pending", None, None, 50, 0)["items"]
        self.assertEqual([i["id"] for i in items], [first, second])

    def test_revoke_ends_access_and_keeps_all_history(self):
        request = self.request_id(self.submit())
        payment_service.approve(self.db, self.owner.id, request)
        out = payment_service.revoke(self.db, self.owner.id, self.course_id, self.student.id)
        self.assertEqual(out["state"], "revoked")
        self.assertEqual(self.state(), "revoked")
        self.assertFalse(self.can_open())
        self.assertEqual(self.db.get(PaymentRequest, request).status, "approved")
        self.assertIsNotNone(self.access_row())
        self.assertEqual(
            self.status_of(payment_service.revoke, self.db, self.owner.id, self.course_id, self.student.id),
            409,
        )

    def test_approval_after_revoke_starts_fresh(self):
        payment_service.approve(self.db, self.owner.id, self.request_id(self.submit()))
        payment_service.revoke(self.db, self.owner.id, self.course_id, self.student.id)
        before = datetime.now(timezone.utc)
        payment_service.approve(self.db, self.owner.id, self.request_id(self.submit(data=JPEG)))
        row = self.access_row()
        self.assertIsNone(row.revoked_at)
        self.assertLess(payment_rules.aware(row.expires_at), before + timedelta(days=31))
        self.assertTrue(self.can_open())

    def test_revoking_permanent_access_works(self):
        studio_service.update_course(self.db, self.owner.id, self.course_id, {"access_days": None})
        payment_service.approve(self.db, self.owner.id, self.request_id(self.submit()))
        payment_service.revoke(self.db, self.owner.id, self.course_id, self.student.id)
        self.assertFalse(self.can_open())

    def test_revoking_nothing_is_a_404(self):
        self.assertEqual(
            self.status_of(payment_service.revoke, self.db, self.owner.id, self.course_id, self.student.id),
            404,
        )


class TeacherIsolation(Case):
    def setUp(self):
        super().setUp()
        self.request = self.request_id(self.submit())
        self.db.add(ClassCourse(class_id="class-a", course_id=self.course_id))
        self.db.add(ClassTeacher(class_id="class-a", teacher_id=self.rival.id))
        self.db.commit()

    def test_a_rival_who_teaches_the_class_still_cannot_review(self):
        s = self.status_of
        self.assertEqual(s(payment_service.approve, self.db, self.rival.id, self.request), 404)
        self.assertEqual(s(payment_service.reject, self.db, self.rival.id, self.request, None), 404)
        self.assertEqual(s(payment_service.read_proof, self.db, self.rival.id, self.request), 404)
        self.assertEqual(s(payment_service.list_access, self.db, self.rival.id, self.course_id), 404)
        self.assertEqual(
            s(payment_service.revoke, self.db, self.rival.id, self.course_id, self.student.id), 404
        )
        listed = payment_service.list_for_review(self.db, self.rival.id, None, None, None, 50, 0)
        self.assertEqual((listed["items"], listed["total"], listed["pending_total"]), ([], 0, 0))

    def test_filters_cannot_widen_what_a_teacher_sees(self):
        by_course = payment_service.list_for_review(self.db, self.rival.id, None, self.course_id, None, 50, 0)
        by_teacher = payment_service.list_for_review(self.db, self.rival.id, None, None, self.owner.id, 50, 0)
        self.assertEqual(by_course["items"], [])
        self.assertEqual(by_teacher["items"], [])

    def test_owner_and_admin_can(self):
        self.assertEqual(
            payment_service.list_for_review(self.db, self.owner.id, None, None, None, 50, 0)["total"], 1
        )
        self.assertEqual(
            payment_service.list_for_review(self.db, self.admin.id, None, None, None, 50, 0)["total"], 1
        )
        data, media_type = payment_service.read_proof(self.db, self.admin.id, self.request)
        self.assertEqual((data, media_type), (PNG, "image/png"))
        self.assertEqual(payment_service.approve(self.db, self.admin.id, self.request)["status"], "approved")


class AdminPowers(Case):
    def test_admin_can_edit_any_course_and_a_rival_cannot(self):
        studio_service.update_course(self.db, self.admin.id, self.course_id, {"title": "By admin"})
        studio_service.set_course_status(self.db, self.admin.id, self.course_id, "unpublish")
        self.assertEqual(self.db.get(Course, self.course_id).status, "unpublished")
        self.assertEqual(
            self.status_of(studio_service.update_course, self.db, self.rival.id, self.course_id, {"title": "x"}),
            404,
        )
        self.assertEqual(
            self.status_of(studio_service.set_course_status, self.db, self.rival.id, self.course_id, "publish"),
            404,
        )

    def test_admin_bypass_reaches_the_raw_sql_checks_too(self):
        from app import content_access

        self.assertEqual(content_access.get_lesson(self.db, self.admin.id, self.lesson_id).id, self.lesson_id)
        self.assertEqual(self.status_of(content_access.get_lesson, self.db, self.rival.id, self.lesson_id), 404)

    def test_admin_sees_every_course(self):
        self.assertIn(self.course_id, studio_access.visible_course_ids_for_teacher(self.db, self.admin.id))
        self.assertNotIn(self.course_id, studio_access.visible_course_ids_for_teacher(self.db, self.rival.id))

    def test_grant_extend_and_revoke_without_a_payment(self):
        out = admin_service.grant_access(self.db, self.admin.id, self.course_id, self.student.id, 10)
        self.assertEqual(out["source"], "admin")
        self.assertTrue(self.can_open())
        first = payment_rules.aware(self.access_row().expires_at)
        admin_service.grant_access(self.db, self.admin.id, self.course_id, self.student.id, 10)
        self.db.expire_all()
        self.assertEqual(payment_rules.aware(self.access_row().expires_at), first + timedelta(days=10))
        admin_service.grant_access(self.db, self.admin.id, self.course_id, self.student.id, None)
        self.db.expire_all()
        self.assertIsNone(self.access_row().expires_at)
        payment_service.revoke(self.db, self.admin.id, self.course_id, self.student.id)
        self.assertFalse(self.can_open())

    def test_access_cannot_be_granted_to_a_teacher(self):
        self.assertEqual(
            self.status_of(admin_service.grant_access, self.db, self.admin.id, self.course_id, self.rival.id, 5),
            404,
        )

    def test_turn_off_and_on(self):
        out = admin_service.update_person(self.db, self.admin.id, self.student.id, {"is_active": False})
        self.assertFalse(out["is_active"])
        self.assertFalse(self.db.get(Profile, self.student.id).is_active)
        admin_service.update_person(self.db, self.admin.id, self.student.id, {"is_active": True})
        self.assertTrue(self.db.get(Profile, self.student.id).is_active)

    def test_promote_and_return(self):
        out = admin_service.update_person(self.db, self.admin.id, self.student.id, {"role": "teacher"})
        self.assertEqual(out["role"], "teacher")
        admin_service.update_person(self.db, self.admin.id, self.student.id, {"role": "student"})
        self.assertEqual(self.db.get(Profile, self.student.id).role, "student")

    def test_a_teacher_who_owns_courses_cannot_be_returned_to_student(self):
        self.assertEqual(
            self.status_of(admin_service.update_person, self.db, self.admin.id, self.owner.id, {"role": "student"}),
            409,
        )

    def test_admin_cannot_lock_themself_out(self):
        for values in ({"is_active": False}, {"role": "student"}):
            self.assertEqual(
                self.status_of(admin_service.update_person, self.db, self.admin.id, self.admin.id, values), 409
            )

    def test_owner_transfer_moves_the_review_queue(self):
        self.submit()
        out = admin_service.set_owner(self.db, self.admin.id, self.course_id, str(self.rival.id))
        self.assertEqual(out["owner_id"], str(self.rival.id))
        self.assertEqual(payment_service.list_for_review(self.db, self.rival.id, None, None, None, 50, 0)["total"], 1)
        self.assertEqual(payment_service.list_for_review(self.db, self.owner.id, None, None, None, 50, 0)["total"], 0)

    def test_owner_must_be_an_active_teacher(self):
        for target in (str(self.student.id), "not-a-uuid", str(uuid.uuid4())):
            self.assertEqual(
                self.status_of(admin_service.set_owner, self.db, self.admin.id, self.course_id, target), 422
            )

    def test_people_search(self):
        found = admin_service.list_people(self.db, None, "classm", 50, 0)
        self.assertEqual([p["name"] for p in found["items"]], ["Classmate"])
        teachers = admin_service.list_people(self.db, "teacher", None, 50, 0)
        self.assertEqual({p["role"] for p in teachers["items"]}, {"teacher"})
        self.assertEqual(admin_service.list_people(self.db, None, "100%", 50, 0)["total"], 0)
        self.assertEqual(admin_service.list_people(self.db, None, "_", 50, 0)["total"], 0)

    def test_person_detail(self):
        payment_service.approve(self.db, self.owner.id, self.request_id(self.submit()))
        detail = admin_service.person_detail(self.db, self.student.id)
        self.assertEqual(len(detail["requests"]), 1)
        self.assertEqual(detail["access"][0]["state"], "active")
        self.assertEqual(
            [c["id"] for c in admin_service.person_detail(self.db, self.owner.id)["owned_courses"]],
            [self.course_id],
        )


class OverHttp(Case):
    """The real routes, so a forgotten check on any of them fails here."""

    def setUp(self):
        super().setUp()
        self.addCleanup(app.dependency_overrides.clear)
        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app, raise_server_exceptions=True)
        self.act_as(self.student)

        self.video = studio_service.create_activity(
            self.db, self.owner.id, self.lesson_id, {"kind": "video", "video_url": YOUTUBE}
        )
        quiz = Quiz(lesson_id=self.lesson_id)
        practice = Practice(lesson_id=self.lesson_id, title="P")
        self.db.add_all([quiz, practice])
        self.db.flush()
        self.question = QuizQuestion(
            quiz_id=quiz.id, question="Q", options=["a", "b"], correct_index=0, sort_order=0
        )
        self.item = PracticeItem(
            practice_id=practice.id, type="choose", question="Q", options=["a", "b"],
            correct_index=0, sort_order=0,
        )
        self.db.add_all([self.question, self.item])
        self.db.commit()

    def act_as(self, person):
        user = {
            "id": str(person.id),
            "name": person.name,
            "email": "x@example.com",
            "role": person.role,
            "is_active": True,
            "created_at": person.created_at,
            "class_id": person.class_id,
            "is_admin": person.is_admin,
        }

        # Only who is asking is faked. The real role checks all run.
        app.dependency_overrides[get_current_user] = lambda: user

    def gated_calls(self):
        lesson = self.lesson_id
        return {
            "get quiz": lambda: self.client.get(f"/lessons/{lesson}/quiz"),
            "submit quiz": lambda: self.client.post(
                f"/lessons/{lesson}/quiz/submit",
                json={"answers": [{"question_id": self.question.id, "selected_index": 0}]},
            ),
            "get practice": lambda: self.client.get(f"/lessons/{lesson}/practice"),
            "submit practice": lambda: self.client.post(
                f"/lessons/{lesson}/practice/submit",
                json={"answers": [{"item_id": self.item.id, "selected_index": 0}]},
            ),
            "activities": lambda: self.client.get(f"/lessons/{lesson}/activities"),
            "mark complete": lambda: self.client.post(f"/activities/{self.video['id']}/complete"),
        }

    def assert_closed(self):
        for name, call in self.gated_calls().items():
            self.assertEqual(call().status_code, 404, name)

    def assert_open(self):
        for name, call in self.gated_calls().items():
            self.assertEqual(call().status_code, 200, name)

    def upload(self, data=PNG, course_id=None, **extra):
        return self.client.post(
            f"/courses/{course_id or self.course_id}/payment-requests",
            files={"proof": ("../../evil.svg", io.BytesIO(data), "image/svg+xml")},
            **extra,
        )

    def test_locked_student_is_refused_on_every_lesson_path(self):
        self.assert_closed()

    def test_every_path_follows_each_access_state(self):
        request = uuid.UUID(self.upload().json()["id"])
        self.assert_closed()  # pending opens nothing
        payment_service.approve(self.db, self.owner.id, request)
        self.assert_open()
        self.set_expiry(datetime.now(timezone.utc) - timedelta(seconds=1))
        self.assert_closed()
        self.set_expiry(datetime.now(timezone.utc) + timedelta(days=1))
        self.assert_open()
        payment_service.revoke(self.db, self.owner.id, self.course_id, self.student.id)
        self.assert_closed()

    def test_heartbeat_does_not_record_a_locked_lesson(self):
        seen = {}
        original_execute = self.db.execute

        def spy(statement, params=None, *args, **kwargs):
            if statement is presence.HEARTBEAT_UPSERT:
                seen.update(params)
                return None
            return original_execute(statement, params, *args, **kwargs)

        self.db.execute = spy
        self.addCleanup(lambda: setattr(self.db, "execute", original_execute))
        self.assertEqual(self.client.post("/me/heartbeat", json={"lesson_id": self.lesson_id}).status_code, 204)
        self.assertIsNone(seen["lesson_id"])

    def test_course_routes_hide_video_links_while_locked(self):
        lesson = self.db.get(Lesson, self.lesson_id)
        self.assertEqual(lesson.video_url, YOUTUBE)  # the synced legacy copy is what /courses sends

        def links(body):
            return [l["video_url"] for m in body["modules"] for l in m["lessons"]]

        listed = next(c for c in self.client.get("/courses").json() if c["id"] == self.course_id)
        detail = self.client.get(f"/courses/{self.course_id}").json()
        for body in (listed, detail):
            self.assertEqual(links(body), [None])
            self.assertEqual(body["access"]["state"], "locked")
            self.assertEqual(body["price"], "500.00")
            self.assertEqual(body["currency"], "ETB")
            self.assertEqual(body["access_days"], 30)
            self.assertEqual(body["payment_instructions"], "Send to 0911")
            self.assertEqual(body["modules"][0]["lessons"][0]["title"], "L1")  # outline still sells it
        self.assertNotIn(YOUTUBE, self.client.get("/courses").text)

        payment_service.approve(self.db, self.owner.id, self.request_id(self.submit()))
        opened = self.client.get(f"/courses/{self.course_id}").json()
        self.assertEqual(links(opened), [YOUTUBE])
        self.assertEqual(opened["access"]["state"], "active")
        self.assertIsNotNone(opened["access"]["expires_at"])

    def test_a_student_is_told_before_paying_if_it_cannot_be_bought(self):
        self.db.add(LessonProgress(student_id=self.student.id, lesson_id=self.lesson_id))
        self.db.commit()
        self.assertTrue(self.client.get(f"/courses/{self.course_id}").json()["purchasable"])
        studio_service.set_course_status(self.db, self.owner.id, self.course_id, "unpublish")
        self.assertFalse(self.client.get(f"/courses/{self.course_id}").json()["purchasable"])

    def test_course_routes_report_pending_requests(self):
        self.upload()
        self.upload(JPEG)
        body = self.client.get(f"/courses/{self.course_id}").json()
        self.assertEqual(body["access"]["pending_requests"], 2)
        self.assertEqual(body["access"]["state"], "locked")

    def test_teachers_keep_their_view_and_have_no_access_block(self):
        self.act_as(self.owner)
        body = self.client.get(f"/courses/{self.course_id}").json()
        self.assertIsNone(body["access"])
        self.assertEqual(body["modules"][0]["lessons"][0]["video_url"], YOUTUBE)

    def test_upload_ignores_the_claimed_name_and_type(self):
        response = self.upload()
        self.assertEqual(response.status_code, 201)
        (path,) = self.storage.files
        self.assertNotIn("evil", path)
        self.assertTrue(path.endswith(".png"))
        self.assertEqual(self.storage.files[path][1], "image/png")

    def test_a_repeat_upload_answers_200(self):
        self.assertEqual(self.upload().status_code, 201)
        self.assertEqual(self.upload().status_code, 200)

    def test_a_student_cannot_send_a_price(self):
        response = self.client.post(
            f"/courses/{self.course_id}/payment-requests",
            data={"amount": "1", "currency": "USD", "access_days": "99999", "status": "approved"},
            files={"proof": ("p.png", io.BytesIO(PNG), "image/png")},
        )
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual((body["amount"], body["currency"], body["access_days"], body["status"]),
                         ("500.00", "ETB", 30, "pending"))

    def test_oversized_upload_is_stopped_before_the_route(self):
        response = self.upload(PNG + b"x" * (MAX_PROOF_BYTES + 100 * 1024))
        self.assertEqual(response.status_code, 413)
        self.assertEqual(self.storage.files, {})

    def chunked_upload(self, data):
        """How a phone sends it: streamed, with no Content-Length."""
        boundary = "rigboundary"
        head = (
            f'--{boundary}\r\nContent-Disposition: form-data; name="proof"; filename="p.png"\r\n'
            "Content-Type: image/png\r\n\r\n"
        ).encode()
        tail = f"\r\n--{boundary}--\r\n".encode()

        def chunks():
            yield head
            for at in range(0, len(data), 65536):
                yield data[at:at + 65536]
            yield tail

        return self.client.post(
            f"/courses/{self.course_id}/payment-requests",
            content=chunks(),
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
        )

    def test_a_streamed_upload_with_no_length_works(self):
        response = self.chunked_upload(PNG)
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(len(self.storage.files), 1)

    def test_a_streamed_upload_cannot_slip_past_the_limit(self):
        response = self.chunked_upload(PNG + b"x" * (MAX_PROOF_BYTES + 100 * 1024))
        self.assertEqual(response.status_code, 413, response.text)
        self.assertEqual(self.storage.files, {})

    def test_a_student_is_refused_on_every_review_and_admin_route(self):
        request = self.request_id(self.submit())
        base = "/teacher/payment-requests"
        calls = [
            ("get", base), ("get", f"{base}/{request}/proof"), ("post", f"{base}/{request}/approve"),
            ("post", f"{base}/{request}/reject"), ("get", f"/teacher/courses/{self.course_id}/access"),
            ("delete", f"/teacher/courses/{self.course_id}/access/{self.student.id}"),
        ]
        for method, url in calls:
            self.assertEqual(getattr(self.client, method)(url).status_code, 403, url)
        self.assertEqual(self.db.get(PaymentRequest, request).status, "pending")
        self.assertIsNone(self.access_row())

    def test_ordinary_teachers_get_404_on_admin_routes(self):
        self.act_as(self.rival)
        calls = [
            ("get", "/admin/people", None),
            ("get", f"/admin/people/{self.student.id}", None),
            ("patch", f"/admin/people/{self.rival.id}", {"role": "teacher"}),
            ("put", f"/admin/courses/{self.course_id}/owner", {"owner_id": str(self.rival.id)}),
            ("put", f"/admin/courses/{self.course_id}/access/{self.student.id}", {"access_days": None}),
        ]
        for method, url, body in calls:
            kwargs = {} if body is None else {"json": body}
            self.assertEqual(getattr(self.client, method)(url, **kwargs).status_code, 404, url)

    def test_no_api_can_set_is_admin(self):
        self.act_as(self.admin)
        response = self.client.patch(f"/admin/people/{self.rival.id}", json={"is_admin": True})
        self.assertEqual(response.status_code, 422)
        self.assertFalse(self.db.get(Profile, self.rival.id).is_admin)
        self.assertEqual(
            self.client.patch(f"/admin/people/{self.rival.id}", json={"role": "admin"}).status_code, 422
        )

    def test_pricing_route_refuses_unknown_fields(self):
        self.act_as(self.owner)
        for field in ("currency", "owner_id", "status"):
            response = self.client.patch(f"/teacher/courses/{self.course_id}", json={field: "x"})
            self.assertEqual(response.status_code, 422, field)

    def test_proof_response_is_locked_down(self):
        request = self.request_id(self.submit())
        self.act_as(self.owner)
        response = self.client.get(f"/teacher/payment-requests/{request}/proof")
        self.assertEqual(response.content, PNG)
        self.assertEqual(response.headers["content-type"], "image/png")
        self.assertEqual(response.headers["cache-control"], "no-store")
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")

    def test_review_flow_over_http(self):
        self.upload()
        self.act_as(self.owner)
        listed = self.client.get("/teacher/payment-requests?status=pending").json()
        self.assertEqual(listed["pending_total"], 1)
        item = listed["items"][0]
        self.assertEqual(item["student"]["name"], "Student")
        self.assertIn("@example.com", item["student"]["email"])
        self.assertNotIn("proof_path", item)
        rejected = self.client.post(
            f"/teacher/payment-requests/{item['id']}/reject", json={"note": "Wrong amount"}
        )
        self.assertEqual(rejected.json()["review_note"], "Wrong amount")
        self.act_as(self.student)
        mine = self.client.get("/me/payment-requests").json()
        self.assertEqual((mine[0]["status"], mine[0]["review_note"]), ("rejected", "Wrong amount"))
        self.assertNotIn("proof_path", mine[0])

    def test_reject_works_with_no_body(self):
        request = self.request_id(self.submit())
        self.act_as(self.owner)
        response = self.client.post(f"/teacher/payment-requests/{request}/reject")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["review_note"])

    def test_auth_me_reports_is_admin(self):
        self.act_as(self.admin)
        self.assertTrue(self.client.get("/auth/me").json()["is_admin"])
        self.act_as(self.student)
        self.assertFalse(self.client.get("/auth/me").json()["is_admin"])


class NationalRanking(unittest.TestCase):
    def rows(self, count):
        return [
            {
                "id": uuid.uuid4(),
                "name": f"Student{i:03d} Family{i:03d}",
                "xp": Decimal(10000 - i),
                "weekly_xp": Decimal(i),
                "monthly_xp": Decimal(0),
            }
            for i in range(count)
        ]

    def test_names(self):
        self.assertEqual(stats.public_name("Abebe Kebede"), "Abebe K.")
        self.assertEqual(stats.public_name("Abebe Tesfaye Kebede"), "Abebe K.")
        self.assertEqual(stats.public_name("Abebe"), "Abebe")
        self.assertEqual(stats.public_name("  "), "Student")

    def test_a_stranger_gets_no_ids_and_no_family_names(self):
        rows = self.rows(5)
        board = stats.national_board(rows, str(uuid.uuid4()), "overall")
        self.assertEqual({entry["id"] for entry in board}, {""})
        self.assertFalse([e for e in board if "Family" in e["name"]])

    def test_top_fifty_plus_own_row_with_its_real_position(self):
        rows = self.rows(200)
        me = rows[149]
        board = stats.national_board(rows, str(me["id"]), "overall")
        self.assertEqual(len(board), 51)
        self.assertEqual(board[-1]["id"], str(me["id"]))
        self.assertEqual(board[-1]["position"], 150)
        self.assertEqual([e["position"] for e in board[:50]], list(range(1, 51)))

    def test_own_row_is_not_repeated_inside_the_top(self):
        rows = self.rows(60)
        board = stats.national_board(rows, str(rows[0]["id"]), "overall")
        self.assertEqual(len(board), 50)
        self.assertEqual(board[0]["id"], str(rows[0]["id"]))

    def test_the_top_follows_the_period(self):
        rows = self.rows(60)
        board = stats.national_board(rows, str(uuid.uuid4()), "weekly")
        self.assertEqual(board[0]["weekly_xp"], Decimal(59))


class Migration(unittest.TestCase):
    def read(self, name):
        repo = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
        with open(os.path.join(repo, "supabase", "pending", name), encoding="utf-8") as handle:
            return handle.read()

    def test_new_tables_are_private(self):
        sql = self.read("20261106000000_course_marketplace.sql")
        self.assertIn(
            "revoke all on table public.payment_requests, public.course_access from public, anon, authenticated",
            sql,
        )
        self.assertIn("alter table public.payment_requests enable row level security", sql)
        self.assertIn("alter table public.course_access    enable row level security", sql)
        self.assertNotRegex(sql, r"create policy")

    def test_bucket_is_private(self):
        sql = self.read("20261106000000_course_marketplace.sql")
        self.assertIn("'payment-proofs', 'payment-proofs', false", sql)
        self.assertNotIn("storage.objects", sql)

    def test_existing_data_stays_free_and_nothing_is_rewritten(self):
        sql = self.read("20261106000000_course_marketplace.sql").lower()
        self.assertIn("price                numeric(10,2) not null default 0", sql)
        for statement in ("update public.", "delete from", "drop "):
            self.assertNotIn(statement, sql)

    def test_payment_history_does_not_cascade(self):
        sql = self.read("20261106000000_course_marketplace.sql")
        table = sql[sql.index("create table public.payment_requests"):sql.index("create index payment_requests_review_idx")]
        self.assertNotIn("on delete cascade", table)

    def test_rollback_refuses_once_in_use(self):
        sql = self.read("course_marketplace_rollback_pre_use_only.sql")
        self.assertLess(sql.index("REFUSED"), sql.index("drop table"))

    def test_sql_is_outside_the_migrations_folder(self):
        repo = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
        self.assertFalse([n for n in os.listdir(os.path.join(repo, "supabase", "migrations")) if "marketplace" in n])


if __name__ == "__main__":
    unittest.main(verbosity=1)
