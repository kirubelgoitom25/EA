"""Pure rules for student accounts: no database and no network, so they test alone.

Students sign up with a username, an Ethiopian phone number, a password and their school.
Supabase still needs an email for every account, so each student gets a hidden internal
address (s.<random>@<STUDENT_EMAIL_DOMAIN>) that they never see and that never receives
mail. Logging in by phone or username goes through resolve-login, which turns either into
that address.
"""
import hashlib
import hmac
import re
import secrets
from typing import Optional

from app.content_rules import ContentError

USERNAME_MIN, USERNAME_MAX = 3, 20
USERNAME_RE = re.compile(r"^[a-z0-9_]{3,20}$")
# Names that would look official on a leaderboard or in a payment review.
RESERVED_USERNAMES = frozenset(
    {"admin", "administrator", "ea", "eaadmin", "support", "help", "teacher", "staff",
     "moderator", "system", "root", "official", "student", "null", "undefined"}
)

# Supabase hashes passwords with bcrypt, which reads at most 72 bytes.
PASSWORD_MIN, PASSWORD_MAX_BYTES = 8, 72
SCHOOL_MIN, SCHOOL_MAX = 2, 120

# +251 then 9 (Ethio telecom) or 7 (Safaricom), then 8 digits.
PHONE_RE = re.compile(r"^\+251[79]\d{8}$")
_SEPARATORS = re.compile(r"[\s\-().]")

PHONE_HELP = "Enter an Ethiopian phone number, like 0911 234 567."


def clean_username(value) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ContentError("Choose a username")
    name = value.strip().lower()
    if len(name) < USERNAME_MIN or len(name) > USERNAME_MAX:
        raise ContentError(f"Usernames are {USERNAME_MIN} to {USERNAME_MAX} characters")
    if not USERNAME_RE.match(name):
        raise ContentError("Use only letters, numbers and _ in your username")
    if name in RESERVED_USERNAMES:
        raise ContentError("That username isn't available")
    return name


def normalize_phone(value) -> Optional[str]:
    """+2519XXXXXXXX from the ways people write it (0911..., 911..., 251911..., +251 911...),
    or None when it is not an Ethiopian mobile number."""
    if not isinstance(value, str):
        return None
    digits = _SEPARATORS.sub("", value.strip())
    if digits.startswith("+"):
        digits = digits[1:]
        if not digits.startswith("251"):
            return None
    if not digits.isdigit():
        return None
    if digits.startswith("251"):
        digits = digits[3:]
    elif digits.startswith("0"):
        digits = digits[1:]
    phone = "+251" + digits
    return phone if PHONE_RE.match(phone) else None


def clean_phone(value) -> str:
    phone = normalize_phone(value)
    if phone is None:
        raise ContentError(PHONE_HELP)
    return phone


def clean_password(value) -> str:
    if not isinstance(value, str) or len(value) < PASSWORD_MIN:
        raise ContentError(f"Use at least {PASSWORD_MIN} characters for your password")
    if len(value.encode("utf-8")) > PASSWORD_MAX_BYTES:
        raise ContentError("That password is too long")
    if "\x00" in value:
        raise ContentError("Your password contains an invalid character")
    return value


def clean_school(value) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ContentError("Enter your school or university")
    school = " ".join(value.split())
    if len(school) < SCHOOL_MIN:
        raise ContentError("Enter your school or university")
    if len(school) > SCHOOL_MAX:
        raise ContentError(f"School name can be at most {SCHOOL_MAX} characters")
    if "\x00" in school:
        raise ContentError("School name contains an invalid character")
    return school


def looks_like_phone(identifier: str) -> bool:
    stripped = _SEPARATORS.sub("", identifier.strip()).lstrip("+")
    return stripped.isdigit()


def new_internal_email(domain: str) -> str:
    return f"s.{secrets.token_hex(8)}@{domain}"


def stand_in_email(secret: str, identifier: str, domain: str) -> str:
    """The same made-up address every time for an unknown phone or username. It has the
    same shape as a real one, so the answer never shows whether an account exists."""
    digest = hmac.new(secret.encode(), identifier.encode(), hashlib.sha256).hexdigest()
    return f"s.{digest[:16]}@{domain}"


def is_internal_email(email: Optional[str], domain: str) -> bool:
    return bool(email and domain and email.lower().endswith("@" + domain.lower()))


def visible_email(email: Optional[str], domain: str) -> Optional[str]:
    """What staff may see: a real email, never an internal one."""
    return None if is_internal_email(email, domain) else email
