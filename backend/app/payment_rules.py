"""Pure rules for selling courses: no database, so they can be tested without a server."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Optional

from app.content_rules import ContentError, clean_text

# What a student's relationship to a course can be. OPEN_STATES open the content.
FREE, CLASS, ACTIVE, PRO = "free", "class", "active", "pro"
EXPIRED, REVOKED, LOCKED, PRO_LOCKED = "expired", "revoked", "locked", "pro_locked"
OPEN_STATES = (FREE, CLASS, ACTIVE, PRO)

# How a course is offered. Only a paid course has a price.
TIER_FREE, TIER_PAID, TIER_PRO = "free", "paid", "pro"
TIERS = (TIER_FREE, TIER_PAID, TIER_PRO)


def opens_with_pro(tier: str, pro_included: bool) -> bool:
    """Whether an active Pro membership opens this course."""
    return tier == TIER_PRO or (tier == TIER_PAID and bool(pro_included))


def is_stricter(old_tier: str, old_pro: bool, new_tier: str, new_pro: bool) -> bool:
    """A change that closes the course to someone who could open it before, so students
    who already started it keep it (see studio_service._keep_existing_learners).

    Purchases (course_access) open every option, so buyers never lose out. What can be
    lost is "everyone" (leaving free) and "Pro members" (Pro no longer opening it).
    """
    if old_tier == TIER_FREE:
        return new_tier != TIER_FREE
    return opens_with_pro(old_tier, old_pro) and not opens_with_pro(new_tier, new_pro) and new_tier != TIER_FREE

MEMBERSHIP_PRO = "pro"

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


def tier_of(price, tier: Optional[str] = None) -> str:
    """The course's access option. Without one (older callers), the price decides."""
    if tier in TIERS:
        return tier
    return TIER_PAID if price else TIER_FREE


def grant_running(expires_at: Optional[datetime], revoked_at: Optional[datetime], now: datetime) -> bool:
    """A course_access or membership row that still counts right now."""
    return revoked_at is None and (expires_at is None or aware(expires_at) > now)


def access_state(
    price,
    in_class: bool,
    expires_at: Optional[datetime],
    revoked_at: Optional[datetime],
    has_row: bool,
    now: datetime,
    tier: Optional[str] = None,
    pro_active: bool = False,
    pro_included: bool = False,
) -> str:
    """Why a student can or cannot open a course. Free and class access need no row.

    The course_access row (expires_at, revoked_at, has_row) always comes first, and Pro
    only ever adds a way in:
      * a paid course ignores Pro, unless its owner included it in Pro (pro_included);
        then a running purchase still reads as ACTIVE, and Pro opens it for everyone else;
      * a pro course opens through a running course_access row first (bought before it
        became Pro, kept as an existing learner, or given by the admin), then through Pro.
    Pro ending falls back to the purchase; it never removes it.
    """
    tier = tier_of(price, tier)
    if tier == TIER_FREE:
        return FREE
    if in_class:
        return CLASS
    running = has_row and grant_running(expires_at, revoked_at, now)
    if tier == TIER_PRO:
        if running:
            return ACTIVE
        return PRO if pro_active else PRO_LOCKED
    if running:
        return ACTIVE
    if pro_included and pro_active:
        return PRO
    if not has_row:
        return LOCKED
    if revoked_at is not None:
        return REVOKED
    if expires_at is None or aware(expires_at) > now:
        return ACTIVE
    return EXPIRED


def membership_state(has_row: bool, expires_at: Optional[datetime], revoked_at: Optional[datetime], now: datetime) -> str:
    """none, active, expired or revoked: a Pro membership on its own."""
    if not has_row:
        return "none"
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


def clean_tier(value) -> str:
    if value not in TIERS:
        raise ContentError("Choose free, paid or pro")
    return value


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
