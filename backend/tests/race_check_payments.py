"""Real concurrency checks for approvals. SQLite cannot prove row locks, so this needs
a real, disposable Postgres that already has the migrations applied:

    RACE_DATABASE_URL=postgresql+psycopg://postgres@127.0.0.1:55433/ea_race \
        .venv/bin/python -I backend/tests/race_check_payments.py

It writes test rows, so it refuses to run against anything but localhost.

The control run removes the profile lock and must LOSE time. If it does not, the
window is not being hit and the passing runs would prove nothing.
"""
import os
import sys
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from urllib.parse import urlparse

URL = os.environ.get("RACE_DATABASE_URL", "")
if urlparse(URL).hostname not in ("127.0.0.1", "localhost"):
    sys.exit("Refusing to run: RACE_DATABASE_URL must point at localhost.")

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
os.environ["DATABASE_URL"] = URL
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")

from fastapi import HTTPException  # noqa: E402
from sqlalchemy import create_engine, select, text  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402

from app import payment_rules, payment_service, proof_storage  # noqa: E402
from app.models import Course, CourseAccess, PaymentRequest, Profile  # noqa: E402

ROUNDS = 25
WINDOW_SECONDS = 0.03  # widens the gap between reading access and writing it

engine = create_engine(URL, pool_size=12)
Session = sessionmaker(bind=engine, autoflush=False)

proof_storage.upload = lambda *a, **k: None
proof_storage.delete = lambda *a, **k: None

real_next_expiry = payment_rules.next_expiry
real_lock = payment_service.lock_student


def slow_next_expiry(*args, **kwargs):
    time.sleep(WINDOW_SECONDS)
    return real_next_expiry(*args, **kwargs)


payment_service.next_expiry = slow_next_expiry


def new_user(db, role="student", metadata=None):
    user_id = uuid.uuid4()
    db.execute(
        text(
            "insert into auth.users (id, email, raw_user_meta_data) "
            "values (:id, :email, cast(:meta as jsonb))"
        ),
        {"id": user_id, "email": f"{user_id.hex[:10]}@example.com", "meta": metadata or "{}"},
    )
    db.commit()
    if role != "student":
        db.get(Profile, user_id).role = role
        db.commit()
    return user_id


def setup_round(days=30):
    with Session() as db:
        owner = new_user(db, "teacher")
        student = new_user(db)
        course_id = f"race-{uuid.uuid4().hex[:12]}"
        db.add(
            Course(
                id=course_id, title="Race", description="d", owner_id=owner, status="published",
                price=Decimal("100"), access_days=days, payment_instructions="x",
            )
        )
        db.flush()
        ids = []
        for n in range(2):
            req = PaymentRequest(
                id=uuid.uuid4(), student_id=student, course_id=course_id, amount=Decimal("100"),
                currency="ETB", access_days=days, proof_path=f"p{n}", proof_type="image/png",
                proof_sha256=f"{course_id}-{n}",
            )
            db.add(req)
            ids.append(req.id)
        db.commit()
        return owner, student, course_id, ids


def run_together(*jobs):
    """Runs each job on its own connection at the same moment. Returns the outcomes."""
    barrier = threading.Barrier(len(jobs))
    outcomes = [None] * len(jobs)

    def worker(index, job):
        with Session() as db:
            barrier.wait()
            try:
                job(db)
                outcomes[index] = "ok"
            except HTTPException as error:
                outcomes[index] = error.status_code
            except IntegrityError:
                outcomes[index] = "unique"

    threads = [threading.Thread(target=worker, args=(i, j)) for i, j in enumerate(jobs)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return outcomes


def days_left(student, course_id):
    with Session() as db:
        row = db.get(CourseAccess, (student, course_id))
        if row is None:
            return None
        return (row.expires_at - datetime.now(timezone.utc)) / timedelta(days=1)


def first_approvals_round():
    owner, student, course_id, (a, b) = setup_round()
    outcomes = run_together(
        lambda db: payment_service.approve(db, owner, a),
        lambda db: payment_service.approve(db, owner, b),
    )
    return outcomes, days_left(student, course_id)


def check_first_approvals_stack():
    for _ in range(ROUNDS):
        outcomes, left = first_approvals_round()
        assert outcomes == ["ok", "ok"], outcomes
        assert 59.9 < left <= 60, left
    print(f"PASS  two first approvals at once add both durations ({ROUNDS} rounds)")


def check_control_without_the_lock_loses():
    payment_service.lock_student = lambda db, student_id: None
    try:
        results = [first_approvals_round() for _ in range(ROUNDS)]
    finally:
        payment_service.lock_student = real_lock
    broken = [r for r in results if r[0] != ["ok", "ok"] or not 59.9 < r[1] <= 60]
    assert broken, "control did not fail: this test is not hitting the race window"
    print(f"PASS  control: without the lock, {len(broken)}/{ROUNDS} rounds went wrong, e.g. {broken[0][0]}")


def check_same_request_twice():
    for _ in range(ROUNDS):
        owner, student, course_id, (a, _b) = setup_round()
        outcomes = run_together(
            lambda db: payment_service.approve(db, owner, a),
            lambda db: payment_service.approve(db, owner, a),
        )
        assert sorted(map(str, outcomes)) == ["409", "ok"], outcomes
        assert 29.9 < days_left(student, course_id) <= 30
    print(f"PASS  same request approved twice: one wins, time added once ({ROUNDS} rounds)")


def check_approve_against_reject():
    for _ in range(ROUNDS):
        owner, student, course_id, (a, _b) = setup_round()
        outcomes = run_together(
            lambda db: payment_service.approve(db, owner, a),
            lambda db: payment_service.reject(db, owner, a, None),
        )
        assert sorted(map(str, outcomes)) == ["409", "ok"], outcomes
        with Session() as db:
            status = db.get(PaymentRequest, a).status
        left = days_left(student, course_id)
        assert (status == "approved") == (left is not None), (status, left)
    print(f"PASS  approve against reject: exactly one decision, access matches it ({ROUNDS} rounds)")


def check_approve_against_revoke():
    for _ in range(ROUNDS):
        owner, student, course_id, (a, b) = setup_round()
        with Session() as db:
            payment_service.approve(db, owner, a)
        outcomes = run_together(
            lambda db: payment_service.approve(db, owner, b),
            lambda db: payment_service.revoke(db, owner, course_id, student),
        )
        assert outcomes.count("unique") == 0, outcomes
        with Session() as db:
            row = db.get(CourseAccess, (student, course_id))
            left = (row.expires_at - datetime.now(timezone.utc)) / timedelta(days=1)
            # One order leaves it revoked, the other leaves a fresh 30 days. Never a mix.
            assert row.revoked_at is not None or 29.9 < left <= 30, (row.revoked_at, left)
    print(f"PASS  approve against revoke: they run in turn, never a mix ({ROUNDS} rounds)")


def check_the_lock_does_not_block_the_student():
    owner, student, course_id, (a, _b) = setup_round()
    with Session() as holder, Session() as other:
        payment_service.lock_student(holder, student)
        other.execute(text("set lock_timeout = '1s'"))
        other.execute(
            text("insert into xp_events (student_id, amount, source, source_id) values (:s, 1, 'quiz', 1)"),
            {"s": student},
        )
        other.commit()
        holder.rollback()
    print("PASS  a student can still earn XP while an approval holds the lock")


def check_identical_uploads():
    for _ in range(ROUNDS):
        _owner, student, course_id, _ids = setup_round()
        data = b"\x89PNG\r\n\x1a\n" + uuid.uuid4().bytes
        results = []

        def job(db):
            results.append(payment_service.submit_request(db, student, None, course_id, data))

        outcomes = run_together(job, job)
        assert outcomes == ["ok", "ok"], outcomes
        assert len({r[0]["id"] for r in results}) == 1, results
        assert sorted(r[1] for r in results) == [False, True], results
    print(f"PASS  a double tap makes exactly one request ({ROUNDS} rounds)")


def check_signup_trigger():
    with Session() as db:
        google = new_user(db, metadata='{"name": "Hana Tesfaye", "role": "teacher", "is_admin": true}')
        bare = new_user(db)
        profile = db.get(Profile, google)
        assert (profile.name, profile.role, profile.is_admin) == ("Hana Tesfaye", "student", False)
        assert db.get(Profile, bare).role == "student"
    print("PASS  signup: name comes from metadata, role and admin can never be chosen")


def check_full_flow_on_real_postgres():
    """The Postgres-only SQL that SQLite cannot run: admin search, the ranking query,
    uuid lists, the raw ownership checks and the real constraints, through the real routes."""
    import io

    from fastapi.testclient import TestClient

    from app import content_access
    from app.database import get_db
    from app.deps import get_current_user
    from app.main import app

    png = b"\x89PNG\r\n\x1a\n" + uuid.uuid4().bytes
    with Session() as db:
        owner = new_user(db, "teacher", metadata='{"name": "Owner Teacher"}')
        rival = new_user(db, "teacher", metadata='{"name": "Rival Teacher"}')
        admin = new_user(db, "teacher", metadata='{"name": "Main Admin"}')
        student = new_user(db, metadata='{"name": "Liya Alemu Bekele"}')
        db.get(Profile, admin).is_admin = True
        db.commit()

    def get_session():
        with Session() as session:
            yield session

    def act_as(user_id):
        with Session() as db:
            p = db.get(Profile, user_id)
            user = {
                "id": str(p.id), "name": p.name, "email": "x@example.com", "role": p.role,
                "is_active": p.is_active, "created_at": p.created_at, "class_id": p.class_id,
                "is_admin": p.is_admin,
            }
        # Only who is asking is faked. The real role checks all run.
        app.dependency_overrides[get_current_user] = lambda: user

    app.dependency_overrides[get_db] = get_session
    client = TestClient(app)
    try:
        act_as(owner)
        course = client.post("/teacher/courses", json={"title": "Real", "description": "d"}).json()
        cid = course["id"]
        module = client.post(f"/teacher/courses/{cid}/modules", json={"title": "M"}).json()
        lesson = client.post(f"/teacher/modules/{module['id']}/lessons", json={"title": "L"}).json()
        video = client.post(
            f"/teacher/lessons/{lesson['id']}/activities",
            json={"kind": "video", "video_url": "https://youtu.be/dQw4w9WgXcQ"},
        )
        assert video.status_code == 201, video.text
        assert client.post(f"/teacher/courses/{cid}/publish").status_code == 200
        priced = client.patch(
            f"/teacher/courses/{cid}",
            json={"price": "500.50", "access_days": 30, "payment_instructions": "Telebirr"},
        )
        assert priced.status_code == 200, priced.text
        assert priced.json()["price"] == "500.50" and priced.json()["currency"] == "ETB"

        act_as(student)
        body = client.get(f"/courses/{cid}").json()
        assert body["access"]["state"] == "locked", body
        assert body["modules"][0]["lessons"][0]["video_url"] is None, body
        assert "youtu" not in client.get("/courses").text
        assert client.get(f"/lessons/{lesson['id']}/activities").status_code == 404
        made = client.post(
            f"/courses/{cid}/payment-requests",
            files={"proof": ("x.png", io.BytesIO(png), "image/png")},
        )
        assert made.status_code == 201, made.text
        rid = made.json()["id"]

        act_as(rival)
        assert client.post(f"/teacher/payment-requests/{rid}/approve").status_code == 404
        assert client.get("/teacher/payment-requests").json()["total"] == 0
        assert client.get("/admin/people").status_code == 404

        act_as(owner)
        listed = client.get("/teacher/payment-requests?status=pending").json()
        assert listed["items"][0]["student"]["name"] == "Liya Alemu Bekele", listed
        assert "@example.com" in listed["items"][0]["student"]["email"]
        assert client.post(f"/teacher/payment-requests/{rid}/approve").status_code == 200
        assert client.get(f"/teacher/courses/{cid}/access").json()[0]["state"] == "active"

        act_as(student)
        opened = client.get(f"/courses/{cid}").json()
        assert opened["access"]["state"] == "active"
        assert opened["modules"][0]["lessons"][0]["video_url"], opened
        assert client.get(f"/lessons/{lesson['id']}/activities").status_code == 200
        assert client.get("/me/payment-requests").json()[0]["status"] == "approved"

        board = client.get("/ranking?scope=national&period=weekly")
        assert board.status_code == 200, board.text
        mine = [e for e in board.json() if e["id"]]
        assert [e["id"] for e in mine] == [str(student)], board.json()
        assert mine[0]["name"] == "Liya B.", mine
        assert client.get("/ranking?scope=national&period=nonsense").status_code == 422

        act_as(admin)
        found = client.get("/admin/people", params={"q": "liya", "role": "student"}).json()
        assert str(student) in [p["id"] for p in found["items"]], found
        assert {p["name"] for p in found["items"]} == {"Liya Alemu Bekele"}, found
        assert client.get("/admin/people", params={"q": "100%_!"}).json()["total"] == 0
        assert client.get(f"/admin/people/{student}").json()["access"][0]["state"] == "active"
        assert client.patch(f"/teacher/courses/{cid}", json={"title": "By admin"}).status_code == 200
        assert client.put(
            f"/admin/courses/{cid}/access/{student}", json={"access_days": None}
        ).json()["expires_at"] is None
        assert client.delete(f"/teacher/courses/{cid}/access/{student}").status_code == 200
        off = client.patch(f"/admin/people/{student}", json={"is_active": False})
        assert off.status_code == 200 and off.json()["is_active"] is False, off.text
        assert client.put(f"/admin/courses/{cid}/owner", json={"owner_id": str(rival)}).status_code == 200
        with Session() as db:
            assert content_access.get_course(db, admin, cid).id == cid  # raw SQL admin bypass
            assert content_access.get_course(db, rival, cid).id == cid
            try:
                content_access.get_course(db, owner, cid)
                raise AssertionError("the old owner kept access")
            except HTTPException as error:
                assert error.status_code == 404
        # The database itself refuses a bad status, whatever the code does.
        with Session() as db:
            try:
                db.execute(
                    text("update payment_requests set status = 'paid' where id = :id"), {"id": rid}
                )
                raise AssertionError("constraint missing")
            except Exception as error:
                assert "check" in str(error).lower(), error
    finally:
        app.dependency_overrides.clear()
    print("PASS  full flow through the real routes on real Postgres")


if __name__ == "__main__":
    check_full_flow_on_real_postgres()
    check_signup_trigger()
    check_first_approvals_stack()
    check_control_without_the_lock_loses()
    check_same_request_twice()
    check_approve_against_reject()
    check_approve_against_revoke()
    check_the_lock_does_not_block_the_student()
    check_identical_uploads()
    print("All race checks passed")
