"""Shared limits and validation for teacher-managed content.

Pure logic: no database, so it can be tested without a server.
"""
import re
import secrets
from typing import Optional
from urllib.parse import parse_qs, urlparse

from fastapi import HTTPException

MAX_QUIZ_QUESTIONS = 30
MAX_PRACTICE_ITEMS = 30
MIN_OPTIONS = 2
MAX_OPTIONS = 6  # a to f
MAX_QUESTION_LEN = 1000
MAX_OPTION_LEN = 200
MAX_EXPLANATION_LEN = 2000
MAX_SENTENCE_LEN = 500
MAX_ANSWER_LEN = 200
MAX_TITLE_LEN = 200
MAX_DESCRIPTION_LEN = 2000
MAX_PASTE_LEN = 60000
MAX_VIDEO_URL_LEN = 300

LETTERS = "abcdef"

PRACTICE_TYPES = ("choose", "fill")

YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}
YOUTUBE_ID = re.compile(r"^[A-Za-z0-9_-]{11}$")
DURATION = re.compile(r"^\d{1,2}:\d{2}(:\d{2})?$")


class ContentError(HTTPException):
    """A rule was broken. Carries a plain message the teacher can read."""

    def __init__(self, message: str, status_code: int = 422):
        super().__init__(status_code=status_code, detail=message)


def clean_text(
    value,
    label: str,
    max_len: int,
    required: bool = True,
) -> Optional[str]:
    """Strip a text field and enforce the shared text rules."""
    if value is None:
        if required:
            raise ContentError(f"{label} is required")
        return None
    if not isinstance(value, str):
        raise ContentError(f"{label} must be text")
    if "\x00" in value:
        raise ContentError(f"{label} contains an invalid character")
    value = value.strip()
    if not value:
        if required:
            raise ContentError(f"{label} is required")
        return None
    if len(value) > max_len:
        raise ContentError(f"{label} is too long (at most {max_len} characters)")
    return value


def clean_options(options) -> list[str]:
    if not isinstance(options, list):
        raise ContentError("Options must be a list")
    if len(options) < MIN_OPTIONS:
        raise ContentError(f"At least {MIN_OPTIONS} options are needed")
    if len(options) > MAX_OPTIONS:
        raise ContentError(f"At most {MAX_OPTIONS} options are allowed")

    cleaned: list[str] = []
    seen: dict[str, int] = {}
    for position, raw in enumerate(options):
        label = f"Option {LETTERS[position]}"
        option = clean_text(raw, label, MAX_OPTION_LEN)
        key = option.casefold()
        if key in seen:
            raise ContentError(
                f"Option {LETTERS[position]} is a duplicate of option {LETTERS[seen[key]]}"
            )
        seen[key] = position
        cleaned.append(option)
    return cleaned


def check_correct_index(correct_index, option_count: int) -> int:
    # bool is a subclass of int in Python, so it needs its own check.
    if isinstance(correct_index, bool) or not isinstance(correct_index, int):
        raise ContentError("The correct answer must be a number")
    if not 0 <= correct_index < option_count:
        raise ContentError("The correct answer does not match any option")
    return correct_index


def clean_quiz_question(question, options, correct_index, explanation) -> dict:
    cleaned_options = clean_options(options)
    return {
        "question": clean_text(question, "Question", MAX_QUESTION_LEN),
        "options": cleaned_options,
        "correct_index": check_correct_index(correct_index, len(cleaned_options)),
        "explanation": clean_text(
            explanation, "Explanation", MAX_EXPLANATION_LEN, required=False
        ),
    }


def clean_practice_item(
    item_type, question, sentence, options, correct_index, answer, explanation
) -> dict:
    if item_type not in PRACTICE_TYPES:
        raise ContentError("Type must be 'choose' or 'fill'")

    cleaned = {
        "type": item_type,
        "question": clean_text(question, "Question", MAX_QUESTION_LEN),
        "sentence": clean_text(
            sentence, "Sentence", MAX_SENTENCE_LEN, required=False
        ),
        "explanation": clean_text(
            explanation, "Explanation", MAX_EXPLANATION_LEN, required=False
        ),
    }

    if item_type == "choose":
        if answer is not None:
            raise ContentError("A 'choose' item must not have a typed answer")
        cleaned_options = clean_options(options)
        cleaned["options"] = cleaned_options
        cleaned["correct_index"] = check_correct_index(
            correct_index, len(cleaned_options)
        )
        cleaned["answer"] = None
    else:
        if options is not None or correct_index is not None:
            raise ContentError("A 'fill' item must not have options or a correct option")
        cleaned["options"] = None
        cleaned["correct_index"] = None
        cleaned["answer"] = clean_text(answer, "Answer", MAX_ANSWER_LEN)
    return cleaned


def clean_title(value, label: str = "Title") -> str:
    return clean_text(value, label, MAX_TITLE_LEN)


def clean_description(value) -> str:
    return clean_text(value, "Description", MAX_DESCRIPTION_LEN)


def clean_duration(value) -> Optional[str]:
    value = clean_text(value, "Duration", 20, required=False)
    if value is not None and not DURATION.match(value):
        raise ContentError("Duration must look like 5:30 or 1:05:30")
    return value


def clean_video_url(value) -> Optional[str]:
    """Only links the student app can play: watch?v=, youtu.be/ and embed/."""
    value = clean_text(value, "Video link", MAX_VIDEO_URL_LEN, required=False)
    if value is None:
        return None

    bad = ContentError("Video link must be a YouTube link starting with https://")
    parsed = urlparse(value)
    if parsed.scheme != "https" or parsed.hostname not in YOUTUBE_HOSTS:
        raise bad

    if parsed.hostname == "youtu.be":
        video_id = parsed.path.lstrip("/")
    elif parsed.path == "/watch":
        video_id = (parse_qs(parsed.query).get("v") or [""])[0]
    elif parsed.path.startswith("/embed/"):
        video_id = parsed.path[len("/embed/"):]
    else:
        raise bad

    if not YOUTUBE_ID.match(video_id):
        raise bad
    return value


def make_id(title: str, fallback: str) -> str:
    """A readable, unique id like 'intro-to-physics-3f9a1c'.

    The slug is ASCII only, so a title written in Amharic gives the fallback
    word ('course', 'module' or 'lesson') plus the random part.
    """
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:30].strip("-")
    return f"{slug or fallback}-{secrets.token_hex(3)}"
