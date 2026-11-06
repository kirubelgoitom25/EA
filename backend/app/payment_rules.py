"""Pure rules for selling courses: no database, so they can be tested without a server."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional

from app.content_rules import ContentError, clean_text

# What a student's relationship to a course can be. The first three open the content.
FREE, CLASS, ACTIVE = "free", "class", "active"
EXPIRED, REVOKED, LOCKED = "expired", "revoked", "locked"
OPEN_STATES = (FREE, CLASS, ACTIVE)

PENDING, APPROVED, REJECTED = "pending", "approved", "rejected"

SOURCE_PAYMENT, SOURCE_EXISTING, SOURCE_ADMIN = "payment", "existing_learner", "admin"

MAX_PRICE = Decimal("1000000")
MAX_ACCESS_DAYS = 36500
MAX_INSTRUCTIONS_LEN = 2000
MAX_NOTE_LEN = 500

MAX_PROOF_BYTES = 5 * 1024 * 1024
# A student can keep submitting, but no more than this many may wait undecided on one
# course. It clears the moment a teacher decides, so it never blocks anyone for long.
MAX_PENDING_PER_COURSE = 5


def aware(value: Optional[datetime]) -> Optional[datetime]:
    """Postgres returns aware datetimes. SQLite, used by the tests, returns naive UTC."""
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def access_state(
    price,
    in_class: bool,
    expires_at: Optional[datetime],
    revoked_at: Optional[datetime],
    has_row: bool,
    now: datetime,
) -> str:
    """Why a student can or cannot open a course. Free and class access need no row."""
    if not price:
        return FREE
    if in_class:
        return CLASS
    if not has_row:
        return LOCKED
    if revoked_at is not None:
        return REVOKED
    if expires_at is None or aware(expires_at) > now:
        return ACTIVE
    return EXPIRED


def next_expiry(
    has_row: bool,
    expires_at: Optional[datetime],
    revoked_at: Optional[datetime],
    access_days: Optional[int],
    now: datetime,
) -> Optional[datetime]:
    """When access ends after another grant. None means permanent.

    Time is added to access that is still running, and counts from now otherwise, so
    slow review costs the student nothing. Nothing ever shortens permanent access.
    """
    running = has_row and revoked_at is None
    if access_days is None or (running and expires_at is None):
        return None
    current = aware(expires_at) if running else None
    start = current if current is not None and current > now else now
    return start + timedelta(days=access_days)


def clean_price(value) -> Decimal:
    try:
        price = Decimal(str(value))
    except (InvalidOperation, ValueError):
        raise ContentError("Price must be a number")
    if not price.is_finite() or price < 0:
        raise ContentError("Price cannot be negative")
    if price > MAX_PRICE:
        raise ContentError(f"Price cannot be more than {MAX_PRICE}")
    if price != price.quantize(Decimal("0.01")):
        raise ContentError("Price can have at most 2 decimal places")
    return price.quantize(Decimal("0.01"))


def clean_access_days(value) -> Optional[int]:
    """None means permanent."""
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int):
        raise ContentError("Access duration must be a whole number of days")
    if value < 1 or value > MAX_ACCESS_DAYS:
        raise ContentError(f"Access duration must be between 1 and {MAX_ACCESS_DAYS} days")
    return value


def clean_instructions(value) -> Optional[str]:
    return clean_text(value, "Payment instructions", MAX_INSTRUCTIONS_LEN, required=False)


def clean_note(value) -> Optional[str]:
    """A rejection reason is optional."""
    return clean_text(value, "Note", MAX_NOTE_LEN, required=False)


def sniff_image(data: bytes) -> Optional[tuple[str, str]]:
    """(media type, file extension) from the file's own first bytes, or None.

    The name and type a client claims are never trusted.
    """
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", "jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", "png"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp", "webp"
    return None
