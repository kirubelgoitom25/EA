"""Student accounts: sign-up by username + phone + password + school, logging in by phone or
username, and the student's own profile.

The account itself lives in Supabase Auth. The backend creates it with the service key,
passing username, phone and school as app_metadata; the new-account trigger writes them to
profiles and student_profiles inside the same insert, so either everything is saved or
nothing is (see supabase/pending/20261108000000_accounts_and_pro.sql).
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import or_, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app import supabase_admin
from app.account_rules import (
    clean_password,
    clean_phone,
    clean_school,
    clean_username,
    looks_like_phone,
    new_internal_email,
    normalize_phone,
    stand_in_email,
)
from app.config import settings
from app.content_rules import ContentError
from app.content_service import transaction
from app.models import Profile, StudentProfile

log = logging.getLogger("ea.accounts")

USERNAME_TAKEN = "That username is taken. Try another one."
PHONE_TAKEN = "This phone number already has an account. Log in instead."
CLOSED = "Sign-up isn't open yet. Please try again soon."

_LOGIN_EMAIL_SQL = "select u.email from profiles p join auth.users u on u.id = p.id where "
LOGIN_EMAIL_BY_PHONE = text(_LOGIN_EMAIL_SQL + "p.phone = :value")
LOGIN_EMAIL_BY_USERNAME = text(_LOGIN_EMAIL_SQL + "p.username = :value")


def _taken(db: Session, username: Optional[str], phone: Optional[str], except_id=None) -> Optional[str]:
    """The message for whichever of username or phone another account already has."""
    conditions = []
    if username:
        conditions.append(Profile.username == username)
    if phone:
        conditions.append(Profile.phone == phone)
    if not conditions:
        return None
    query = select(Profile.id, Profile.username, Profile.phone).where(or_(*conditions))
    if except_id is not None:
        query = query.where(Profile.id != except_id)
    for row in db.execute(query).all():
        if username and row.username == username:
            return USERNAME_TAKEN
        if phone and row.phone == phone:
            return PHONE_TAKEN
    return None


def register(db: Session, values: dict) -> dict:
    """Creates the account and returns the address the app signs in with. The student never
    sees it; it is only how Supabase knows them."""
    domain = settings.student_email_domain
    if not domain:
        raise HTTPException(status_code=503, detail=CLOSED)
    username = clean_username(values.get("username"))
    phone = clean_phone(values.get("phone"))
    password = clean_password(values.get("password"))
    school = clean_school(values.get("school"))

    taken = _taken(db, username, phone)
    if taken:
        raise ContentError(taken, status_code=409)

    email = new_internal_email(domain)
    try:
        user_id = supabase_admin.create_user(
            email,
            password,
            {"name": username},
            {"ea_username": username, "ea_phone": phone, "ea_school": school},
        )
    except supabase_admin.AuthAdminError as error:
        log.warning("register refused by auth: status=%s code=%s", error.status, error.code)
        if error.code == "weak_password":
            raise ContentError("Choose a stronger password")
        # The trigger refuses a username or phone taken a moment ago (the unique indexes).
        db.rollback()
        taken = _taken(db, username, phone)
        if taken:
            raise ContentError(taken, status_code=409)
        raise HTTPException(status_code=503, detail="Couldn't create your account. Please try again.")
    _make_sure_details_saved(db, uuid.UUID(user_id), username, phone, school)
    log.info("action=student_registered resource=%s", user_id)
    return {"login_email": email}


def _make_sure_details_saved(db: Session, user_id: uuid.UUID, username: str, phone: str, school: str) -> None:
    """The account triggers save username, phone and school inside Supabase's transaction.
    This checks that they did, and writes whatever is missing, so sign-up still works if
    Supabase ever changes when it applies app_metadata. If the username or phone was taken
    in the meantime, the new account is removed again and the student is told."""
    db.rollback()  # a fresh read: the account was made by another connection
    profile = db.get(Profile, user_id)
    details = db.get(StudentProfile, user_id)
    if profile is not None and profile.username and profile.phone and details is not None:
        return
    log.warning("register: details missing after create, writing them resource=%s", user_id)
    try:
        with transaction(db):
            if profile is None:
                raise HTTPException(status_code=503, detail="Couldn't create your account. Please try again.")
            profile.username = profile.username or username
            profile.phone = profile.phone or phone
            if details is None:
                db.add(StudentProfile(student_id=user_id, school=school))
            db.flush()
    except IntegrityError:
        _undo_account(user_id)
        raise ContentError(_taken(db, username, phone, except_id=user_id) or USERNAME_TAKEN, status_code=409)
    except HTTPException:
        _undo_account(user_id)
        raise


def _undo_account(user_id: uuid.UUID) -> None:
    try:
        supabase_admin.delete_user(str(user_id))
    except supabase_admin.AuthAdminError as error:
        # Left behind, it is an account nobody can log in to by phone. Logged to clean up.
        log.error("register: could not remove half-made account resource=%s code=%s", user_id, error.code)


def resolve_login(db: Session, identifier) -> dict:
    """{"email"} to sign in with, for a phone number or username.

    An unknown one gets a made-up address of the same shape, so the answer is the same
    "wrong password" either way and nobody can use this to find out who has an account.
    """
    if not isinstance(identifier, str) or not identifier.strip() or len(identifier) > 100:
        raise ContentError("Enter your phone number or username")
    raw = identifier.strip()
    if "@" in raw:
        return {"email": raw}
    if looks_like_phone(raw):
        key, query = normalize_phone(raw), LOGIN_EMAIL_BY_PHONE
    else:
        key, query = raw.lower(), LOGIN_EMAIL_BY_USERNAME
    email = db.execute(query, {"value": key}).scalar() if key else None
    if email:
        return {"email": email}
    secret = settings.login_lookup_secret or settings.supabase_service_role_key or "ea"
    return {"email": stand_in_email(secret, key or raw.lower(), settings.student_email_domain or "example.invalid")}


# ---- the student's own profile ----------------------------------------------------------


def profile_out(profile: Profile, details: Optional[StudentProfile]) -> dict:
    school = details.school if details else None
    return {
        "name": profile.name,
        "username": profile.username,
        "phone": profile.phone,
        "school": school,
        # Older email accounts are asked once for what new accounts give at sign-up.
        "profile_complete": bool(profile.username and profile.phone and school),
    }


def my_profile(db: Session, student_id: uuid.UUID) -> dict:
    profile = db.get(Profile, student_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    return profile_out(profile, db.get(StudentProfile, student_id))


def update_my_profile(db: Session, student_id: uuid.UUID, values: dict) -> dict:
    """Changes only the fields sent. A new attribute later is one more optional field."""
    profile = db.get(Profile, student_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Profile not found")
    changes = {}
    if values.get("username") is not None:
        changes["username"] = clean_username(values["username"])
    if values.get("phone") is not None:
        changes["phone"] = clean_phone(values["phone"])
    school = clean_school(values["school"]) if values.get("school") is not None else None

    taken = _taken(db, changes.get("username"), changes.get("phone"), except_id=student_id)
    if taken:
        raise ContentError(taken, status_code=409)

    try:
        with transaction(db):
            if "username" in changes and changes["username"] != profile.username:
                # A student who signed up by phone is shown by their username, so the name
                # follows it. A name an older account chose stays as it is.
                if profile.name == profile.username:
                    profile.name = changes["username"]
                profile.username = changes["username"]
            if "phone" in changes:
                profile.phone = changes["phone"]
            if school is not None:
                details = db.get(StudentProfile, student_id)
                if details is None:
                    db.add(StudentProfile(student_id=student_id, school=school))
                else:
                    details.school = school
                    details.updated_at = datetime.now(timezone.utc)
            db.flush()
    except IntegrityError:
        # Someone took the username or phone between the check and the save.
        raise ContentError(
            _taken(db, changes.get("username"), changes.get("phone"), except_id=student_id)
            or USERNAME_TAKEN,
            status_code=409,
        )
    log.info("action=profile_updated resource=%s fields=%s", student_id, sorted(values))
    return my_profile(db, student_id)
