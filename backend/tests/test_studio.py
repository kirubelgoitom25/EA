"""Plain-Python tests for Course Studio: permissions, visibility, ordering,
optional completion, video sync and protection of historical data.

Run from the repo root with the backend virtualenv:
    .venv/bin/python -I backend/tests/test_studio.py
No server and no Postgres are used: an in-memory SQLite database stands in, so
the Postgres-only parts (triggers, the real foreign keys) are covered by the
migration checks at the bottom, which read the SQL files, and by the verification
queries inside the backfill script itself.
"""
import os
import re
import sqlite3
import sys
import unittest
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://x:x@localhost/x")
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import create_engine, func, select  # noqa: E402
from sqlalchemy.dialects.postgresql import JSONB  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

sqlite3.register_adapter(uuid.UUID, lambda u: u.hex)  # raw SQL binds match CHAR(32) UUIDs


@compiles(JSONB, "sqlite")
def _jsonb_as_json(type_, compiler, **kw):
    return "JSON"


from app import content_access, content_service, studio_access, studio_service, studio_sync  # noqa: E402
from app.content_rules import ContentError  # noqa: E402
from app.database import Base  # noqa: E402
from app.models import (  # noqa: E402
    ActivityProgress,
    Class,
    ClassCourse,
    ClassTeacher,
    Course,
    Lesson,
    LessonActivity,
    LessonProgress,
    Module,
    Practice,
    PracticeAttempt,
    Profile,
    Quiz,
    QuizAttempt,
    QuizQuestion,
)

REPO = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
PENDING = os.path.join(REPO, "supabase", "pending")
YOUTUBE = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
YOUTUBE2 = "https://youtu.be/9bZkp7q19f0"


def read_sql(name):
    with open(os.path.join(PENDING, name), encoding="utf-8") as handle:
        return handle.read()


class StudioCase(unittest.TestCase):
    def setUp(self):
        engine = create_engine(
            "sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False}
        )
        Base.metadata.create_all(engine)
        self.db = sessionmaker(bind=engine, autoflush=False)()
        self.addCleanup(self.db.close)

        self.class_a = Class(id="class-a", name="A")
        self.class_b = Class(id="class-b", name="B")
        self.db.add_all([self.class_a, self.class_b])
        self.db.flush()
        self.teacher = self._profile("teacher", None)
        self.other = self._profile("teacher", None)
        self.class_teacher = self._profile("teacher", None)
        self.student = self._profile("student", "class-a")
        self.stranger = self._profile("student", None)  # no class at all
        self.db.add(ClassTeacher(class_id="class-a", teacher_id=self.class_teacher.id))
        self.db.commit()

    def _profile(self, role, class_id):
        p = Profile(id=uuid.uuid4(), name=role, role=role, class_id=class_id)
        self.db.add(p)
        self.db.flush()
        return p

    # ---- builders -------------------------------------------------------------

    def studio_course(self, owner=None, publish=True, lessons=1):
        owner = owner or self.teacher
        course = studio_service.create_course(self.db, owner.id, "Biology", "About life")
        module = studio_service.create_module(self.db, owner.id, course["id"], "Cells")
        lesson_ids = [
            studio_service.create_lesson(self.db, owner.id, module["id"], {"title": f"L{i}"})["id"]
            for i in range(lessons)
        ]
        if publish:
            studio_service.set_course_status(self.db, owner.id, course["id"], "publish")
        return course["id"], module["id"], lesson_ids

    def legacy_course(self):
        """An ownerless, published course given to class-a, like the 6 live ones."""
        self.db.add(Course(id="legacy", title="Old", description="d", status="published"))
        self.db.add(Module(id="legacy-m", course_id="legacy", title="M", sort_order=0))
        self.db.add(
            Lesson(id="legacy-l", module_id="legacy-m", title="L", sort_order=0, video_url=YOUTUBE)
        )
        self.db.add(ClassCourse(class_id="class-a", course_id="legacy"))
        self.db.commit()
        return "legacy", "legacy-m", "legacy-l"

    def activity(self, lesson_id, kind="video", owner=None, **extra):
        body = {"kind": kind, **extra}
        if kind == "video":
            body.setdefault("video_url", YOUTUBE)
        if kind == "reading":
            body.setdefault("reading_body", "Read this.")
        return studio_service.create_activity(self.db, (owner or self.teacher).id, lesson_id, body)

    def count(self, model):
        return self.db.execute(select(func.count()).select_from(model)).scalar_one()

    def http_status(self, fn, *args, **kwargs):
        with self.assertRaises(HTTPException) as ctx:
            fn(*args, **kwargs)
        return ctx.exception.status_code


# ---- course ownership and permissions ---------------------------------------------


class OwnershipTests(StudioCase):
    def test_new_course_is_a_private_draft_owned_by_its_creator(self):
        course = studio_service.create_course(self.db, self.teacher.id, "Bio", "x")
        row = self.db.get(Course, course["id"])
        self.assertEqual((row.owner_id, row.status), (self.teacher.id, "draft"))
        self.assertIsNotNone(row.created_at)
        self.assertIsNone(row.published_at)

    def test_only_the_owner_can_edit_an_owned_course(self):
        course_id, module_id, lesson_ids = self.studio_course()
        for call in (
            lambda: studio_service.get_outline(self.db, self.other.id, course_id),
            lambda: studio_service.update_course(self.db, self.other.id, course_id, {"title": "x"}),
            lambda: studio_service.create_module(self.db, self.other.id, course_id, "x"),
            lambda: studio_service.create_lesson(self.db, self.other.id, module_id, {"title": "x"}),
            lambda: studio_service.list_activities(self.db, self.other.id, lesson_ids[0]),
            lambda: self.activity(lesson_ids[0], owner=self.other),
        ):
            self.assertEqual(self.http_status(call), 404)
        studio_service.update_course(self.db, self.teacher.id, course_id, {"title": "New"})
        self.assertEqual(self.db.get(Course, course_id).title, "New")

    def test_class_teacher_cannot_edit_an_owned_course_given_to_their_class(self):
        course_id, _, lesson_ids = self.studio_course()
        self.db.add(ClassCourse(class_id="class-a", course_id=course_id))
        self.db.commit()
        self.assertEqual(
            self.http_status(studio_service.get_outline, self.db, self.class_teacher.id, course_id), 404
        )
        # the older quiz/practice editor obeys the same rule
        self.assertEqual(
            self.http_status(content_access.get_lesson, self.db, self.class_teacher.id, lesson_ids[0]), 404
        )
        self.assertEqual(content_access.get_lesson(self.db, self.teacher.id, lesson_ids[0]).id, lesson_ids[0])

    def test_ownerless_legacy_course_keeps_class_based_editing(self):
        course_id, module_id, lesson_id = self.legacy_course()
        # a teacher of class-a may still edit, as before
        self.assertEqual(content_access.get_lesson(self.db, self.class_teacher.id, lesson_id).id, lesson_id)
        studio_service.create_lesson(self.db, self.class_teacher.id, module_id, {"title": "New"})
        # a teacher with no class that has it may not
        self.assertEqual(self.http_status(studio_service.get_outline, self.db, self.other.id, course_id), 404)
        self.assertEqual(
            self.http_status(content_access.get_lesson, self.db, self.other.id, lesson_id), 404
        )

    def test_legacy_course_cannot_be_published_unpublished_or_deleted(self):
        course_id, _, _ = self.legacy_course()
        for action in ("publish", "unpublish"):
            self.assertEqual(
                self.http_status(studio_service.set_course_status, self.db, self.class_teacher.id, course_id, action),
                403,
            )
        self.assertEqual(
            self.http_status(studio_service.delete_course, self.db, self.class_teacher.id, course_id), 403
        )
        self.assertEqual(self.db.get(Course, course_id).status, "published")

    def test_any_teacher_can_publish_their_own_course_but_not_an_empty_one(self):
        course = studio_service.create_course(self.db, self.other.id, "Empty", "x")
        self.assertEqual(
            self.http_status(studio_service.set_course_status, self.db, self.other.id, course["id"], "publish"), 422
        )
        course_id, _, _ = self.studio_course(owner=self.other)
        row = self.db.get(Course, course_id)
        self.assertEqual(row.status, "published")
        self.assertIsNotNone(row.published_at)

    def test_status_transitions(self):
        course_id, _, _ = self.studio_course()
        studio_service.set_course_status(self.db, self.teacher.id, course_id, "unpublish")
        self.assertEqual(self.db.get(Course, course_id).status, "unpublished")
        first_published = self.db.get(Course, course_id).published_at
        studio_service.set_course_status(self.db, self.teacher.id, course_id, "publish")
        self.assertEqual(self.db.get(Course, course_id).published_at, first_published)
        self.assertEqual(
            self.http_status(studio_service.set_course_status, self.db, self.teacher.id, course_id, "publish"), 409
        )

    def test_my_courses_marks_what_is_editable(self):
        owned, _, _ = self.studio_course(owner=self.class_teacher)
        legacy, _, _ = self.legacy_course()
        rows = {c["id"]: c for c in studio_service.list_my_courses(self.db, self.class_teacher.id)}
        self.assertTrue(rows[owned]["owned"] and rows[owned]["editable"])
        self.assertFalse(rows[legacy]["owned"])
        self.assertTrue(rows[legacy]["editable"])


# ---- draft / published / unpublished visibility ----------------------------------------


class VisibilityTests(StudioCase):
    def visible(self, student):
        return studio_access.visible_course_ids_for_student(self.db, student.id, student.class_id)

    def test_draft_is_private_to_its_creator(self):
        course_id, _, lesson_ids = self.studio_course(publish=False)
        self.assertNotIn(course_id, self.visible(self.student))
        self.assertNotIn(course_id, self.visible(self.stranger))
        self.assertIn(course_id, studio_access.visible_course_ids_for_teacher(self.db, self.teacher.id))
        self.assertNotIn(course_id, studio_access.visible_course_ids_for_teacher(self.db, self.other.id))
        self.assertFalse(studio_access.student_can_see_lesson(self.db, self.student.id, "class-a", lesson_ids[0]))

    def test_a_draft_given_to_a_class_is_still_hidden(self):
        course_id, _, _ = self.studio_course(publish=False)
        self.db.add(ClassCourse(class_id="class-a", course_id=course_id))
        self.db.commit()
        self.assertNotIn(course_id, self.visible(self.student))

    def test_published_course_is_global_even_for_a_student_without_a_class(self):
        course_id, _, lesson_ids = self.studio_course()
        self.assertIn(course_id, self.visible(self.stranger))
        self.assertIn(course_id, self.visible(self.student))
        self.assertTrue(studio_access.student_can_see_lesson(self.db, self.stranger.id, None, lesson_ids[0]))

    def test_unpublished_hides_from_new_students_but_not_those_progressing(self):
        course_id, _, lesson_ids = self.studio_course()
        self.db.add(LessonProgress(student_id=self.student.id, lesson_id=lesson_ids[0]))
        self.db.commit()
        studio_service.set_course_status(self.db, self.teacher.id, course_id, "unpublish")
        self.assertIn(course_id, self.visible(self.student))  # already progressing
        self.assertNotIn(course_id, self.visible(self.stranger))  # new student
        self.assertTrue(studio_access.student_can_see_lesson(self.db, self.student.id, "class-a", lesson_ids[0]))

    def test_progress_through_an_activity_also_keeps_access(self):
        course_id, _, lesson_ids = self.studio_course()
        video = self.activity(lesson_ids[0])
        studio_service.mark_activity_complete(self.db, self.stranger.id, None, video["id"])
        self.db.query(LessonProgress).delete()  # only the activity progress is left
        self.db.commit()
        studio_service.set_course_status(self.db, self.teacher.id, course_id, "unpublish")
        self.assertIn(course_id, self.visible(self.stranger))

    def test_legacy_course_stays_class_only(self):
        course_id, _, lesson_id = self.legacy_course()
        self.assertIn(course_id, self.visible(self.student))
        self.assertNotIn(course_id, self.visible(self.stranger))
        self.assertFalse(studio_access.student_can_see_lesson(self.db, self.stranger.id, None, lesson_id))

    def test_archived_lesson_or_module_is_not_open_to_students(self):
        course_id, module_id, lesson_ids = self.studio_course()
        studio_service.update_lesson(self.db, self.teacher.id, lesson_ids[0], {"archived": True})
        self.assertFalse(studio_access.student_can_see_lesson(self.db, self.student.id, "class-a", lesson_ids[0]))
        studio_service.update_lesson(self.db, self.teacher.id, lesson_ids[0], {"archived": False})
        studio_service.update_module(self.db, self.teacher.id, module_id, {"archived": True})
        self.assertFalse(studio_access.student_can_see_lesson(self.db, self.student.id, "class-a", lesson_ids[0]))

    def test_student_cannot_list_or_complete_activities_of_a_draft(self):
        _, _, lesson_ids = self.studio_course(publish=False)
        video = self.activity(lesson_ids[0])
        self.assertEqual(
            self.http_status(studio_service.student_lesson_activities, self.db, self.student.id, "class-a", lesson_ids[0]),
            404,
        )
        self.assertEqual(
            self.http_status(studio_service.mark_activity_complete, self.db, self.student.id, "class-a", video["id"]),
            404,
        )


# ---- activity ordering ---------------------------------------------------------------------


class OrderingTests(StudioCase):
    def setUp(self):
        super().setUp()
        _, _, lessons = self.studio_course()
        self.lesson = lessons[0]

    def kinds(self):
        return [a["kind"] for a in studio_service.list_activities(self.db, self.teacher.id, self.lesson) if not a["archived"]]

    def test_activities_append_in_creation_order_and_can_be_mixed_freely(self):
        self.activity(self.lesson, "video")
        self.activity(self.lesson, "quiz")
        self.activity(self.lesson, "practice")
        self.activity(self.lesson, "reading")
        self.assertEqual(self.kinds(), ["video", "quiz", "practice", "reading"])

    def test_reorder_into_any_order(self):
        ids = [self.activity(self.lesson, k)["id"] for k in ("video", "quiz", "practice", "reading")]
        studio_service.reorder_activities(self.db, self.teacher.id, self.lesson, [ids[3], ids[1], ids[0], ids[2]])
        self.assertEqual(self.kinds(), ["reading", "quiz", "video", "practice"])
        shown = studio_service.student_lesson_activities(self.db, self.student.id, "class-a", self.lesson)
        self.assertEqual([a["kind"] for a in shown["activities"]], ["reading", "quiz", "video", "practice"])

    def test_reorder_must_list_every_active_activity_exactly_once(self):
        a = self.activity(self.lesson, "video")["id"]
        b = self.activity(self.lesson, "reading")["id"]
        for bad in ([a], [a, a], [a, b, 999], []):
            self.assertEqual(
                self.http_status(studio_service.reorder_activities, self.db, self.teacher.id, self.lesson, bad), 422
            )
        self.assertEqual(self.kinds(), ["video", "reading"])

    def test_archived_activities_are_hidden_from_students_and_ordering(self):
        a = self.activity(self.lesson, "video")["id"]
        b = self.activity(self.lesson, "reading")["id"]
        studio_service.update_activity(self.db, self.teacher.id, a, {"archived": True})
        shown = studio_service.student_lesson_activities(self.db, self.student.id, "class-a", self.lesson)
        self.assertEqual([x["id"] for x in shown["activities"]], [b])
        studio_service.reorder_activities(self.db, self.teacher.id, self.lesson, [b])  # archived one not listed
        self.assertEqual(self.http_status(
            studio_service.reorder_activities, self.db, self.teacher.id, self.lesson, [a, b]), 422)

    def test_chapter_and_lesson_ordering(self):
        course_id, module_id, lessons = self.studio_course(lessons=3)
        studio_service.reorder_lessons(self.db, self.teacher.id, module_id, [lessons[2], lessons[0], lessons[1]])
        order = [x.id for x in self.db.query(Lesson).filter_by(module_id=module_id).order_by(Lesson.sort_order)]
        self.assertEqual(order, [lessons[2], lessons[0], lessons[1]])
        second = studio_service.create_module(self.db, self.teacher.id, course_id, "Second")["id"]
        first = self.db.query(Module).filter_by(course_id=course_id).order_by(Module.sort_order).first().id
        studio_service.reorder_modules(self.db, self.teacher.id, course_id, [second, first])
        self.assertEqual(
            [m.id for m in self.db.query(Module).filter_by(course_id=course_id).order_by(Module.sort_order)],
            [second, first],
        )


# ---- activity rules and optional completion ----------------------------------------------------


class CompletionTests(StudioCase):
    def setUp(self):
        super().setUp()
        _, _, lessons = self.studio_course()
        self.lesson = lessons[0]

    def done(self, student=None):
        s = student or self.student
        return self.db.query(LessonProgress).filter_by(student_id=s.id, lesson_id=self.lesson).count()

    def test_nothing_is_required_by_default(self):
        for kind in ("video", "quiz", "practice", "reading"):
            self.assertFalse(self.activity(self.lesson, kind)["is_required"])
        required = self.activity.__func__  # explicit opt-in still works
        row = studio_service.create_activity(
            self.db, self.teacher.id, self.lesson,
            {"kind": "reading", "reading_body": "x", "is_required": True},
        )
        self.assertTrue(row["is_required"])

    def test_viewing_never_completes_anything(self):
        self.activity(self.lesson, "video")
        self.activity(self.lesson, "reading")
        studio_service.student_lesson_activities(self.db, self.student.id, "class-a", self.lesson)
        studio_service.student_lesson_activities(self.db, self.student.id, "class-a", self.lesson)
        self.assertEqual((self.count(ActivityProgress), self.count(LessonProgress)), (0, 0))

    def test_mark_complete_on_a_video_completes_the_lesson(self):
        video = self.activity(self.lesson, "video")
        out = studio_service.mark_activity_complete(self.db, self.student.id, "class-a", video["id"])
        self.assertEqual(out, {"activity_id": video["id"], "completed": True, "lesson_completed": True})
        self.assertEqual(self.done(), 1)

    def test_mark_complete_on_a_reading_completes_the_lesson_and_is_idempotent(self):
        reading = self.activity(self.lesson, "reading")
        for _ in range(3):
            studio_service.mark_activity_complete(self.db, self.student.id, "class-a", reading["id"])
        self.assertEqual((self.count(ActivityProgress), self.done()), (1, 1))

    def test_quiz_and_practice_cannot_be_marked_complete(self):
        quiz = self.activity(self.lesson, "quiz")
        practice = self.activity(self.lesson, "practice")
        for activity in (quiz, practice):
            self.assertEqual(
                self.http_status(studio_service.mark_activity_complete, self.db, self.student.id, "class-a", activity["id"]),
                422,
            )
        self.assertEqual((self.count(ActivityProgress), self.count(LessonProgress)), (0, 0))

    def test_a_required_activity_never_blocks_lesson_completion(self):
        studio_service.create_activity(
            self.db, self.teacher.id, self.lesson,
            {"kind": "video", "video_url": YOUTUBE, "is_required": True},
        )
        reading = self.activity(self.lesson, "reading")  # optional
        studio_service.mark_activity_complete(self.db, self.student.id, "class-a", reading["id"])
        self.assertEqual(self.done(), 1)  # the required video was never touched

    def test_each_student_completes_on_their_own(self):
        video = self.activity(self.lesson, "video")
        studio_service.mark_activity_complete(self.db, self.student.id, "class-a", video["id"])
        self.assertEqual(self.done(self.stranger), 0)

    def test_a_submitted_quiz_attempt_is_mirrored_without_touching_lesson_progress_itself(self):
        quiz = self.activity(self.lesson, "quiz")
        studio_sync.record_attempt_progress(self.db, self.student.id, self.lesson, "quiz")
        studio_sync.record_attempt_progress(self.db, self.student.id, self.lesson, "quiz")
        self.db.commit()
        rows = self.db.query(ActivityProgress).all()
        self.assertEqual([(r.activity_id, r.source) for r in rows], [(quiz["id"], "quiz_attempt")])
        self.assertEqual(self.count(LessonProgress), 0)  # the legacy route still owns that write

    def test_existing_lesson_progress_is_kept(self):
        self.db.add(LessonProgress(student_id=self.student.id, lesson_id=self.lesson))
        self.db.commit()
        video = self.activity(self.lesson, "video")
        shown = studio_service.student_lesson_activities(self.db, self.student.id, "class-a", self.lesson)
        self.assertTrue(shown["lesson_completed"])
        self.assertFalse(shown["activities"][0]["completed"])  # video completion is never invented
        studio_service.mark_activity_complete(self.db, self.student.id, "class-a", video["id"])
        self.assertEqual(self.done(), 1)

    def test_an_empty_quiz_is_not_ready(self):
        self.activity(self.lesson, "quiz")
        shown = studio_service.student_lesson_activities(self.db, self.student.id, "class-a", self.lesson)
        self.assertFalse(shown["activities"][0]["ready"])

    def test_type_specific_validation(self):
        bad = [
            {"kind": "video"},
            {"kind": "video", "video_url": "https://example.com/x"},
            {"kind": "video", "video_url": YOUTUBE, "reading_body": "x"},
            {"kind": "reading"},
            {"kind": "reading", "reading_body": "   "},
            {"kind": "quiz", "video_url": YOUTUBE},
            {"kind": "nope"},
        ]
        for body in bad:
            with self.assertRaises(ContentError, msg=str(body)):
                studio_service.create_activity(self.db, self.teacher.id, self.lesson, body)
        self.assertEqual(self.count(LessonActivity), 0)

    def test_one_quiz_and_one_practice_per_lesson(self):
        self.activity(self.lesson, "quiz")
        self.activity(self.lesson, "practice")
        for kind in ("quiz", "practice"):
            self.assertEqual(
                self.http_status(studio_service.create_activity, self.db, self.teacher.id, self.lesson, {"kind": kind}), 409
            )
        self.activity(self.lesson, "video")
        self.activity(self.lesson, "video", video_url=YOUTUBE2)  # several videos/readings are fine
        self.assertEqual(self.count(Quiz), 1)

    def test_the_legacy_editor_creates_the_activity_for_its_quiz(self):
        content_service.add_questions(
            self.db, self.teacher.id, self.lesson,
            [{"question": "2+2?", "options": ["3", "4"], "correct_index": 1}],
        )
        activities = self.db.query(LessonActivity).filter_by(lesson_id=self.lesson).all()
        self.assertEqual([(a.kind, a.is_required) for a in activities], [("quiz", False)])
        content_service.add_questions(  # a second batch must not add a second activity
            self.db, self.teacher.id, self.lesson,
            [{"question": "3+3?", "options": ["6", "7"], "correct_index": 0}],
        )
        self.assertEqual(self.count(LessonActivity), 1)


# ---- video: legacy lessons.video_url stays in step --------------------------------------------


class VideoSyncTests(StudioCase):
    def setUp(self):
        super().setUp()
        _, _, lessons = self.studio_course()
        self.lesson = lessons[0]

    def legacy(self):
        self.db.expire_all()
        return self.db.get(Lesson, self.lesson).video_url

    def test_video_activity_is_the_source_of_the_legacy_url(self):
        video = self.activity(self.lesson, "video")
        self.assertEqual(self.legacy(), YOUTUBE)
        studio_service.update_activity(self.db, self.teacher.id, video["id"], {"video_url": YOUTUBE2})
        self.assertEqual(self.legacy(), YOUTUBE2)

    def test_archiving_the_last_video_nulls_the_legacy_url_but_keeps_it_on_the_activity(self):
        video = self.activity(self.lesson, "video")
        studio_service.update_activity(self.db, self.teacher.id, video["id"], {"archived": True})
        self.assertIsNone(self.legacy())
        self.assertEqual(self.db.get(LessonActivity, video["id"]).video_url, YOUTUBE)
        studio_service.update_activity(self.db, self.teacher.id, video["id"], {"archived": False})
        self.assertEqual(self.legacy(), YOUTUBE)

    def test_legacy_url_follows_the_first_active_video(self):
        first = self.activity(self.lesson, "video")
        second = self.activity(self.lesson, "video", video_url=YOUTUBE2)
        studio_service.reorder_activities(self.db, self.teacher.id, self.lesson, [second["id"], first["id"]])
        self.assertEqual(self.legacy(), YOUTUBE2)
        studio_service.update_activity(self.db, self.teacher.id, second["id"], {"archived": True})
        self.assertEqual(self.legacy(), YOUTUBE)

    def test_deleting_an_unwatched_video_clears_the_legacy_url(self):
        video = self.activity(self.lesson, "video")
        out = studio_service.delete_activity(self.db, self.teacher.id, video["id"])
        self.assertEqual(out, {"deleted": True, "archived": False})
        self.assertIsNone(self.legacy())

    def test_other_activities_do_not_touch_a_legacy_video_url(self):
        self.db.get(Lesson, self.lesson).video_url = YOUTUBE
        self.db.commit()
        self.activity(self.lesson, "reading")
        self.assertEqual(self.legacy(), YOUTUBE)  # no video activity changed, so nothing synced


# ---- historical data is protected ------------------------------------------------------------------


class HistoryTests(StudioCase):
    def test_history_foreign_keys_no_longer_cascade(self):
        for model, column in ((LessonProgress, "lesson_id"), (QuizAttempt, "quiz_id"), (PracticeAttempt, "practice_id")):
            (fk,) = list(model.__table__.c[column].foreign_keys)
            self.assertIsNone(fk.ondelete, f"{model.__tablename__}.{column} must not cascade")
        (fk,) = list(ActivityProgress.__table__.c.activity_id.foreign_keys)
        self.assertIsNone(fk.ondelete)

    def seed_attempts(self, lesson_id):
        quiz = Quiz(lesson_id=lesson_id)
        self.db.add(quiz)
        self.db.flush()
        self.db.add(QuizQuestion(quiz_id=quiz.id, question="q", options=["a", "b"], correct_index=0))
        self.db.add(QuizAttempt(student_id=self.student.id, quiz_id=quiz.id, attempt_number=1, score=1, total_questions=1, xp_earned=10))
        self.db.add(LessonProgress(student_id=self.student.id, lesson_id=lesson_id))
        self.db.commit()
        return quiz

    def test_deleting_a_lesson_with_student_records_archives_it(self):
        _, _, lessons = self.studio_course()
        self.seed_attempts(lessons[0])
        out = studio_service.delete_lesson(self.db, self.teacher.id, lessons[0])
        self.assertEqual(out, {"deleted": False, "archived": True})
        self.assertIsNotNone(self.db.get(Lesson, lessons[0]).archived_at)
        self.assertEqual((self.count(QuizAttempt), self.count(LessonProgress), self.count(Quiz)), (1, 1, 1))

    def test_deleting_an_untouched_lesson_removes_it_and_its_content(self):
        _, _, lessons = self.studio_course(lessons=2)
        self.activity(lessons[0], "video")
        content_service.add_questions(
            self.db, self.teacher.id, lessons[0],
            [{"question": "q", "options": ["a", "b"], "correct_index": 0}],
        )
        out = studio_service.delete_lesson(self.db, self.teacher.id, lessons[0])
        self.assertEqual(out, {"deleted": True, "archived": False})
        self.assertEqual((self.count(Quiz), self.count(QuizQuestion), self.count(LessonActivity)), (0, 0, 0))
        self.assertIsNotNone(self.db.get(Lesson, lessons[1]))

    def test_activity_progress_alone_also_protects_a_lesson(self):
        _, _, lessons = self.studio_course()
        video = self.activity(lessons[0], "video")
        studio_service.mark_activity_complete(self.db, self.student.id, "class-a", video["id"])
        self.db.query(LessonProgress).delete()
        self.db.commit()
        self.assertEqual(studio_service.delete_lesson(self.db, self.teacher.id, lessons[0])["archived"], True)
        self.assertEqual(self.count(ActivityProgress), 1)

    def test_deleting_a_module_with_records_archives_it_and_keeps_every_lesson(self):
        _, module_id, lessons = self.studio_course(lessons=2)
        self.seed_attempts(lessons[0])
        out = studio_service.delete_module(self.db, self.teacher.id, module_id)
        self.assertEqual(out, {"deleted": False, "archived": True})
        self.assertEqual(self.db.query(Lesson).count(), 2)
        self.assertIsNotNone(self.db.get(Module, module_id).archived_at)

    def test_deleting_a_course_with_student_records_is_refused(self):
        course_id, _, lessons = self.studio_course()
        self.seed_attempts(lessons[0])
        self.assertEqual(self.http_status(studio_service.delete_course, self.db, self.teacher.id, course_id), 409)
        self.assertIsNotNone(self.db.get(Course, course_id))
        self.assertEqual((self.count(QuizAttempt), self.count(LessonProgress)), (1, 1))

    def test_deleting_an_untouched_course_removes_it_completely(self):
        course_id, _, lessons = self.studio_course()
        self.activity(lessons[0], "reading")
        studio_service.delete_course(self.db, self.teacher.id, course_id)
        self.assertEqual((self.count(Course), self.count(Module), self.count(Lesson), self.count(LessonActivity)), (0, 0, 0, 0))

    def test_quiz_and_practice_activities_are_only_ever_archived(self):
        _, _, lessons = self.studio_course()
        quiz = self.activity(lessons[0], "quiz")
        out = studio_service.delete_activity(self.db, self.teacher.id, quiz["id"])
        self.assertEqual(out, {"deleted": False, "archived": True})
        self.assertEqual((self.count(LessonActivity), self.count(Quiz)), (1, 1))

    def test_a_completed_video_is_archived_not_deleted(self):
        _, _, lessons = self.studio_course()
        video = self.activity(lessons[0], "video")
        studio_service.mark_activity_complete(self.db, self.student.id, "class-a", video["id"])
        out = studio_service.delete_activity(self.db, self.teacher.id, video["id"])
        self.assertEqual(out, {"deleted": False, "archived": True})
        self.assertEqual(self.count(ActivityProgress), 1)

    def test_an_archived_quiz_activity_hides_the_quiz_from_the_legacy_route(self):
        _, _, lessons = self.studio_course()
        quiz = self.activity(lessons[0], "quiz")
        quiz_id = quiz["quiz_id"]
        self.assertFalse(studio_sync.is_archived(self.db, quiz_id=quiz_id))
        studio_service.update_activity(self.db, self.teacher.id, quiz["id"], {"archived": True})
        self.assertTrue(studio_sync.is_archived(self.db, quiz_id=quiz_id))

    def test_the_legacy_editor_still_refuses_to_empty_a_quiz_with_attempts(self):
        _, _, lessons = self.studio_course()
        quiz = self.seed_attempts(lessons[0])
        question = self.db.query(QuizQuestion).filter_by(quiz_id=quiz.id).one()
        self.assertEqual(content_service.delete_question.__name__, "delete_question")
        self.assertEqual(
            self.http_status(content_service.delete_question, self.db, self.teacher.id, question.id), 409
        )
        self.assertEqual(self.count(QuizAttempt), 1)

    def test_studio_code_never_touches_xp_or_streaks(self):
        app_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app")
        for name in ("studio_service.py", "studio_sync.py", "studio_access.py", "studio_rules.py", "routers/studio.py"):
            with open(os.path.join(app_dir, name), encoding="utf-8") as handle:
                source = handle.read()
            self.assertNotIn("XPEvent", source, name)
            self.assertNotIn("Streak", source, name)
            self.assertNotIn("xp_events", source, name)


# ---- aggregate statistics and privacy ------------------------------------------------------------------


class StatsTests(StudioCase):
    def setUp(self):
        super().setUp()
        self.course_id, _, lessons = self.studio_course()
        self.lesson = lessons[0]
        self.video = self.activity(self.lesson, "video")

    def learners(self, n):
        for _ in range(n):
            s = self._profile("student", None)
            studio_service.mark_activity_complete(self.db, s.id, None, self.video["id"])

    def test_counts_below_three_are_hidden(self):
        self.learners(2)
        stats = studio_service.course_stats(self.db, self.teacher.id, self.course_id)
        self.assertEqual((stats["learners"], stats["completed_course"], stats["hidden"]), (None, None, True))

    def test_counts_of_three_or_more_are_shown(self):
        self.learners(3)
        stats = studio_service.course_stats(self.db, self.teacher.id, self.course_id)
        self.assertEqual((stats["learners"], stats["completed_course"], stats["hidden"]), (3, 3, False))

    def test_no_learners_is_zero_not_hidden(self):
        stats = studio_service.course_stats(self.db, self.teacher.id, self.course_id)
        self.assertEqual((stats["learners"], stats["hidden"]), (0, False))

    def test_stats_contain_no_student_identity(self):
        self.learners(3)
        stats = studio_service.course_stats(self.db, self.teacher.id, self.course_id)
        self.assertEqual(set(stats), {"learners", "completed_course", "hidden", "min_aggregate"})

    def test_only_the_owner_sees_course_wide_numbers(self):
        self.assertEqual(self.http_status(studio_service.course_stats, self.db, self.other.id, self.course_id), 404)
        self.db.add(ClassCourse(class_id="class-a", course_id=self.course_id))
        self.db.commit()
        self.assertEqual(self.http_status(studio_service.course_stats, self.db, self.class_teacher.id, self.course_id), 404)


# ---- legacy compatibility -----------------------------------------------------------------------------------


class CompatibilityTests(StudioCase):
    def test_legacy_course_payload_hides_only_archived_lessons(self):
        from app.routers.courses import _course_to_dict

        course_id, module_id, lesson_id = self.legacy_course()
        studio_service.create_lesson(self.db, self.class_teacher.id, module_id, {"title": "New"})
        course = self.db.get(Course, course_id)
        out = _course_to_dict(course, {lesson_id})
        self.assertEqual([x["id"] for x in out["modules"][0]["lessons"]][0], lesson_id)
        self.assertEqual(out["modules"][0]["lessons"][0]["video_url"], YOUTUBE)
        self.assertEqual((out["total_lessons"], out["completed_lessons"]), (2, 1))
        studio_service.update_lesson(self.db, self.class_teacher.id, lesson_id, {"archived": True})
        self.db.expire_all()
        out = _course_to_dict(self.db.get(Course, course_id), set())
        self.assertEqual(out["total_lessons"], 1)

    def test_legacy_access_helper_matches_the_new_rules(self):
        from app.access import lesson_is_in_class

        course_id, _, lesson_id = self.legacy_course()
        self.assertTrue(lesson_is_in_class(self.db, lesson_id, "class-a", self.student.id))
        self.assertFalse(lesson_is_in_class(self.db, lesson_id, "class-b", self.stranger.id))
        self.assertFalse(lesson_is_in_class(self.db, lesson_id, None, self.stranger.id))
        self.assertFalse(lesson_is_in_class(self.db, "missing", "class-a", self.student.id))

    def test_studio_routes_require_the_right_role(self):
        from app.deps import require_student, require_teacher
        from app.routers import studio

        def roles(router):
            found = {}
            for route in router.routes:
                calls = {d.call for d in route.dependant.dependencies}
                found[route.path + " " + ",".join(sorted(route.methods))] = calls
            return found

        for path, calls in roles(studio.teacher_router).items():
            self.assertIn(require_teacher, calls, path)
        for path, calls in roles(studio.student_router).items():
            self.assertIn(require_student, calls, path)

    def test_request_models_refuse_unknown_fields(self):
        from pydantic import ValidationError

        from app.studio_schemas import ActivityCreateIn, CourseCreateIn

        with self.assertRaises(ValidationError):
            CourseCreateIn(title="x", description="y", owner_id=str(uuid.uuid4()))
        with self.assertRaises(ValidationError):
            CourseCreateIn(title="x", description="y", status="published")
        with self.assertRaises(ValidationError):
            ActivityCreateIn(kind="video", sort_order=5)


# ---- giving a course to a class ---------------------------------------------------------------------------


class ClassAssignmentTests(StudioCase):
    def setUp(self):
        super().setUp()
        # self.teacher owns the course; class_teacher teaches class-a; make self.teacher teach class-b
        self.db.add(ClassTeacher(class_id="class-b", teacher_id=self.teacher.id))
        self.course_id, _, self.lessons = self.studio_course(lessons=2)
        self.db.commit()

    def rows(self, teacher=None):
        return {r["class_id"]: r for r in studio_service.course_classes(self.db, (teacher or self.teacher).id, self.course_id)}

    def test_only_the_classes_the_teacher_teaches_are_listed(self):
        self.assertEqual(set(self.rows()), {"class-b"})
        self.assertFalse(self.rows()["class-b"]["assigned"])

    def test_assign_and_unassign_are_idempotent(self):
        for _ in range(2):
            self.assertTrue(studio_service.set_class_assignment(self.db, self.teacher.id, self.course_id, "class-b", True)["assigned"])
        self.assertEqual(self.db.query(ClassCourse).filter_by(course_id=self.course_id).count(), 1)
        for _ in range(2):
            self.assertFalse(studio_service.set_class_assignment(self.db, self.teacher.id, self.course_id, "class-b", False)["assigned"])
        self.assertEqual(self.db.query(ClassCourse).filter_by(course_id=self.course_id).count(), 0)

    def test_a_teacher_cannot_give_a_course_to_a_class_they_do_not_teach(self):
        self.assertEqual(
            self.http_status(studio_service.set_class_assignment, self.db, self.teacher.id, self.course_id, "class-a", True), 404
        )
        self.assertEqual(self.db.query(ClassCourse).count(), 0)

    def test_only_the_owner_can_assign(self):
        self.db.add(ClassTeacher(class_id="class-b", teacher_id=self.other.id))
        self.db.commit()
        self.assertEqual(self.http_status(studio_service.course_classes, self.db, self.other.id, self.course_id), 404)
        self.assertEqual(
            self.http_status(studio_service.set_class_assignment, self.db, self.other.id, self.course_id, "class-b", True), 404
        )

    def test_legacy_courses_cannot_be_reassigned_here(self):
        legacy, _, _ = self.legacy_course()
        self.assertEqual(self.http_status(studio_service.course_classes, self.db, self.class_teacher.id, legacy), 404)

    def test_class_numbers_cover_only_that_class_and_are_not_hidden(self):
        mate = self._profile("student", "class-b")
        other_class = self._profile("student", "class-a")
        self.db.commit()
        video = self.activity(self.lessons[0])
        studio_service.mark_activity_complete(self.db, mate.id, "class-b", video["id"])
        studio_service.mark_activity_complete(self.db, other_class.id, "class-a", video["id"])
        row = self.rows()["class-b"]
        self.assertEqual((row["students"], row["learners"], row["completed_course"]), (1, 1, 0))
        # completing every lesson counts as finishing the course for that class only
        second = self.activity(self.lessons[1])
        studio_service.mark_activity_complete(self.db, mate.id, "class-b", second["id"])
        self.assertEqual(self.rows()["class-b"]["completed_course"], 1)
        global_stats = studio_service.course_stats(self.db, self.teacher.id, self.course_id)
        self.assertTrue(global_stats["hidden"])  # 2 learners overall: global numbers stay suppressed

    def test_a_class_student_sees_a_draft_given_to_the_class_only_after_publishing(self):
        draft_id, _, lessons = self.studio_course(publish=False)
        studio_service.set_class_assignment(self.db, self.teacher.id, draft_id, "class-b", True)
        mate = self._profile("student", "class-b"); self.db.commit()
        self.assertNotIn(draft_id, studio_access.visible_course_ids_for_student(self.db, mate.id, "class-b"))
        studio_service.set_course_status(self.db, self.teacher.id, draft_id, "publish")
        self.assertIn(draft_id, studio_access.visible_course_ids_for_student(self.db, mate.id, "class-b"))


# ---- the pending SQL, read as text -------------------------------------------------------------------------------


class SqlFileTests(unittest.TestCase):
    def test_new_activities_default_to_not_required(self):
        sql = read_sql("20261102000000_course_studio.sql")
        self.assertRegex(sql, r"is_required\s+boolean not null default false")
        self.assertNotRegex(sql, r"is_required\s+boolean not null default true")

    def test_backfill_never_marks_anything_required(self):
        sql = read_sql("course_studio_backfill.sql")
        for match in re.finditer(r"'(video|quiz|practice)',[^;]*?(true|false)", sql):
            self.assertEqual(match.group(2), "false", match.group(0)[:60])
        self.assertNotRegex(sql, r"is_required\s*=\s*true")
        self.assertIn("required_activities (expect 0)", sql)

    def test_backfill_checks_every_column_it_reads_including_attempt_timestamps(self):
        sql = read_sql("course_studio_backfill.sql")
        for needle in ("('quiz_attempts','created_at','timestamp with time zone')",
                       "('practice_attempts','created_at','timestamp with time zone')",
                       "('lessons','video_url','text')", "('practices','title','text')"):
            self.assertIn(needle, sql)
        self.assertIn("min(a.created_at)", sql)

    def test_history_foreign_keys_become_no_action(self):
        sql = read_sql("20261102000000_course_studio.sql")
        for name in ("lesson_progress_lesson_id_fkey", "quiz_attempts_quiz_id_fkey", "practice_attempts_practice_id_fkey"):
            self.assertRegex(sql, rf"add\s+constraint {name}\s+foreign key[^;]*on delete no action")

    def test_one_quiz_one_practice_constraints_are_checked_and_kept(self):
        sql = read_sql("20261102000000_course_studio.sql")
        self.assertIn("quizzes_lesson_id_key", sql)
        self.assertIn("practices_lesson_id_key", sql)
        self.assertNotIn("drop constraint quizzes_lesson_id_key", sql)
        self.assertNotIn("drop constraint practices_lesson_id_key", sql)

    def test_new_tables_are_private_to_the_service_role(self):
        sql = read_sql("20261102000000_course_studio.sql")
        self.assertIn("revoke all on table public.lesson_activities, public.activity_progress from public, anon, authenticated", sql)
        self.assertIn("grant all on table public.lesson_activities, public.activity_progress to service_role", sql)
        self.assertNotIn("grant all on table public.lesson_activities, public.activity_progress to anon", sql)

    def test_video_backfill_keeps_every_url_and_never_overwrites_a_teacher_edit(self):
        sql = read_sql("course_studio_backfill.sql")
        self.assertIn("a.video_url = l.video_url", sql)  # only adds a URL no activity holds
        self.assertIn("then now() end", sql)  # a conflicting URL is kept as an ARCHIVED activity
        self.assertNotRegex(sql, r"update\s+public\.lesson_activities")
        self.assertNotRegex(sql, r"update\s+public\.lessons")

    def test_rollback_refuses_to_run_once_studio_data_exists_and_guards_before_dropping(self):
        sql = read_sql("course_studio_rollback_pre_use_only.sql")
        guard = sql.index("REFUSED")
        self.assertLess(guard, sql.index("drop table"))
        self.assertLess(guard, sql.index("drop column"))
        self.assertIn("legacy_ref is null", sql)
        self.assertIn("owner_id is not null", sql)
        self.assertIn("archived video activities hold URLs", sql)

    def test_pending_sql_is_outside_the_migrations_folder(self):
        migrations = os.path.join(REPO, "supabase", "migrations")
        self.assertFalse([n for n in os.listdir(migrations) if "studio" in n])


if __name__ == "__main__":
    unittest.main(verbosity=1)
