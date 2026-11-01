"""Plain-Python tests for the paste parser and the content rules.

Run from the repo root with the backend virtualenv:
    backend/.venv/Scripts/python -I backend/tests/test_question_parser.py   (Windows)
    backend/.venv/bin/python -I backend/tests/test_question_parser.py       (Mac)
No server and no database are used.
"""
import os
import sys

# -I removes the script folder from the import path, so add backend/ by hand.
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from app.content_rules import (  # noqa: E402
    MAX_PASTE_LEN,
    ContentError,
    clean_quiz_question,
    clean_video_url,
    make_id,
)
from app.question_parser import parse_practice, parse_quiz  # noqa: E402

TWO_QUESTIONS = """1. What is 2+2?
a. 3
b. 4
c) 5
Answer: b
Explanation: Add the two numbers.

2. Capital of Ethiopia?
A) Addis Ababa
B) Nairobi
Answer: A
"""


def messages(result):
    return [e["message"] for e in result["errors"]]


def test_two_valid_questions():
    r = parse_quiz(TWO_QUESTIONS)
    assert r["errors"] == [], r["errors"]
    q1, q2 = r["questions"]
    assert q1["question"] == "What is 2+2?"
    assert q1["options"] == ["3", "4", "5"]
    assert q1["correct_index"] == 1
    assert q1["explanation"] == "Add the two numbers."
    assert q2["options"] == ["Addis Ababa", "Nairobi"]
    assert q2["correct_index"] == 0
    assert q2["explanation"] is None


def test_uppercase_letters():
    r = parse_quiz("1. Pick\nA. one\nB. two\nAnswer: B\n")
    assert r["errors"] == [] and r["questions"][0]["correct_index"] == 1


def test_missing_answer():
    r = parse_quiz("1. Pick\na. one\nb. two\n")
    assert messages(r) == ["Question 1: missing 'Answer:' line"], messages(r)


def test_answer_outside_options():
    r = parse_quiz("1. Pick\na. one\nb. two\nc. three\nd. four\nAnswer: e\n")
    assert messages(r) == ["Question 1: answer 'e' is not one of the 4 options"], messages(r)


def test_skipped_letter():
    r = parse_quiz("1. Pick\na. one\nc. three\nAnswer: a\n")
    assert messages(r) == ["Question 1: options must go a, b, c in order (found a, c)"], messages(r)


def test_one_option():
    r = parse_quiz("1. Pick\na. one\nAnswer: a\n")
    assert messages(r) == ["Question 1: only 1 option, at least 2 are needed"], messages(r)


def test_no_options():
    r = parse_quiz("1. Pick\nAnswer: a\n")
    assert messages(r) == ["Question 1: no options found"], messages(r)


def test_seven_options():
    text = "1. Pick\n" + "".join(f"{c}. opt {c}\n" for c in "abcdefg") + "Answer: a\n"
    r = parse_quiz(text)
    assert messages(r) == ["Question 1: more than 6 options"], messages(r)


def test_duplicate_options():
    r = parse_quiz("1. Pick\na. Same\nb. same\nAnswer: a\n")
    assert messages(r) == ["Question 1: Option b is a duplicate of option a"], messages(r)


def test_multiline_question_and_option():
    text = "1. A long question\nthat goes on\na. first part\nof the first option\nb. second\nAnswer: a\n"
    r = parse_quiz(text)
    q = r["questions"][0]
    assert r["errors"] == []
    assert q["question"] == "A long question that goes on"
    assert q["options"] == ["first part of the first option", "second"]


def test_windows_line_endings():
    r = parse_quiz(TWO_QUESTIONS.replace("\n", "\r\n"))
    assert r["errors"] == [] and len(r["questions"]) == 2


def test_amharic_round_trip():
    text = "1. የኢትዮጵያ ዋና ከተማ ማናት?\na. አዲስ አበባ\nb. ናይሮቢ\nAnswer: a\nExplanation: አዲስ አበባ ዋና ከተማ ናት።\n"
    r = parse_quiz(text)
    assert r["errors"] == [], r["errors"]
    q = r["questions"][0]
    assert q["question"] == "የኢትዮጵያ ዋና ከተማ ማናት?"
    assert q["options"] == ["አዲስ አበባ", "ናይሮቢ"]
    assert q["explanation"] == "አዲስ አበባ ዋና ከተማ ናት።"


def test_empty_inputs():
    for text in ["", "   \n\n  ", "Answer: a"]:
        r = parse_quiz(text)
        assert r["questions"] == [] and r["errors"], text
    r = parse_quiz("Answer: a")
    assert messages(r) == ["Text found before question 1"] or "Text found" in messages(r)[0]


def test_too_many_blocks_and_too_long():
    block = "{n}. Q\na. x\nb. y\nAnswer: a\n\n"
    text = "".join(block.format(n=n) for n in range(1, 32))
    r = parse_quiz(text)
    assert r["questions"] == [] and "Too many questions" in messages(r)[0]
    r = parse_quiz("1. " + "x" * MAX_PASTE_LEN)
    assert r["questions"] == [] and "too long" in messages(r)[0]


def test_nul_character():
    r = parse_quiz("1. Pick\x00\na. one\nb. two\nAnswer: a\n")
    assert r["questions"] == [] and "invalid character" in messages(r)[0]


def test_explanation_stops_at_blank_line():
    text = "1. Pick\na. one\nb. two\nAnswer: a\nExplanation: line one\nline two\n\n2. Next\na. x\nb. y\nAnswer: b\n"
    r = parse_quiz(text)
    assert r["errors"] == [], r["errors"]
    assert r["questions"][0]["explanation"] == "line one line two"
    assert len(r["questions"]) == 2


def test_blank_lines_at_start_and_end():
    r = parse_quiz("\n\n\n" + TWO_QUESTIONS + "\n\n\n")
    assert r["errors"] == [] and len(r["questions"]) == 2


def test_text_before_first_question():
    r = parse_quiz("Hello teacher\n" + TWO_QUESTIONS)
    assert messages(r) == ["Text found before question 1"], messages(r)


def test_block_position_shown_when_numbers_skip():
    r = parse_quiz("1. A\na. x\nb. y\nAnswer: a\n\n5. B\na. x\n")
    assert "(block 2)" in messages(r)[0], messages(r)


def test_practice_choose_and_fill():
    text = """1. Pick the correct form
Sentence: If she ___ more, she would pass.
a. studies
b. studied
c. will study
Answer: b
Explanation: Second conditional uses past simple.

2. Complete the sentence
Sentence: If I ___ (have) time, I would help.
Answer: had
"""
    r = parse_practice(text)
    assert r["errors"] == [], r["errors"]
    choose, fill = r["items"]
    assert choose["type"] == "choose" and choose["correct_index"] == 1
    assert choose["answer"] is None and choose["sentence"].startswith("If she")
    assert fill["type"] == "fill" and fill["answer"] == "had"
    assert fill["options"] is None and fill["correct_index"] is None


def test_rules_reject_bad_values():
    good = dict(question="Q", options=["a", "b"], correct_index=0, explanation=None)
    assert clean_quiz_question(**good)["correct_index"] == 0
    for change in [
        {"options": ["a"]},
        {"options": ["a"] * 2},
        {"options": ["a", ""]},
        {"options": list("abcdefg")},
        {"correct_index": 2},
        {"correct_index": True},
        {"correct_index": "0"},
        {"question": "   "},
        {"question": "x\x00y"},
        {"question": "x" * 1001},
    ]:
        try:
            clean_quiz_question(**{**good, **change})
        except ContentError:
            continue
        raise AssertionError(f"accepted bad value: {change}")


def test_sql_and_html_text_is_kept_literally():
    text = "'; drop table quizzes; --"
    q = clean_quiz_question(f"<script>alert(1)</script> {text}", ["a", "b"], 0, None)
    assert q["question"] == f"<script>alert(1)</script> {text}"


def test_video_links():
    ok = [
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://youtu.be/dQw4w9WgXcQ",
        "https://www.youtube.com/embed/dQw4w9WgXcQ",
    ]
    for url in ok:
        assert clean_video_url(url) == url
    assert clean_video_url(None) is None and clean_video_url("  ") is None
    for url in [
        "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
        "https://example.com/watch?v=dQw4w9WgXcQ",
        "javascript:alert(1)",
        "https://www.youtube.com/watch?v=short",
        "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ",
    ]:
        try:
            clean_video_url(url)
        except ContentError:
            continue
        raise AssertionError(f"accepted bad link: {url}")


def test_make_id():
    assert make_id("Intro to Physics!", "course").startswith("intro-to-physics-")
    assert make_id("መግቢያ", "course").startswith("course-")
    assert len(make_id("x" * 100, "lesson")) <= 30 + 7


if __name__ == "__main__":
    tests = [(n, f) for n, f in sorted(globals().items()) if n.startswith("test_")]
    failed = 0
    for name, fn in tests:
        try:
            fn()
            print(f"PASS  {name}")
        except Exception as error:  # noqa: BLE001
            failed += 1
            print(f"FAIL  {name}: {error!r}")
    print(f"\n{len(tests) - failed} passed, {failed} failed")
    sys.exit(1 if failed else 0)
