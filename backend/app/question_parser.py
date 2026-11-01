"""Turns pasted text into quiz questions or practice items.

Pure logic: it never touches the database, so it can be tested on its own.
Nothing here saves anything; the teacher sees a preview first.
"""
import re

from app.content_rules import (
    LETTERS,
    MAX_OPTIONS,
    MAX_PASTE_LEN,
    MAX_PRACTICE_ITEMS,
    MAX_QUIZ_QUESTIONS,
    MIN_OPTIONS,
    ContentError,
    clean_practice_item,
    clean_quiz_question,
)

QUESTION_START = re.compile(r"^\s*(?:Q\s*)?(\d+)\s*[.):]\s*(.+)$", re.IGNORECASE)
OPTION = re.compile(r"^\s*([A-Za-z])\s*[.)]\s*(.+)$")
ANSWER = re.compile(r"^\s*(?:answer|ans|correct)\s*[:=\-]\s*(.*)$", re.IGNORECASE)
ANSWER_LETTER = re.compile(r"^([A-Fa-f])\s*[.)]?\s*$")
EXPLANATION = re.compile(r"^\s*(?:explanation|why|reason)\s*[:=\-]\s*(.*)$", re.IGNORECASE)
SENTENCE = re.compile(r"^\s*sentence\s*[:=\-]\s*(.*)$", re.IGNORECASE)

# Where the reader is inside a block.
QUESTION, OPTIONS, EXPLANATION_STATE, DONE = "question", "options", "explanation", "done"


def _new_block(number: int, position: int, first_line: str) -> dict:
    return {
        "number": number,
        "position": position,
        "question": [first_line],
        "sentence": None,
        "options": [],  # list of [letter, text]
        "answer": None,
        "answer_count": 0,
        "explanation": None,
        "state": QUESTION,
        "problems": [],
    }


def _label(block: dict) -> str:
    text = f"Question {block['number']}"
    if block["number"] != block["position"]:
        text += f" (block {block['position']})"
    return text


def _split_blocks(text: str, allow_sentence: bool):
    """Group the lines into blocks. Returns (blocks, errors)."""
    blocks: list[dict] = []
    errors: list[dict] = []
    stray_reported = False
    current = None

    for raw in text.splitlines():
        line = raw.strip()

        if not line:
            # A blank line ends an explanation; otherwise blanks are ignored.
            if current and current["state"] == EXPLANATION_STATE:
                current["state"] = DONE
            continue

        start = QUESTION_START.match(raw)
        if start:
            current = _new_block(int(start.group(1)), len(blocks) + 1, start.group(2).strip())
            blocks.append(current)
            continue

        if current is None:
            if not stray_reported:
                errors.append({"number": 0, "message": "Text found before question 1"})
                stray_reported = True
            continue

        answer = ANSWER.match(raw)
        if answer:
            current["answer_count"] += 1
            if current["answer"] is None:
                current["answer"] = answer.group(1).strip()
            current["state"] = DONE
            continue

        explanation = EXPLANATION.match(raw)
        if explanation:
            current["explanation"] = [explanation.group(1).strip()]
            current["state"] = EXPLANATION_STATE
            continue

        sentence = SENTENCE.match(raw) if allow_sentence else None
        if sentence and current["state"] in (QUESTION, DONE):
            current["sentence"] = sentence.group(1).strip()
            continue

        option = OPTION.match(raw)
        if option and current["state"] in (QUESTION, OPTIONS):
            letter = option.group(1)
            # Before the first option only a to f count, so a question line
            # that happens to start with "I." is not taken for an option.
            if current["state"] == OPTIONS or letter.lower() in LETTERS:
                current["options"].append([letter, option.group(2).strip()])
                current["state"] = OPTIONS
                continue

        # Anything else continues the part we are in.
        if current["state"] == QUESTION:
            current["question"].append(line)
        elif current["state"] == OPTIONS:
            current["options"][-1][1] += " " + line
        elif current["state"] == EXPLANATION_STATE:
            current["explanation"].append(line)
        else:
            current["problems"].append("unexpected text here (a new question must start with a number)")

    return blocks, errors


def _check_options(block: dict) -> list[str]:
    """Problems with the option letters of one block."""
    options = block["options"]
    if not options:
        return ["no options found"]
    if len(options) < MIN_OPTIONS:
        return [f"only {len(options)} option, at least {MIN_OPTIONS} are needed"]
    if len(options) > MAX_OPTIONS:
        return [f"more than {MAX_OPTIONS} options"]

    letters = [o[0].lower() for o in options]
    expected = list(LETTERS[: len(letters)])
    if letters != expected:
        return [
            f"options must go a, b, c in order (found {', '.join(letters)})"
        ]
    return []


def _build_block(block: dict, mode: str) -> tuple[dict | None, str | None]:
    """Validate one block. Returns (result, None) or (None, message)."""
    label = _label(block)
    if block["problems"]:
        return None, f"{label}: {block['problems'][0]}"
    if block["answer_count"] > 1:
        return None, f"{label}: more than one 'Answer:' line"

    question = " ".join(block["question"])
    explanation = " ".join(block["explanation"]) if block["explanation"] else None
    raw_answer = block["answer"]
    has_options = bool(block["options"])

    try:
        if mode == "practice" and not has_options:
            # A fill item: the answer is free text.
            if raw_answer is None:
                return None, f"{label}: missing 'Answer:' line"
            cleaned = clean_practice_item(
                "fill", question, block["sentence"], None, None, raw_answer, explanation
            )
            return {"number": block["number"], **cleaned}, None

        problems = _check_options(block)
        if problems:
            return None, f"{label}: {problems[0]}"

        options = [o[1] for o in block["options"]]
        if raw_answer is None or raw_answer == "":
            return None, f"{label}: missing 'Answer:' line"
        match = ANSWER_LETTER.match(raw_answer)
        if not match:
            return None, f"{label}: answer '{raw_answer[:20]}' is not a letter from a to f"
        index = LETTERS.index(match.group(1).lower())
        if index >= len(options):
            return None, (
                f"{label}: answer '{match.group(1).lower()}' is not one of "
                f"the {len(options)} options"
            )

        if mode == "practice":
            cleaned = clean_practice_item(
                "choose", question, block["sentence"], options, index, None, explanation
            )
            return {"number": block["number"], **cleaned}, None

        cleaned = clean_quiz_question(question, options, index, explanation)
        return {"number": block["number"], **cleaned}, None
    except ContentError as error:
        return None, f"{label}: {error.detail}"


def _parse(text: str, mode: str, max_blocks: int) -> dict:
    if not isinstance(text, str) or not text.strip():
        return {"items": [], "errors": [{"number": 0, "message": "Nothing to read. Paste your questions first."}]}
    if "\x00" in text:
        return {"items": [], "errors": [{"number": 0, "message": "The text contains an invalid character"}]}
    if len(text) > MAX_PASTE_LEN:
        return {"items": [], "errors": [{"number": 0, "message": f"The text is too long (at most {MAX_PASTE_LEN} characters)"}]}

    blocks, errors = _split_blocks(text, allow_sentence=(mode == "practice"))
    if not blocks and not errors:
        errors.append({"number": 0, "message": "No questions found. Start each one with a number, like '1.'"})
    if len(blocks) > max_blocks:
        errors.append({"number": 0, "message": f"Too many questions: {len(blocks)} found, at most {max_blocks} are allowed"})
        return {"items": [], "errors": errors}

    items = []
    for block in blocks:
        item, message = _build_block(block, mode)
        if message:
            errors.append({"number": block["number"], "message": message})
        else:
            items.append(item)
    return {"items": items, "errors": errors}


def parse_quiz(text: str) -> dict:
    """Returns {'questions': [...], 'errors': [...]}."""
    result = _parse(text, "quiz", MAX_QUIZ_QUESTIONS)
    return {"questions": result["items"], "errors": result["errors"]}


def parse_practice(text: str) -> dict:
    """Returns {'items': [...], 'errors': [...]}."""
    return _parse(text, "practice", MAX_PRACTICE_ITEMS)
