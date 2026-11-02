"""Pure rules for Course Studio: no database, so they can be tested without a server."""
from typing import Optional

from app.content_rules import ContentError, clean_text, clean_video_url

ACTIVITY_KINDS = ("video", "quiz", "practice", "reading")
# Video and reading are finished by an explicit Mark Complete. Quiz and practice
# are finished by submitting an attempt, through the existing student routes.
MARK_COMPLETE_KINDS = ("video", "reading")

DRAFT, PUBLISHED, UNPUBLISHED = "draft", "published", "unpublished"
COURSE_STATUSES = (DRAFT, PUBLISHED, UNPUBLISHED)

MAX_READING_LEN = 20000
MAX_ACTIVITY_TITLE_LEN = 200

# Aggregate counts under this many learners are hidden, so a course owner cannot
# pick out an individual student from a small number.
MIN_AGGREGATE = 3

DEFAULT_TITLES = {"video": "Video", "quiz": "Quiz", "practice": "Practice", "reading": "Reading"}


def clean_activity(kind: str, values: dict, creating: bool) -> dict:
    """Validate the type-specific fields of an activity.

    `values` holds only what the client sent. When creating, the fields that
    belong to the kind are required. The fields of the other kinds are refused,
    so a quiz can never carry a video link.
    """
    if kind not in ACTIVITY_KINDS:
        raise ContentError("Kind must be video, quiz, practice or reading")

    cleaned: dict = {}

    if "title" in values:
        title = clean_text(values["title"], "Title", MAX_ACTIVITY_TITLE_LEN, required=not creating)
        if title is not None:
            cleaned["title"] = title
    if creating:
        cleaned.setdefault("title", DEFAULT_TITLES[kind])

    if "is_required" in values and values["is_required"] is not None:
        if not isinstance(values["is_required"], bool):
            raise ContentError("is_required must be true or false")
        cleaned["is_required"] = values["is_required"]
    elif creating:
        cleaned["is_required"] = False  # nothing is required unless the teacher says so

    allowed = {
        "video": {"video_url"},
        "reading": {"reading_body"},
        "quiz": set(),
        "practice": set(),
    }[kind]
    for field in ("video_url", "reading_body"):
        if field in values and values[field] is not None and field not in allowed:
            raise ContentError(f"A {kind} activity cannot have {field.replace('_', ' ')}")

    if kind == "video":
        if "video_url" in values or creating:
            url = clean_video_url(values.get("video_url"))
            if url is None:
                raise ContentError("Video link is required")
            cleaned["video_url"] = url
    if kind == "reading":
        if "reading_body" in values or creating:
            body = clean_text(values.get("reading_body"), "Reading text", MAX_READING_LEN)
            cleaned["reading_body"] = body
    return cleaned


def suppress_small(count: int) -> Optional[int]:
    """Hide counts below MIN_AGGREGATE. Zero is reported as zero: no one to identify."""
    if count == 0 or count >= MIN_AGGREGATE:
        return count
    return None


def next_status(current: str, action: str) -> str:
    """publish: draft/unpublished -> published. unpublish: published -> unpublished."""
    if action == "publish":
        if current == PUBLISHED:
            raise ContentError("This course is already published", status_code=409)
        return PUBLISHED
    if action == "unpublish":
        if current != PUBLISHED:
            raise ContentError("Only a published course can be unpublished", status_code=409)
        return UNPUBLISHED
    raise ValueError(action)
