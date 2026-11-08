"""Tests for the performance work: query budgets, the shared snapshots, HTTP revalidation,
the one-query login check, and proof that the rewritten access rules match the old ones.

Run from the repo root with the backend virtualenv:
    .venv/bin/python -I backend/tests/test_performance.py
SQLite in memory stands in for Postgres, as in the other suites. A few Postgres-only
phrases in raw SQL (now(), interval) are rewritten for SQLite so those queries run too.
"""
import os
import random
import re
import sqlite3
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from gzip import decompress

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://x:x@localhost/x")
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")

from fastapi import HTTPException  # noqa: E402
from fastapi.security import HTTPAuthorizationCredentials  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, event, select, text  # noqa: E402
from sqlalchemy.dialects.postgresql import JSONB  # noqa: E402
from sqlalchemy.ext.compiler import compiles  # noqa: E402
from sqlalchemy.orm import Session, sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

sqlite3.register_adapter(uuid.UUID, lambda u: u.hex)


@compiles(JSONB, "sqlite")
def _jsonb_as_json(type_, compiler, **kw):
    return "JSON"


import jwt  # noqa: E402

from app import deps, snapshots, studio_access, studio_service  # noqa: E402
from app.database import Base, get_db  # noqa: E402
from app.deps import get_current_user  # noqa: E402
from app.http_cache import etag_for  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    ActivityProgress,
    Class,
    ClassCourse,
    Course,
    CourseAccess,
    Lesson,
    LessonActivity,
    LessonProgress,
    Module,
    Practice,
    PracticeItem,
    Profile,
    Quiz,
    QuizQuestion,
    XPEvent,
)
from app.payment_rules import ACTIVE, access_state  # noqa: E402

PG_TO_SQLITE = [
    (re.compile(r"now\(\)\s*-\s*interval\s*'(\d+) (days|seconds)'", re.I), r"datetime('now','-\1 \2')"),
    (re.compile(r"\bpublic\."), ""),
]


def sqlite_engine():
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})

    @event.listens_for(engine, "connect")
    def _functions(dbapi_conn, record):
        dbapi_conn.create_function("now", 0, lambda: datetime.now(timezone.utc).replace(tzinfo=None).isoformat(" "))

    @event.listens_for(engine, "before_cursor_execute", retval=True)
    def _translate(conn, cursor, statement, params, context, executemany):
        for pattern, repl in PG_TO_SQLITE:
            statement = pattern.sub(repl, statement)
        return statement, params

    with engine.begin() as conn:
        conn.exec_driver_sql("ATTACH ':memory:' AS auth")
        conn.exec_driver_sql(
            "create table auth.users (id char(32) primary key, email text, banned_until text)"
        )
        conn.exec_driver_sql(
            "create table student_presence (student_id char(32) primary key, "
            "last_seen_at timestamp, current_lesson_id text)"
        )
    Base.metadata.create_all(engine)
    # As supabase/pending/20261107010000_submission_ids.sql adds them (not in the ORM).
    with engine.begin() as conn:
        for table in ("quiz_attempts", "practice_attempts"):
            conn.exec_driver_sql(f"alter table {table} add column client_submission_id char(32)")
            conn.exec_driver_sql(
                f"create unique index {table}_submission_uq on {table} (student_id, client_submission_id) "
                "where client_submission_id is not null"
            )
    return engine


class Counter:
    """Counts the SQL statements an engine runs."""

    def __init__(self, engine):
        self.n = 0
        self.statements = []
        event.listen(engine, "before_cursor_execute", self._seen)

    def _seen(self, conn, cursor, statement, params, context, executemany):
        self.n += 1
        self.statements.append(" ".join(statement.split())[:120])

    def reset(self):
        self.n = 0
        self.statements = []


class Base_(unittest.TestCase):
    def setUp(self):
        self.engine = sqlite_engine()
        self.addCleanup(self.engine.dispose)
        self.db = sessionmaker(bind=self.engine, autoflush=False)()
        self.addCleanup(self.db.close)
        self.db.add_all([Class(id="class-a", name="A"), Class(id="class-b", name="B")])
        self.db.flush()
        self.teacher = self.person("teacher", name="Owner T")
        self.student = self.person("student", "class-a", name="Abebe Kebede")
        self.classmate = self.person("student", "class-a", name="Hana Tesfaye")
        self.db.commit()

    def person(self, role, class_id=None, name=None, banned_until=None, active=True):
        p = Profile(id=uuid.uuid4(), name=name or role, role=role, class_id=class_id, is_active=active)
        self.db.add(p)
        self.db.flush()
        self.db.execute(
            text("insert into auth.users (id, email, banned_until) values (:id, :e, :b)"),
            {"id": p.id, "e": f"{p.id.hex[:6]}@example.com", "b": banned_until},
        )
        return p

    def studio_course(self, title="Biology", lessons=2, publish=True, owner=None):
        owner = owner or self.teacher
        course = studio_service.create_course(self.db, owner.id, title, "About it")
        module = studio_service.create_module(self.db, owner.id, course["id"], "Part one")
        lesson_ids = [
            studio_service.create_lesson(self.db, owner.id, module["id"], {"title": f"L{i}"})["id"]
            for i in range(lessons)
        ]
        if publish:
            studio_service.set_course_status(self.db, owner.id, course["id"], "publish")
        return course["id"], module["id"], lesson_ids

    def client_for(self, person):
        user = {
            "id": str(person.id), "name": person.name, "email": "x@example.com", "role": person.role,
            "is_active": True, "created_at": datetime.now(timezone.utc), "class_id": person.class_id,
            "is_admin": False,
        }
        app.dependency_overrides[get_db] = lambda: self.db
        app.dependency_overrides[get_current_user] = lambda: user
        self.addCleanup(app.dependency_overrides.clear)
        return TestClient(app)


# ---- query budgets -----------------------------------------------------------------------------


class QueryBudgetTests(Base_):
    """Each statement is a round trip to the database. These fail if a change brings back
    per-course or per-lesson queries."""

    def setUp(self):
        super().setUp()
        self.course_id, _, self.lessons = self.studio_course(lessons=3)
        lesson = self.lessons[0]
        quiz = Quiz(lesson_id=lesson)
        practice = Practice(lesson_id=lesson, title="Practice")
        self.db.add_all([quiz, practice])
        self.db.flush()
        self.db.add(QuizQuestion(quiz_id=quiz.id, question="Q?", options=["a", "b"], correct_index=0, sort_order=0))
        self.db.add(PracticeItem(practice_id=practice.id, type="choose", question="P", options=["x", "y"], correct_index=1, sort_order=0))
        self.db.add_all([
            LessonActivity(lesson_id=lesson, kind="quiz", title="Quiz", quiz_id=quiz.id, sort_order=5),
            LessonActivity(lesson_id=lesson, kind="practice", title="Practice", practice_id=practice.id, sort_order=6),
        ])
        self.db.commit()
        self.client = self.client_for(self.student)
        self.counter = Counter(self.engine)

    def budget(self, method, path, limit, **kwargs):
        getattr(self.client, method)(path, **kwargs)  # first call fills the shared catalogue
        self.counter.reset()
        response = getattr(self.client, method)(path, **kwargs)
        self.assertLess(response.status_code, 300, response.text)
        self.assertLessEqual(self.counter.n, limit, "\n".join(self.counter.statements))
        return response

    def test_course_list(self):
        self.budget("get", "/courses", 3)

    def test_lesson_routes(self):
        lesson = self.lessons[0]
        self.budget("get", f"/lessons/{lesson}/quiz", 5)
        self.budget("get", f"/lessons/{lesson}/practice", 5)
        self.budget("get", f"/lessons/{lesson}/activities", 5)

    def test_heartbeat(self):
        self.budget("post", "/me/heartbeat", 2, json={"lesson_id": self.lessons[0]})

    def test_course_list_does_not_grow_with_the_catalogue(self):
        self.budget("get", "/courses", 3)
        for i in range(8):
            self.studio_course(title=f"Extra {i}", lessons=4)
        self.budget("get", "/courses", 3)


# ---- the one-query login check -------------------------------------------------------------------


class AuthTests(Base_):
    def setUp(self):
        super().setUp()
        self.originals = (deps.jwks_client.get_signing_key_from_jwt, deps.jwt.decode)
        self.addCleanup(self._restore)
        deps.jwks_client.get_signing_key_from_jwt = lambda token: type("K", (), {"key": None})()

    def _restore(self):
        deps.jwks_client.get_signing_key_from_jwt, deps.jwt.decode = self.originals

    def login_as(self, person_id):
        deps.jwt.decode = lambda *a, **k: {"sub": str(person_id), "email": "x@example.com"}
        fresh = sessionmaker(bind=self.engine, autoflush=False)()  # a new request's session
        self.addCleanup(fresh.close)
        return deps.get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials="t"), fresh)

    def test_one_query_and_the_same_user(self):
        student_id = self.student.id  # read before counting: it reloads after a commit
        counter = Counter(self.engine)
        user = self.login_as(student_id)
        self.assertEqual(counter.n, 1)
        self.assertEqual(user["id"], str(self.student.id))
        self.assertEqual(user["name"], "Abebe Kebede")
        self.assertEqual(user["role"], "student")
        self.assertEqual(user["class_id"], "class-a")
        self.assertIs(user["is_admin"], False)

    def test_banned_account_is_refused(self):
        later = (datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=3)).isoformat(" ")
        banned = self.person("student", "class-a", banned_until=later)
        self.db.commit()
        with self.assertRaises(HTTPException) as ctx:
            self.login_as(banned.id)
        self.assertEqual(ctx.exception.status_code, 403)
        self.assertEqual(ctx.exception.detail, deps.ACCOUNT_OFF_MESSAGE)

    def test_expired_ban_is_not_a_ban(self):
        earlier = (datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=3)).isoformat(" ")
        p = self.person("student", "class-a", banned_until=earlier)
        self.db.commit()
        self.assertEqual(self.login_as(p.id)["id"], str(p.id))

    def test_turned_off_profile_is_refused(self):
        p = self.person("student", "class-a", active=False)
        self.db.commit()
        with self.assertRaises(HTTPException) as ctx:
            self.login_as(p.id)
        self.assertEqual(ctx.exception.status_code, 403)

    def test_unknown_user_is_401(self):
        with self.assertRaises(HTTPException) as ctx:
            self.login_as(uuid.uuid4())
        self.assertEqual(ctx.exception.status_code, 401)

    def test_profile_without_an_auth_row_is_not_banned(self):
        p = Profile(id=uuid.uuid4(), name="No auth row", role="student")
        self.db.add(p)
        self.db.commit()
        self.assertEqual(self.login_as(p.id)["id"], str(p.id))

    def test_key_server_outage_is_503_not_a_logout(self):
        def unreachable(token):
            raise jwt.PyJWKClientConnectionError("down")

        deps.jwks_client.get_signing_key_from_jwt = unreachable
        with self.assertRaises(HTTPException) as ctx:
            self.login_as(self.student.id)
        self.assertEqual(ctx.exception.status_code, 503)

    def test_bad_token_is_still_401(self):
        def bad(*a, **k):
            raise jwt.InvalidSignatureError("forged")

        deps.jwt.decode = bad
        with self.assertRaises(HTTPException) as ctx:
            deps.get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials="t"), self.db)
        self.assertEqual(ctx.exception.status_code, 401)


# ---- the shared catalogue stays correct ----------------------------------------------------------


class CatalogFreshnessTests(Base_):
    def setUp(self):
        super().setUp()
        self.course_id, self.module_id, self.lessons = self.studio_course()
        self.client = self.client_for(self.student)

    def titles(self):
        return {c["id"]: c for c in self.client.get("/courses").json()}

    def test_teacher_edits_show_at_once(self):
        self.assertIn(self.course_id, self.titles())  # fills the catalogue
        studio_service.update_course(self.db, self.teacher.id, self.course_id, {"title": "Biology II"})
        self.assertEqual(self.titles()[self.course_id]["title"], "Biology II")

        studio_service.update_lesson(self.db, self.teacher.id, self.lessons[0], {"title": "Renamed"})
        lessons = self.titles()[self.course_id]["modules"][0]["lessons"]
        self.assertEqual(lessons[0]["title"], "Renamed")

    def test_unpublish_and_new_course_show_at_once(self):
        self.titles()
        new_id, _, _ = self.studio_course(title="Chemistry")
        self.assertIn(new_id, self.titles())
        studio_service.set_course_status(self.db, self.teacher.id, new_id, "unpublish")
        self.assertNotIn(new_id, self.titles())

    def test_archived_lesson_closes_at_once(self):
        lesson = self.lessons[0]
        self.assertEqual(self.client.get(f"/lessons/{lesson}/activities").status_code, 200)
        studio_service.delete_lesson(self.db, self.teacher.id, lesson)
        self.assertEqual(self.client.get(f"/lessons/{lesson}/activities").status_code, 404)

    def test_new_price_locks_at_once(self):
        lesson = self.lessons[0]
        self.assertEqual(self.client.get(f"/lessons/{lesson}/activities").status_code, 200)
        studio_service.update_course(self.db, self.teacher.id, self.course_id, {"price": Decimal("300"), "access_days": 30, "payment_instructions": "Pay 0911"})
        self.assertEqual(self.client.get(f"/lessons/{lesson}/activities").status_code, 404)

    def test_uncommitted_writes_are_seen_by_their_own_session_only(self):
        self.titles()
        course = self.db.get(Course, self.course_id)
        course.title = "Draft title"
        self.db.flush()  # written, not committed
        own = snapshots.catalog.get(self.db)
        self.assertEqual(own.by_id[self.course_id].title, "Draft title")
        self.db.rollback()
        other = sessionmaker(bind=self.engine, autoflush=False)()
        self.addCleanup(other.close)
        self.assertEqual(snapshots.catalog.get(other).by_id[self.course_id].title, "Biology")

    def test_sql_outside_the_app_shows_within_the_age_limit(self):
        self.titles()
        self.db.execute(text("update courses set title = 'Edited in SQL' where id = :id"), {"id": self.course_id})
        self.db.commit()
        self.assertEqual(self.titles()[self.course_id]["title"], "Biology")  # not seen by the ORM

        real = snapshots.time.monotonic
        snapshots.time.monotonic = lambda: real() + snapshots.MAX_AGE_SECONDS + 1
        self.addCleanup(lambda: setattr(snapshots.time, "monotonic", real))
        self.assertEqual(self.titles()[self.course_id]["title"], "Edited in SQL")

    def test_separate_databases_never_share_a_catalogue(self):
        self.titles()
        other_engine = sqlite_engine()
        self.addCleanup(other_engine.dispose)
        other = sessionmaker(bind=other_engine)()
        self.addCleanup(other.close)
        self.assertEqual(snapshots.catalog.get(other).courses, ())


# ---- the shared national board ------------------------------------------------------------------


class NationalBoardTests(Base_):
    def setUp(self):
        super().setUp()
        self.client = self.client_for(self.student)

    def xp(self, person, amount, days_ago=0):
        self.db.add(XPEvent(student_id=person.id, amount=Decimal(amount), source="quiz", source_id=1,
                            created_at=datetime.now(timezone.utc) - timedelta(days=days_ago)))
        self.db.commit()

    def board(self, period="overall"):
        return self.client.get(f"/ranking?scope=national&period={period}").json()

    def test_new_xp_moves_the_board_at_once(self):
        self.xp(self.classmate, 50)
        self.assertEqual(self.board()[0]["xp"], "50")  # fills the shared board
        self.xp(self.classmate, 30)
        self.assertEqual(self.board()[0]["xp"], "80")

    def test_own_row_is_always_fresh(self):
        self.xp(self.classmate, 50)
        self.board()
        # Written past the ORM, so the shared board does not know; the student's own row
        # is read fresh anyway.
        self.db.execute(
            text("insert into xp_events (student_id, amount, source, source_id, created_at) values (:s, 70, 'quiz', 1, :t)"),
            {"s": self.student.id, "t": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(" ")},
        )
        self.db.commit()
        top = self.board()[0]
        self.assertEqual(top["id"], str(self.student.id))
        self.assertEqual(top["xp"], "70")
        self.assertEqual(top["position"], 1)

    def test_turned_off_student_leaves_the_board(self):
        self.xp(self.classmate, 50)
        self.assertEqual(len(self.board()), 2)
        self.classmate.is_active = False
        self.db.commit()
        self.assertEqual(len(self.board()), 1)

    def test_periods(self):
        self.xp(self.classmate, 40, days_ago=10)
        self.xp(self.student, 5)
        weekly = self.board("weekly")
        self.assertEqual(weekly[0]["id"], str(self.student.id))
        overall = self.board("overall")
        self.assertEqual(overall[0]["name"], "Hana T.")
        self.assertEqual(overall[0]["id"], "")  # nobody else's id is shared


# ---- HTTP revalidation and compression ----------------------------------------------------------


class HttpCacheTests(Base_):
    def setUp(self):
        super().setUp()
        self.course_id, _, _ = self.studio_course(lessons=12)
        self.client = self.client_for(self.student)

    def test_etag_then_304_then_change(self):
        first = self.client.get("/courses")
        tag = first.headers["etag"]
        self.assertEqual(tag, etag_for(first.content))
        self.assertEqual(first.headers["cache-control"], "private, no-cache")

        again = self.client.get("/courses", headers={"If-None-Match": tag})
        self.assertEqual(again.status_code, 304)
        self.assertEqual(again.content, b"")
        self.assertEqual(again.headers["etag"], tag)

        studio_service.update_course(self.db, self.teacher.id, self.course_id, {"title": "New name"})
        changed = self.client.get("/courses", headers={"If-None-Match": tag})
        self.assertEqual(changed.status_code, 200)
        self.assertNotEqual(changed.headers["etag"], tag)

    def test_only_successful_json_gets_are_tagged(self):
        self.assertNotIn("etag", self.client.get("/lessons/nope/activities").headers)  # 404
        self.assertNotIn("etag", self.client.post("/me/heartbeat", json={}).headers)

    def test_a_tag_from_another_answer_does_not_match(self):
        tag = self.client.get("/courses").headers["etag"]
        other = self.client.get("/me/stats", headers={"If-None-Match": tag})
        self.assertEqual(other.status_code, 200)

    def test_large_json_is_gzipped(self):
        response = self.client.get("/courses", headers={"Accept-Encoding": "gzip"})
        self.assertEqual(response.headers.get("content-encoding"), "gzip")
        raw = self.client.get("/courses", headers={"Accept-Encoding": "identity"}).content
        self.assertEqual(response.content, raw)  # the client unpacks it to the same bytes
        compressed = len(self.client.get("/courses", headers={"Accept-Encoding": "gzip"}, ).content)
        self.assertGreater(compressed, 0)

    def test_stats_carry_the_name(self):
        self.assertEqual(self.client.get("/me/stats").json()["name"], "Abebe Kebede")


# ---- the rewritten access rules match the old ones ------------------------------------------------
# A verbatim copy of the rules as they were before the rewrite (one query per fact), run
# side by side with the new ones over many random worlds.


def ref_progressed(db, student_id):
    by_lesson = select(Module.course_id).join(Lesson, Lesson.module_id == Module.id).join(
        LessonProgress, LessonProgress.lesson_id == Lesson.id
    ).where(LessonProgress.student_id == student_id)
    by_activity = (
        select(Module.course_id)
        .join(Lesson, Lesson.module_id == Module.id)
        .join(LessonActivity, LessonActivity.lesson_id == Lesson.id)
        .join(ActivityProgress, ActivityProgress.activity_id == LessonActivity.id)
        .where(ActivityProgress.student_id == student_id)
    )
    return {r[0] for r in db.execute(by_lesson.union(by_activity)).all()}


def ref_access(db, student_id, class_id, course_ids=None):
    now = datetime.now(timezone.utc)
    rows = select(CourseAccess).where(CourseAccess.student_id == student_id)
    if course_ids is not None:
        rows = rows.where(CourseAccess.course_id.in_(course_ids))
    held = {a.course_id: a for a in db.execute(rows).scalars()}
    wanted = set(held) if course_ids is None else set(course_ids)
    if not wanted:
        return {}
    prices = dict(db.execute(select(Course.id, Course.price).where(Course.id.in_(wanted))).all())
    in_class = set() if class_id is None else {
        r[0] for r in db.execute(select(ClassCourse.course_id).where(ClassCourse.class_id == class_id)).all()
    }
    out = {}
    for course_id, price in prices.items():
        row = held.get(course_id)
        out[course_id] = {
            "state": access_state(price, course_id in in_class, row.expires_at if row else None,
                                  row.revoked_at if row else None, row is not None, now),
            "expires_at": row.expires_at if row else None,
        }
    return out


def ref_visible(db, student_id, class_id):
    visible = set()
    if class_id is not None:
        visible |= {r[0] for r in db.execute(
            select(Course.id).join(ClassCourse, ClassCourse.course_id == Course.id)
            .where(ClassCourse.class_id == class_id, Course.status != "draft")).all()}
    visible |= {r[0] for r in db.execute(
        select(Course.id).where(Course.owner_id.is_not(None), Course.status == "published")).all()}
    unpublished = {r[0] for r in db.execute(
        select(Course.id).where(Course.owner_id.is_not(None), Course.status == "unpublished")).all()}
    if unpublished:
        visible |= unpublished & ref_progressed(db, student_id)
    held = ref_access(db, student_id, class_id)
    visible |= {c for c, e in held.items() if e["state"] == ACTIVE}
    return visible


def ref_can_see_lesson(db, student_id, class_id, lesson_id):
    row = db.execute(
        select(Module.course_id).join(Lesson, Lesson.module_id == Module.id)
        .where(Lesson.id == lesson_id, Lesson.archived_at.is_(None), Module.archived_at.is_(None))
    ).first()
    if row is None:
        return False
    entry = ref_access(db, student_id, class_id, [row[0]]).get(row[0])
    return row[0] in ref_visible(db, student_id, class_id) and entry is not None and entry["state"] in ("free", "class", "active")


class AccessEquivalenceTests(unittest.TestCase):
    def world(self, seed):
        rnd = random.Random(seed)
        engine = sqlite_engine()
        self.addCleanup(engine.dispose)
        db: Session = sessionmaker(bind=engine, autoflush=False)()
        self.addCleanup(db.close)
        db.add_all([Class(id="c1", name="1"), Class(id="c2", name="2")])
        teacher = Profile(id=uuid.uuid4(), name="T", role="teacher")
        db.add(teacher)
        students = [Profile(id=uuid.uuid4(), name=f"S{i}", role="student", class_id=rnd.choice([None, "c1", "c2"]))
                    for i in range(6)]
        db.add_all(students)
        db.flush()
        now = datetime.now(timezone.utc)
        lessons = []
        for ci in range(8):
            cid = f"course{ci}"
            price = Decimal(rnd.choice([0, 0, 100]))
            # The database rule: only a paid course has a price (accounts_and_pro migration).
            db.add(Course(id=cid, title=cid, description="d", sort_order=rnd.randint(0, 3),
                          owner_id=rnd.choice([None, teacher.id]),
                          status=rnd.choice(["draft", "published", "unpublished"]),
                          price=price, access_tier="paid" if price else "free"))
            for klass in ("c1", "c2"):
                if rnd.random() < 0.35:
                    db.add(ClassCourse(class_id=klass, course_id=cid))
            for mi in range(2):
                mid = f"{cid}m{mi}"
                db.add(Module(id=mid, course_id=cid, title=mid, sort_order=mi,
                              archived_at=now if rnd.random() < 0.15 else None))
                for li in range(2):
                    lid = f"{mid}l{li}"
                    db.add(Lesson(id=lid, module_id=mid, title=lid, sort_order=li,
                                  archived_at=now if rnd.random() < 0.15 else None))
                    lessons.append(lid)
        db.flush()
        for s in students:
            for ci in range(8):
                if rnd.random() < 0.3:
                    db.add(CourseAccess(
                        student_id=s.id, course_id=f"course{ci}", source="payment",
                        expires_at=rnd.choice([None, now + timedelta(days=5), now - timedelta(days=5)]),
                        revoked_at=now if rnd.random() < 0.2 else None))
            for lid in rnd.sample(lessons, 3):
                db.add(LessonProgress(student_id=s.id, lesson_id=lid))
        db.commit()
        return db, students, lessons

    def test_new_rules_match_the_old_ones(self):
        checked = 0
        for seed in range(25):
            db, students, lessons = self.world(seed)
            for s in students:
                ids = [f"course{i}" for i in range(8)] + ["missing"]
                self.assertEqual(studio_access.visible_course_ids_for_student(db, s.id, s.class_id),
                                 ref_visible(db, s.id, s.class_id), f"seed {seed}")
                self.assertEqual(self.states(studio_access.access_for_student(db, s.id, s.class_id)),
                                 self.states(ref_access(db, s.id, s.class_id)), f"seed {seed}")
                self.assertEqual(self.states(studio_access.access_for_student(db, s.id, s.class_id, ids)),
                                 self.states(ref_access(db, s.id, s.class_id, ids)), f"seed {seed}")
                for lid in lessons + ["no-such-lesson"]:
                    self.assertEqual(studio_access.student_can_see_lesson(db, s.id, s.class_id, lid),
                                     ref_can_see_lesson(db, s.id, s.class_id, lid), f"seed {seed} {lid}")
                    checked += 1
        self.assertGreater(checked, 4000)

    @staticmethod
    def states(access):
        return {course_id: entry["state"] for course_id, entry in access.items()}


# ---- one chapter submission is recorded once ------------------------------------------------------


from app import clock  # noqa: E402
from app.models import PracticeAttempt, QuizAttempt, Streak  # noqa: E402
from app.routers import practice as practice_router  # noqa: E402
from app.routers import quiz as quiz_router  # noqa: E402


class SubmissionTests(Base_):
    def setUp(self):
        super().setUp()
        _, _, lessons = self.studio_course(lessons=1)
        self.lesson = lessons[0]
        quiz = Quiz(lesson_id=self.lesson)
        practice = Practice(lesson_id=self.lesson, title="Practice")
        self.db.add_all([quiz, practice])
        self.db.flush()
        self.questions = [
            QuizQuestion(quiz_id=quiz.id, question=f"Q{i}", options=["a", "b"], correct_index=0, sort_order=i)
            for i in range(3)
        ]
        self.items = [
            PracticeItem(practice_id=practice.id, type="choose", question=f"P{i}", options=["x", "y"], correct_index=1, sort_order=i)
            for i in range(2)
        ]
        self.db.add_all(self.questions + self.items)
        self.db.commit()
        self.client = self.client_for(self.student)

    def quiz(self, submission_id=None, client=None):
        body = {"answers": [{"question_id": q.id, "selected_index": 0} for q in self.questions]}
        if submission_id:
            body["submission_id"] = str(submission_id)
        return (client or self.client).post(f"/lessons/{self.lesson}/quiz/submit", json=body)

    def practice(self, submission_id=None):
        body = {"answers": [{"item_id": i.id, "selected_index": 1} for i in self.items]}
        if submission_id:
            body["submission_id"] = str(submission_id)
        return self.client.post(f"/lessons/{self.lesson}/practice/submit", json=body)

    def count(self, model, **where):
        query = self.db.query(model)
        for key, value in where.items():
            query = query.filter(getattr(model, key) == value)
        return query.count()

    def test_a_retried_submission_is_recorded_once(self):
        sid = uuid.uuid4()
        first = self.quiz(sid)
        again = self.quiz(sid)
        self.assertEqual(first.status_code, 200)
        self.assertEqual(again.status_code, 200)
        self.assertEqual(first.json()["attempt_number"], 1)
        self.assertEqual(again.json()["attempt_number"], 1)
        self.assertEqual(again.json(), first.json())  # byte-for-byte the same answer
        self.assertEqual(self.count(QuizAttempt), 1)
        self.assertEqual(self.count(XPEvent, source="quiz"), 1)

    def test_a_new_submission_is_a_new_attempt(self):
        self.quiz(uuid.uuid4())
        second = self.quiz(uuid.uuid4()).json()
        self.assertEqual(second["attempt_number"], 2)
        self.assertEqual(float(second["xp_earned"]), 15.0)  # 3 correct at 5 XP
        self.assertEqual(self.count(QuizAttempt), 2)

    def test_retrying_a_half_saved_chapter_sends_nothing_twice(self):
        sid = uuid.uuid4()
        first_quiz = self.quiz(sid).json()  # saved; then the practice failed on the phone
        self.assertEqual(self.quiz(sid).json(), first_quiz)
        first_practice = self.practice(sid).json()
        self.assertEqual(self.practice(sid).json(), first_practice)
        self.assertEqual(self.count(QuizAttempt), 1)
        self.assertEqual(self.count(PracticeAttempt), 1)
        self.assertEqual(self.count(XPEvent), 2)

    def test_a_double_tap_race_returns_the_first_result(self):
        sid = uuid.uuid4()
        winner = self.quiz(sid).json()
        real = quiz_router._earlier_attempt
        calls = {"n": 0}

        def misses_once(*args):  # the second tap checked before the first one committed
            calls["n"] += 1
            return None if calls["n"] == 1 else real(*args)

        quiz_router._earlier_attempt = misses_once
        self.addCleanup(lambda: setattr(quiz_router, "_earlier_attempt", real))
        late = self.quiz(sid)
        self.assertEqual(late.status_code, 200)
        self.assertEqual(late.json()["attempt_number"], winner["attempt_number"])
        self.assertEqual(self.count(QuizAttempt), 1)
        self.assertEqual(self.count(XPEvent, source="quiz"), 1)

    def test_an_older_app_double_tap_is_not_an_error(self):
        self.quiz()  # no submission id, as older apps send
        real = quiz_router._next_attempt_number
        quiz_router._next_attempt_number = lambda *a: 1  # both taps counted the same attempts
        self.addCleanup(lambda: setattr(quiz_router, "_next_attempt_number", real))
        late = self.quiz()
        self.assertEqual(late.status_code, 200)
        self.assertEqual(late.json()["attempt_number"], 1)
        self.assertEqual(self.count(QuizAttempt), 1)

    def test_practice_first_completion_race_awards_once(self):
        self.practice()
        real = practice_router._has_completed_before
        practice_router._has_completed_before = lambda *a: False
        self.addCleanup(lambda: setattr(practice_router, "_has_completed_before", real))
        late = self.practice()
        self.assertEqual(late.status_code, 200)
        self.assertTrue(late.json()["is_first_completion"])
        self.assertEqual(self.count(PracticeAttempt), 1)
        self.assertEqual(self.count(XPEvent, source="practice"), 1)

    def test_submission_ids_belong_to_one_student(self):
        sid = uuid.uuid4()
        self.quiz(sid)
        other = self.client_for(self.classmate)
        self.assertEqual(self.quiz(sid, client=other).status_code, 200)
        self.assertEqual(self.count(QuizAttempt), 2)

    def test_apps_without_ids_work_before_the_column_exists(self):
        # The deploy may run ahead of the migration: older apps must keep submitting.
        with self.engine.begin() as conn:
            for table in ("quiz_attempts", "practice_attempts"):
                conn.exec_driver_sql(f"drop index {table.replace('_attempts', '')}_attempts_submission_uq")
                conn.exec_driver_sql(f"alter table {table} drop column client_submission_id")
        self.assertEqual(self.quiz().status_code, 200)
        self.assertEqual(self.practice().status_code, 200)
        self.assertEqual(self.client.get(f"/lessons/{self.lesson}/practice").status_code, 200)
        self.assertEqual(self.count(QuizAttempt), 1)

    def test_bad_answers_are_still_refused(self):
        response = self.client.post(f"/lessons/{self.lesson}/quiz/submit",
                                    json={"answers": [], "submission_id": str(uuid.uuid4())})
        self.assertEqual(response.status_code, 422)


# ---- streak days are EA's local days --------------------------------------------------------------


class LocalDayTests(Base_):
    def test_late_evening_utc_is_the_next_day_in_addis_ababa(self):
        late = datetime(2026, 11, 7, 22, 30, tzinfo=timezone.utc)
        self.assertEqual(clock.local_today(late).isoformat(), "2026-11-08")
        self.assertEqual(clock.local_today(datetime(2026, 11, 7, 20, 59, tzinfo=timezone.utc)).isoformat(), "2026-11-07")

    def test_live_streak_rule(self):
        today = datetime(2026, 11, 8).date()
        self.assertTrue(clock.streak_is_live(today, today))
        self.assertTrue(clock.streak_is_live(today - timedelta(days=1), today))
        self.assertFalse(clock.streak_is_live(today - timedelta(days=2), today))
        self.assertFalse(clock.streak_is_live(None, today))

    def test_xp_counts_toward_the_local_day(self):
        from app import xp
        real = xp.local_today
        self.addCleanup(lambda: setattr(xp, "local_today", real))
        days = iter([datetime(2026, 11, 7).date(), datetime(2026, 11, 8).date()])
        xp.local_today = lambda: next(days)
        xp.award_xp(self.db, self.student.id, Decimal("10"), "quiz", 1)
        self.db.commit()
        xp.award_xp(self.db, self.student.id, Decimal("10"), "quiz", 1)
        self.db.commit()
        streak = self.db.get(Streak, self.student.id)
        self.assertEqual((streak.current_streak, streak.last_activity_date.isoformat()), (2, "2026-11-08"))

    def test_the_app_shows_an_ended_streak_as_zero(self):
        client = self.client_for(self.student)
        self.db.add(Streak(student_id=self.student.id, current_streak=4, longest_streak=6,
                           last_activity_date=clock.local_today() - timedelta(days=3)))
        self.db.commit()
        stats = client.get("/me/stats").json()
        self.assertEqual((stats["current_streak"], stats["longest_streak"]), (0, 6))
        self.db.get(Streak, self.student.id).last_activity_date = clock.local_today() - timedelta(days=1)
        self.db.commit()
        self.assertEqual(client.get("/me/stats").json()["current_streak"], 4)


if __name__ == "__main__":
    unittest.main()
