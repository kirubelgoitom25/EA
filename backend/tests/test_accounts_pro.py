"""Student accounts (phone + username sign-up), EA Pro and Free/Paid/Pro courses.
Run from the repo root with the backend virtualenv:
    .venv/bin/python -I backend/tests/test_accounts_pro.py

Same harness as test_payments: in-memory SQLite, fake proof storage, and here also a fake
Supabase Auth admin that does what the new-account trigger does in the real database.

The rule the user asked for is tested hardest: Pro ending (expiry or revoke) never takes
away a course the student bought. See PurchasesNeverDependOnPro.
"""
import itertools
import os
import sys
import unittest
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from test_payments import NOW, PNG, Case  # noqa: E402  (sets up paths and the environment)

from fastapi import HTTPException  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import select, text  # noqa: E402

from app import (  # noqa: E402
    account_service,
    admin_service,
    payment_service,
    rate_limit,
    studio_access,
    studio_service,
    supabase_admin,
)
from app.account_rules import (  # noqa: E402
    clean_password,
    clean_school,
    clean_username,
    is_internal_email,
    normalize_phone,
    stand_in_email,
    visible_email,
)
from app.config import settings  # noqa: E402
from app.database import get_db  # noqa: E402
from app.deps import get_current_user  # noqa: E402
from app.main import app  # noqa: E402
from app.models import (  # noqa: E402
    ClassCourse,
    CourseAccess,
    LessonProgress,
    Membership,
    Plan,
    Profile,
    StudentProfile,
)
from app.payment_rules import (  # noqa: E402
    ACTIVE,
    CLASS,
    EXPIRED,
    FREE,
    LOCKED,
    PRO,
    PRO_LOCKED,
    REVOKED,
    access_state,
)
from app.routers import stats  # noqa: E402

DOMAIN = "accounts.ea.test"


# ---- pure rules ---------------------------------------------------------------------------


class AccountRules(unittest.TestCase):
    def test_phone_numbers_are_stored_one_way(self):
        for written in ("0911234567", "0911 234 567", "911234567", "+251911234567",
                        "251911234567", "+251 91 123 4567", "(091) 123-4567"):
            self.assertEqual(normalize_phone(written), "+251911234567", written)
        self.assertEqual(normalize_phone("0711234567"), "+251711234567")  # Safaricom

    def test_bad_phone_numbers(self):
        for bad in ("", "abc", "0811234567", "091123456", "09112345678", "+1 555 123 4567",
                    "+2519112345678", None, 911234567, "0911-234-56a"):
            self.assertIsNone(normalize_phone(bad), repr(bad))

    def test_usernames(self):
        self.assertEqual(clean_username("  Liya_A "), "liya_a")
        for bad in ("ab", "a" * 21, "liya a", "liya-a", "líya", "admin", "Support", "", None):
            with self.assertRaises(HTTPException, msg=repr(bad)):
                clean_username(bad)

    def test_passwords(self):
        self.assertEqual(clean_password("12345678"), "12345678")
        for bad in ("1234567", "", None, "x" * 73, "é" * 37, "abcdefg\x00h"):
            with self.assertRaises(HTTPException, msg=repr(bad)):
                clean_password(bad)

    def test_school(self):
        self.assertEqual(clean_school("  Addis   Ababa  University "), "Addis Ababa University")
        for bad in ("", " ", "A", "x" * 121, None):
            with self.assertRaises(HTTPException, msg=repr(bad)):
                clean_school(bad)

    def test_stand_in_addresses_look_real_and_never_change(self):
        a = stand_in_email("secret", "+251911234567", DOMAIN)
        self.assertEqual(a, stand_in_email("secret", "+251911234567", DOMAIN))
        self.assertNotEqual(a, stand_in_email("secret", "+251911234568", DOMAIN))
        self.assertRegex(a, r"^s\.[0-9a-f]{16}@accounts\.ea\.test$")

    def test_internal_emails_are_hidden(self):
        self.assertTrue(is_internal_email("s.abc@ACCOUNTS.ea.test", DOMAIN))
        self.assertIsNone(visible_email("s.abc@accounts.ea.test", DOMAIN))
        self.assertEqual(visible_email("liya@gmail.com", DOMAIN), "liya@gmail.com")
        self.assertEqual(visible_email("liya@gmail.com", ""), "liya@gmail.com")


class RateLimit(unittest.TestCase):
    def setUp(self):
        rate_limit.reset()
        self.addCleanup(rate_limit.reset)

    def test_limit_and_window(self):
        for i in range(3):
            self.assertTrue(rate_limit.hit("k", 3, 60, now=100 + i))
        self.assertFalse(rate_limit.hit("k", 3, 60, now=103))
        self.assertTrue(rate_limit.hit("other", 3, 60, now=103))
        self.assertTrue(rate_limit.hit("k", 3, 60, now=161))  # the first one has left the window


# ---- access rule: Pro and purchases are independent ----------------------------------------


PAST, FUTURE = NOW - timedelta(days=1), NOW + timedelta(days=1)
# (has_row, expires_at, revoked_at): every shape a course_access row can have.
PURCHASES = [
    (False, None, None),
    (True, None, None),  # permanent
    (True, FUTURE, None),  # running
    (True, PAST, None),  # expired
    (True, FUTURE, NOW),  # revoked
    (True, None, NOW),  # permanent, revoked
]


class AccessRuleWithPro(unittest.TestCase):
    def state(self, tier, purchase, pro, in_class=False):
        has_row, expires_at, revoked_at = purchase
        price = Decimal("100") if tier == "paid" else Decimal("0")
        return access_state(price, in_class, expires_at, revoked_at, has_row, NOW, tier=tier, pro_active=pro)

    def test_pro_never_changes_a_paid_course(self):
        for purchase, in_class in itertools.product(PURCHASES, (False, True)):
            self.assertEqual(
                self.state("paid", purchase, True, in_class),
                self.state("paid", purchase, False, in_class),
                purchase,
            )

    def test_a_purchase_always_opens_a_pro_course_whatever_pro_does(self):
        running = [(True, None, None), (True, FUTURE, None)]
        for purchase, pro in itertools.product(running, (False, True)):
            self.assertEqual(self.state("pro", purchase, pro), ACTIVE)

    def test_pro_course_without_a_purchase_follows_pro(self):
        for purchase in [p for p in PURCHASES if not (p[0] and p[2] is None and (p[1] is None or p[1] > NOW))]:
            self.assertEqual(self.state("pro", purchase, True), PRO)
            self.assertEqual(self.state("pro", purchase, False), PRO_LOCKED)

    def test_free_and_class(self):
        for purchase, pro in itertools.product(PURCHASES, (False, True)):
            self.assertEqual(self.state("free", purchase, pro), FREE)
            self.assertEqual(self.state("pro", purchase, pro, in_class=True), CLASS)

    def test_older_callers_without_a_tier_are_unchanged(self):
        self.assertEqual(access_state(Decimal("0"), False, None, None, False, NOW), FREE)
        self.assertEqual(access_state(Decimal("5"), False, None, None, False, NOW), LOCKED)
        self.assertEqual(access_state(Decimal("5"), False, PAST, None, True, NOW), EXPIRED)
        self.assertEqual(access_state(Decimal("5"), False, None, NOW, True, NOW), REVOKED)


# ---- the database side ------------------------------------------------------------------------


class ProCase(Case):
    def setUp(self):
        super().setUp()
        rate_limit.reset()
        self.addCleanup(rate_limit.reset)
        self.plan = admin_service.create_plan(
            self.db, self.admin.id,
            {"title": "Pro 1 month", "price": "150", "access_days": 30,
             "payment_instructions": "Telebirr 0911"},
        )
        self.pro_course, self.pro_lesson = self.paid_course(price=None)
        studio_service.update_course(self.db, self.owner.id, self.pro_course, {"access_tier": "pro"})

    def give_pro(self, student=None, days=30):
        return admin_service.grant_pro(self.db, self.admin.id, (student or self.student).id, days)

    def membership(self, student=None):
        return self.db.get(Membership, ((student or self.student).id, "pro"))

    def end_pro(self, student=None):
        row = self.membership(student)
        row.expires_at = NOW - timedelta(days=400)
        self.db.commit()

    def access_rows(self):
        return sorted(
            (str(r.student_id), r.course_id, str(r.expires_at), str(r.revoked_at), r.source)
            for r in self.db.execute(select(CourseAccess)).scalars()
        )

    def buy(self, student=None, course_id=None):
        student = student or self.student
        result = payment_service.submit_request(
            self.db, student.id, student.class_id, course_id or self.course_id, PNG
        )
        payment_service.approve(self.db, self.owner.id, uuid.UUID(result[0]["id"]))


class ProCourses(ProCase):
    def test_pro_course_is_listed_but_closed_without_pro(self):
        self.assertEqual(self.state(course_id=self.pro_course), PRO_LOCKED)
        self.assertFalse(self.can_open(lesson_id=self.pro_lesson))
        self.assertIn(
            self.pro_course,
            studio_access.visible_course_ids_for_student(self.db, self.student.id, None),
        )

    def test_pro_opens_it_and_ending_pro_closes_it(self):
        self.give_pro()
        self.assertEqual(self.state(course_id=self.pro_course), PRO)
        self.assertTrue(self.can_open(lesson_id=self.pro_lesson))
        self.end_pro()
        self.assertEqual(self.state(course_id=self.pro_course), PRO_LOCKED)
        self.assertFalse(self.can_open(lesson_id=self.pro_lesson))

    def test_revoking_pro_closes_it(self):
        self.give_pro()
        admin_service.revoke_pro(self.db, self.admin.id, self.student.id)
        self.assertFalse(self.can_open(lesson_id=self.pro_lesson))

    def test_pro_never_opens_a_paid_course(self):
        self.give_pro()
        self.assertEqual(self.state(), LOCKED)
        self.assertFalse(self.can_open())

    def test_class_opens_a_pro_course(self):
        self.db.add(ClassCourse(class_id="class-a", course_id=self.pro_course))
        self.db.commit()
        self.assertEqual(self.state(self.classmate, self.pro_course), CLASS)

    def test_a_pro_course_cannot_be_bought_alone(self):
        with self.assertRaises(HTTPException) as ctx:
            payment_service.submit_request(self.db, self.student.id, None, self.pro_course, PNG)
        self.assertEqual(ctx.exception.status_code, 409)
        self.assertIn("Pro", ctx.exception.detail)

    def test_course_list_says_pro_and_not_for_sale(self):
        from app.routers.courses import _student_courses

        listed = {c["id"]: c for c in _student_courses(self.db, {"id": str(self.student.id), "class_id": None})}
        self.assertEqual(listed[self.pro_course]["access_tier"], "pro")
        self.assertFalse(listed[self.pro_course]["purchasable"])
        self.assertEqual(listed[self.pro_course]["access"]["state"], PRO_LOCKED)
        self.assertEqual(listed[self.course_id]["access_tier"], "paid")


class PurchasesNeverDependOnPro(ProCase):
    """The user's rule: Pro expiry or revocation never removes a purchased course."""

    def test_a_bought_course_stays_open_through_every_pro_change(self):
        self.buy()
        self.assertTrue(self.can_open())
        before = self.access_rows()
        self.give_pro()
        self.assertTrue(self.can_open())
        self.end_pro()
        self.assertTrue(self.can_open())
        self.give_pro()  # renew after expiry
        admin_service.revoke_pro(self.db, self.admin.id, self.student.id)
        self.assertTrue(self.can_open())
        self.assertEqual(self.state(), ACTIVE)
        # Nothing about Pro wrote to course_access.
        self.assertEqual(self.access_rows(), before)

    def test_plan_approval_never_writes_course_access(self):
        self.buy()
        before = self.access_rows()
        result = payment_service.submit_plan_request(self.db, self.student.id, self.plan["id"], PNG)
        payment_service.approve(self.db, self.admin.id, uuid.UUID(result[0]["id"]))
        self.assertTrue(self.membership().expires_at)
        self.assertEqual(self.access_rows(), before)

    def test_bought_before_it_became_pro_stays_open_after_pro_ends(self):
        self.buy()
        studio_service.update_course(self.db, self.owner.id, self.course_id, {"access_tier": "pro"})
        self.give_pro()
        self.end_pro()
        self.assertEqual(self.state(), ACTIVE)
        self.assertTrue(self.can_open())

    def test_pro_members_who_started_keep_a_course_that_turns_paid(self):
        self.give_pro()
        self.db.add(LessonProgress(student_id=self.student.id, lesson_id=self.pro_lesson))
        self.db.commit()
        studio_service.update_course(
            self.db, self.owner.id, self.pro_course,
            {"access_tier": "paid", "price": "200", "payment_instructions": "Pay me"},
        )
        self.end_pro()
        self.assertEqual(self.access_row(course_id=self.pro_course).source, "existing_learner")
        self.assertTrue(self.can_open(lesson_id=self.pro_lesson))

    def test_learners_keep_a_free_course_that_turns_pro(self):
        course_id, lesson_id = self.paid_course(price=None)
        self.db.add(LessonProgress(student_id=self.student.id, lesson_id=lesson_id))
        self.db.commit()
        studio_service.update_course(self.db, self.owner.id, course_id, {"access_tier": "pro"})
        self.assertEqual(self.state(course_id=course_id), ACTIVE)
        self.assertEqual(self.state(self.classmate, course_id), PRO_LOCKED)


class CourseTiers(ProCase):
    def test_pro_and_free_have_no_price(self):
        out = studio_service.update_course(self.db, self.owner.id, self.course_id, {"access_tier": "pro"})
        self.assertEqual((out["access_tier"], Decimal(out["price"])), ("pro", Decimal("0")))
        out = studio_service.update_course(self.db, self.owner.id, self.course_id, {"access_tier": "free"})
        self.assertEqual(out["access_tier"], "free")

    def test_back_to_paid_keeps_the_saved_terms(self):
        studio_service.update_course(self.db, self.owner.id, self.course_id, {"access_tier": "pro"})
        out = studio_service.update_course(
            self.db, self.owner.id, self.course_id, {"access_tier": "paid", "price": "500"}
        )
        self.assertEqual((out["access_days"], out["payment_instructions"]), (30, "Send to 0911"))

    def test_paid_needs_a_price(self):
        course_id, _ = self.paid_course(price=None)
        with self.assertRaises(HTTPException):
            studio_service.update_course(
                self.db, self.owner.id, course_id,
                {"access_tier": "paid", "payment_instructions": "x"},
            )

    def test_unknown_tier(self):
        with self.assertRaises(HTTPException):
            studio_service.update_course(self.db, self.owner.id, self.course_id, {"access_tier": "gold"})

    def test_older_dashboards_sending_only_a_price(self):
        out = studio_service.update_course(self.db, self.owner.id, self.course_id, {"price": "0"})
        self.assertEqual(out["access_tier"], "free")
        out = studio_service.update_course(self.db, self.owner.id, self.pro_course, {"price": "0"})
        self.assertEqual(out["access_tier"], "pro")  # a price of 0 leaves a Pro course alone


class ProPayments(ProCase):
    def submit_plan(self, student=None, data=PNG):
        return payment_service.submit_plan_request(
            self.db, (student or self.student).id, self.plan["id"], data
        )

    def test_terms_are_copied_from_the_plan(self):
        result, created = self.submit_plan()
        self.assertTrue(created)
        self.assertEqual(
            (result["kind"], result["plan_id"], result["course_id"], result["course_title"]),
            ("plan", self.plan["id"], None, "Pro 1 month"),
        )
        self.assertEqual((Decimal(result["amount"]), result["access_days"]), (Decimal("150"), 30))

    def test_only_the_admin_reviews_plan_requests(self):
        request_id = uuid.UUID(self.submit_plan()[0]["id"])
        owner_view = payment_service.list_for_review(self.db, self.owner.id, None, None, None, 50, 0)
        self.assertEqual(owner_view["items"], [])
        self.assertEqual(self.status_of(payment_service.approve, self.db, self.owner.id, request_id), 404)
        self.assertEqual(self.status_of(payment_service.read_proof, self.db, self.owner.id, request_id), 404)
        admin_view = payment_service.list_for_review(self.db, self.admin.id, "pending", None, None, 50, 0, "plan")
        self.assertEqual([i["kind"] for i in admin_view["items"]], ["plan"])
        self.assertIsNone(admin_view["items"][0]["course"])
        self.assertEqual(admin_view["items"][0]["plan"]["title"], "Pro 1 month")

    def test_approve_gives_pro_and_renewing_adds_time(self):
        first = uuid.UUID(self.submit_plan()[0]["id"])
        item = payment_service.approve(self.db, self.admin.id, first)
        self.assertEqual(item["status"], "approved")
        ends = self.membership().expires_at
        second = uuid.UUID(self.submit_plan(data=PNG + b"2")[0]["id"])
        pending = payment_service.list_for_review(self.db, self.admin.id, "pending", None, None, 50, 0)
        self.assertEqual(pending["items"][0]["current_access"]["state"], "active")
        payment_service.approve(self.db, self.admin.id, second)
        self.assertAlmostEqual(
            (self.membership().expires_at - ends).total_seconds(), 30 * 86400, delta=5
        )

    def test_reject_and_history(self):
        request_id = uuid.UUID(self.submit_plan()[0]["id"])
        payment_service.reject(self.db, self.admin.id, request_id, "Wrong amount")
        mine = payment_service.my_requests(self.db, self.student.id)
        self.assertEqual((mine[0]["kind"], mine[0]["status"]), ("plan", "rejected"))
        self.assertIsNone(self.membership())

    def test_same_image_twice_is_one_request(self):
        self.assertTrue(self.submit_plan()[1])
        self.assertFalse(self.submit_plan()[1])

    def test_inactive_plan_cannot_be_bought(self):
        admin_service.update_plan(self.db, self.admin.id, self.plan["id"], {"is_active": False})
        self.assertEqual(self.status_of(self.submit_plan), 404)
        self.assertEqual(payment_service.active_plans(self.db), [])

    def test_permanent_pro_cannot_buy_more(self):
        self.give_pro(days=None)
        self.assertEqual(self.status_of(self.submit_plan), 409)

    def test_plan_rules(self):
        for bad in ({"title": "x", "price": "0", "access_days": 30, "payment_instructions": "y"},
                    {"title": "x", "price": "10", "access_days": None, "payment_instructions": "y"},
                    {"title": "x", "price": "10", "access_days": 30, "payment_instructions": " "},
                    {"title": "", "price": "10", "access_days": 30, "payment_instructions": "y"}):
            with self.assertRaises(HTTPException, msg=bad):
                admin_service.create_plan(self.db, self.admin.id, bad)

    def test_teacher_course_requests_still_work_alongside(self):
        self.buy()
        self.submit_plan()
        owner_view = payment_service.list_for_review(self.db, self.owner.id, None, None, None, 50, 0)
        self.assertEqual([i["kind"] for i in owner_view["items"]], ["course"])

    def test_revoke_pro_twice_and_for_nobody(self):
        self.assertEqual(self.status_of(admin_service.revoke_pro, self.db, self.admin.id, self.student.id), 404)
        self.give_pro()
        admin_service.revoke_pro(self.db, self.admin.id, self.student.id)
        self.assertEqual(self.status_of(admin_service.revoke_pro, self.db, self.admin.id, self.student.id), 409)

    def test_pro_only_for_students(self):
        self.assertEqual(self.status_of(admin_service.grant_pro, self.db, self.admin.id, self.owner.id, 30), 404)

    def test_ranking_badge(self):
        rows = [{"id": uuid.uuid4(), "name": "a", "xp": 5, "weekly_xp": 5, "monthly_xp": 5, "pro": True},
                {"id": uuid.uuid4(), "name": "b", "xp": 1, "weekly_xp": 1, "monthly_xp": 1}]
        board = stats.national_board(rows, "", "overall")
        self.assertEqual([r["pro"] for r in board], [True, False])


# ---- accounts ----------------------------------------------------------------------------------


class FakeAuthAdmin:
    """Supabase plus the account triggers, in Supabase's real order (supabase/auth
    internal/api/admin.go, adminUserCreate): INSERT the user (handle_new_user makes a bare
    profile: app_metadata is not there yet), then UPDATE app_metadata in the same transaction
    (handle_user_app_metadata writes username, phone, school). Any failure undoes it all.

    triggers=False plays a Supabase that applied the metadata where no trigger saw it, so
    the backend's own check has to fill the details in."""

    def __init__(self, db):
        self.db = db
        self.passwords = {}
        self.deleted = []
        self.fail = None
        self.triggers = True

    def create_user(self, email, password, user_metadata, app_metadata):
        if self.fail:
            raise supabase_admin.AuthAdminError(*self.fail)
        user_id = uuid.uuid4()
        try:
            # INSERT: auth row and the bare profile.
            self.db.execute(text("insert into auth.users (id, email) values (:id, :e)"), {"id": user_id, "e": email})
            self.db.add(Profile(id=user_id, name=user_metadata["name"], role="student"))
            self.db.flush()
            if self.triggers:
                # UPDATE of raw_app_meta_data: apply_signup_details.
                profile = self.db.get(Profile, user_id)
                profile.username = profile.username or app_metadata.get("ea_username")
                profile.phone = profile.phone or app_metadata.get("ea_phone")
                self.db.add(StudentProfile(student_id=user_id, school=app_metadata.get("ea_school")))
                self.db.flush()
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise supabase_admin.AuthAdminError(500, "unexpected_failure")
        self.passwords[str(user_id)] = password
        return str(user_id)

    def set_password(self, user_id, password):
        if self.fail:
            raise supabase_admin.AuthAdminError(*self.fail)
        self.passwords[user_id] = password

    def delete_user(self, user_id):
        self.deleted.append(user_id)
        self.db.execute(text("delete from student_profiles where student_id = :id"), {"id": uuid.UUID(user_id)})
        self.db.execute(text("delete from profiles where id = :id"), {"id": uuid.UUID(user_id)})
        self.db.execute(text("delete from auth.users where id = :id"), {"id": uuid.UUID(user_id)})
        self.db.commit()


class AccountCase(Case):
    def setUp(self):
        super().setUp()
        rate_limit.reset()
        self.addCleanup(rate_limit.reset)
        self.auth = FakeAuthAdmin(self.db)
        originals = (supabase_admin.create_user, supabase_admin.set_password, supabase_admin.delete_user,
                     settings.student_email_domain)
        supabase_admin.create_user = self.auth.create_user
        supabase_admin.set_password = self.auth.set_password
        supabase_admin.delete_user = self.auth.delete_user
        settings.student_email_domain = DOMAIN

        def restore():
            (supabase_admin.create_user, supabase_admin.set_password, supabase_admin.delete_user,
             settings.student_email_domain) = originals

        self.addCleanup(restore)

    def details(self, **changes):
        values = {"username": "Liya_A", "phone": "0911 234 567", "password": "secret-123",
                  "school": "Addis Ababa University"}
        values.update(changes)
        return values

    def register(self, **changes):
        return account_service.register(self.db, self.details(**changes))


class Registration(AccountCase):
    def test_creates_the_account_with_a_hidden_address(self):
        out = self.register()
        self.assertRegex(out["login_email"], r"^s\.[0-9a-f]{16}@accounts\.ea\.test$")
        profile = self.db.execute(select(Profile).where(Profile.username == "liya_a")).scalar_one()
        self.assertEqual((profile.phone, profile.name, profile.role), ("+251911234567", "liya_a", "student"))
        self.assertEqual(self.db.get(StudentProfile, profile.id).school, "Addis Ababa University")
        self.assertEqual(self.auth.passwords[str(profile.id)], "secret-123")

    def test_closed_until_the_domain_is_set(self):
        settings.student_email_domain = ""
        self.assertEqual(self.status_of(self.register), 503)

    def test_taken_username_or_phone(self):
        self.register()
        with self.assertRaises(HTTPException) as ctx:
            self.register(phone="0922000000", username="LIYA_A")
        self.assertEqual((ctx.exception.status_code, ctx.exception.detail),
                         (409, account_service.USERNAME_TAKEN))
        with self.assertRaises(HTTPException) as ctx:
            self.register(username="other", phone="+251911234567")
        self.assertEqual(ctx.exception.detail, account_service.PHONE_TAKEN)

    def test_a_race_lost_inside_supabase_reads_as_taken(self):
        self.register()
        original = account_service._taken
        calls = []

        def miss_first(db, username, phone, except_id=None):
            calls.append(1)
            return None if len(calls) == 1 else original(db, username, phone, except_id)

        account_service._taken = miss_first
        self.addCleanup(setattr, account_service, "_taken", original)
        with self.assertRaises(HTTPException) as ctx:
            self.register()
        self.assertEqual(ctx.exception.status_code, 409)

    def test_details_are_filled_in_if_no_trigger_saved_them(self):
        self.auth.triggers = False
        out = self.register()
        profile = self.db.execute(select(Profile).where(Profile.username == "liya_a")).scalar_one()
        self.assertEqual(profile.phone, "+251911234567")
        self.assertEqual(self.db.get(StudentProfile, profile.id).school, "Addis Ababa University")
        self.assertEqual(account_service.resolve_login(self.db, "0911234567")["email"], out["login_email"])
        self.assertEqual(self.auth.deleted, [])

    def test_a_half_made_account_whose_phone_was_taken_is_removed(self):
        self.register()
        self.auth.triggers = False
        original = account_service._taken
        calls = []

        def miss_first(db, username, phone, except_id=None):
            calls.append(1)
            return None if len(calls) == 1 else original(db, username, phone, except_id)

        account_service._taken = miss_first
        self.addCleanup(setattr, account_service, "_taken", original)
        with self.assertRaises(HTTPException) as ctx:
            self.register(username="someone_else")
        self.assertEqual((ctx.exception.status_code, ctx.exception.detail), (409, account_service.PHONE_TAKEN))
        self.assertEqual(len(self.auth.deleted), 1)
        self.assertEqual(self.db.execute(select(Profile).where(Profile.phone == "+251911234567")).scalar_one().username, "liya_a")

    def test_supabase_down(self):
        self.auth.fail = (0, "ConnectError")
        self.assertEqual(self.status_of(self.register), 503)
        self.auth.fail = (422, "weak_password")
        self.assertEqual(self.status_of(self.register), 422)

    def test_bad_details_never_reach_supabase(self):
        for bad in ({"phone": "12345"}, {"username": "a"}, {"password": "short"}, {"school": ""}):
            self.assertEqual(self.status_of(self.register, **bad), 422, bad)
        self.assertEqual(self.auth.passwords, {})


class LoginLookup(AccountCase):
    def test_phone_in_any_form_and_username_in_any_case(self):
        email = self.register()["login_email"]
        for identifier in ("0911234567", "+251 911 234 567", "911234567", "Liya_A", " liya_a "):
            self.assertEqual(account_service.resolve_login(self.db, identifier)["email"], email, identifier)

    def test_unknown_gets_a_stand_in_that_looks_the_same(self):
        self.register()
        unknown = account_service.resolve_login(self.db, "0922999999")["email"]
        self.assertRegex(unknown, r"^s\.[0-9a-f]{16}@accounts\.ea\.test$")
        self.assertEqual(unknown, account_service.resolve_login(self.db, "0922 999 999")["email"])
        self.assertNotEqual(unknown, account_service.resolve_login(self.db, "nobody")["email"])

    def test_emails_pass_through(self):
        self.assertEqual(account_service.resolve_login(self.db, "liya@gmail.com")["email"], "liya@gmail.com")

    def test_empty(self):
        self.assertEqual(self.status_of(account_service.resolve_login, self.db, "  "), 422)


class MyProfile(AccountCase):
    def test_older_email_accounts_fill_it_in_once(self):
        self.assertFalse(account_service.my_profile(self.db, self.student.id)["profile_complete"])
        out = account_service.update_my_profile(
            self.db, self.student.id, {"username": "stu_1", "phone": "0933111222", "school": "Bole High"}
        )
        self.assertTrue(out["profile_complete"])
        self.assertEqual(out["name"], "Student")  # a name they chose stays

    def test_name_follows_the_username_for_phone_accounts(self):
        self.register()
        profile = self.db.execute(select(Profile).where(Profile.username == "liya_a")).scalar_one()
        out = account_service.update_my_profile(self.db, profile.id, {"username": "liya_b"})
        self.assertEqual((out["name"], out["username"]), ("liya_b", "liya_b"))

    def test_taken(self):
        self.register()
        self.assertEqual(
            self.status_of(account_service.update_my_profile, self.db, self.student.id, {"phone": "0911234567"}),
            409,
        )


class StaffViews(AccountCase):
    def test_hidden_addresses_never_reach_staff(self):
        self.register()
        profile = self.db.execute(select(Profile).where(Profile.username == "liya_a")).scalar_one()
        person = payment_service.people_by_id(self.db, [profile.id])[str(profile.id)]
        self.assertEqual((person["email"], person["phone"], person["username"]), (None, "+251911234567", "liya_a"))
        listed = admin_service.list_people(self.db, "student", "0911 234 567", 50, 0)
        self.assertEqual([p["username"] for p in listed["items"]], ["liya_a"])
        self.assertIsNone(listed["items"][0]["email"])
        detail = admin_service.person_detail(self.db, profile.id)
        self.assertEqual((detail["school"], detail["pro"]["state"]), ("Addis Ababa University", "none"))

    def test_search_by_username(self):
        self.register()
        self.assertEqual(admin_service.list_people(self.db, None, "liya", 50, 0)["total"], 1)

    def test_temporary_password(self):
        admin_service.set_temporary_password(self.db, self.admin.id, self.student.id, "new-pass-1")
        self.assertEqual(self.auth.passwords[str(self.student.id)], "new-pass-1")
        self.assertEqual(self.status_of(admin_service.set_temporary_password, self.db, self.admin.id, self.admin.id, "new-pass-1"), 409)
        self.assertEqual(self.status_of(admin_service.set_temporary_password, self.db, self.admin.id, self.student.id, "short"), 422)


class OverHttp(AccountCase):
    def setUp(self):
        super().setUp()
        self.addCleanup(app.dependency_overrides.clear)
        app.dependency_overrides[get_db] = lambda: self.db
        self.client = TestClient(app, raise_server_exceptions=True)

    def act_as(self, person):
        user = {
            "id": str(person.id), "name": person.name, "email": "x@example.com", "role": person.role,
            "is_active": True, "created_at": person.created_at, "class_id": person.class_id,
            "is_admin": person.is_admin,
        }
        app.dependency_overrides[get_current_user] = lambda: user

    def test_register_then_resolve(self):
        response = self.client.post("/auth/register", json=self.details())
        self.assertEqual(response.status_code, 201, response.text)
        email = response.json()["login_email"]
        found = self.client.post("/auth/resolve-login", json={"identifier": "0911234567"})
        self.assertEqual(found.json()["email"], email)

    def test_register_refuses_unknown_fields(self):
        response = self.client.post("/auth/register", json={**self.details(), "role": "teacher"})
        self.assertEqual(response.status_code, 422)

    def test_register_is_rate_limited_per_phone(self):
        for _ in range(5):
            self.client.post("/auth/register", json=self.details(username="x" * 2))
        response = self.client.post("/auth/register", json=self.details(username="x" * 2))
        self.assertEqual(response.status_code, 429)

    def test_auth_me_reports_pro_and_profile(self):
        self.act_as(self.student)
        me = self.client.get("/auth/me").json()
        self.assertEqual((me["pro"]["state"], me["profile_complete"]), ("none", False))
        admin_service.grant_pro(self.db, self.admin.id, self.student.id, 30)
        me = self.client.get("/auth/me").json()
        self.assertTrue(me["pro"]["active"])
        self.act_as(self.owner)
        self.assertIsNone(self.client.get("/auth/me").json().get("pro"))

    def test_profile_routes(self):
        self.act_as(self.student)
        response = self.client.patch("/me/profile", json={"username": "stu_9", "phone": "0944000111", "school": "AAU"})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertTrue(self.client.get("/me/profile").json()["profile_complete"])
        self.act_as(self.owner)
        self.assertEqual(self.client.get("/me/profile").status_code, 403)

    def test_plan_routes(self):
        plan = admin_service.create_plan(
            self.db, self.admin.id,
            {"title": "Pro", "price": "99", "access_days": 30, "payment_instructions": "Telebirr"},
        )
        self.act_as(self.student)
        self.assertEqual([p["id"] for p in self.client.get("/plans").json()], [plan["id"]])
        response = self.client.post(
            f"/plans/{plan['id']}/payment-requests", files={"proof": ("p.png", PNG, "image/png")}
        )
        self.assertEqual(response.status_code, 201, response.text)
        self.assertEqual(self.client.get("/me/payment-requests").json()[0]["kind"], "plan")

    def test_admin_only_routes(self):
        self.act_as(self.owner)
        for method, path, body in (
            ("get", "/admin/plans", None),
            ("post", "/admin/plans", {"title": "x", "price": "1", "access_days": 1, "payment_instructions": "y"}),
            ("put", f"/admin/people/{self.student.id}/pro", {"access_days": 30}),
            ("delete", f"/admin/people/{self.student.id}/pro", None),
            ("put", f"/admin/people/{self.student.id}/password", {"password": "abcdefgh"}),
        ):
            kwargs = {"json": body} if body is not None else {}
            self.assertEqual(getattr(self.client, method)(path, **kwargs).status_code, 404, path)
        self.act_as(self.admin)
        self.assertEqual(
            self.client.put(f"/admin/people/{self.student.id}/pro", json={"access_days": 30}).json()["state"],
            "active",
        )


# ---- the SQL file ----------------------------------------------------------------------------


class MigrationText(unittest.TestCase):
    def read(self, name):
        repo = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
        with open(os.path.join(repo, "supabase", "pending", name)) as f:
            return f.read()

    def test_triggers_read_only_service_key_metadata(self):
        sql = self.read("20261108000000_accounts_and_pro.sql")
        triggers = sql[sql.index("-- 3."):sql.index("-- 4.")]
        self.assertIn("raw_app_meta_data", triggers)
        self.assertNotIn("raw_user_meta_data->>'ea_", triggers)

    def test_details_are_written_on_the_app_metadata_update(self):
        # Supabase applies app_metadata in an UPDATE after the INSERT (adminUserCreate).
        sql = self.read("20261108000000_accounts_and_pro.sql")
        self.assertIn("after update of raw_app_meta_data on auth.users", sql)
        self.assertIn("perform public.apply_signup_details(new.id", sql)
        # The helper is security definer, so nobody but the database may call it.
        self.assertIn("revoke all on function public.apply_signup_details(uuid, jsonb) from public, anon, authenticated", sql)

    def test_only_one_update_and_it_follows_the_price(self):
        sql = self.read("20261108000000_accounts_and_pro.sql")
        self.assertIn("update public.courses set access_tier = 'paid' where price > 0;", sql)
        # The only other update fills empty profile fields from the service key's metadata.
        self.assertEqual(sql.count("update public."), 2)
        self.assertIn("update public.profiles\n     set username = coalesce(username,", sql)
        for statement in ("delete from", "drop table", "drop column"):
            self.assertNotIn(statement, sql)

    def test_pro_never_touches_course_access(self):
        sql = self.read("20261108000000_accounts_and_pro.sql")
        body = sql[sql.index("-- 5. Pro plans"):]
        self.assertNotIn("course_access", body.replace("kept like course_access", ""))

    def test_new_tables_are_backend_only(self):
        sql = self.read("20261108000000_accounts_and_pro.sql")
        for table in ("student_profiles", "plans", "memberships"):
            self.assertIn(f"alter table public.{table}", sql)
        self.assertIn("from public, anon, authenticated", sql)

    def test_rollback_refuses_once_in_use(self):
        sql = self.read("accounts_and_pro_rollback_pre_use_only.sql")
        self.assertLess(sql.index("REFUSED"), sql.index("drop table"))


if __name__ == "__main__":
    unittest.main(verbosity=1)
