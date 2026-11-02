"""Needs-attention rules. Run: .venv/bin/python -I backend/tests/test_attention.py"""
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from app.attention import attention_flags  # noqa: E402

NOW = datetime(2026, 11, 2, tzinfo=timezone.utc)


def codes(last, rows):
    return [f["code"] for f in attention_flags(last, rows, NOW)]


class AttentionTests(unittest.TestCase):
    def test_never_active(self):
        self.assertEqual(codes(None, []), ["never_active"])

    def test_inactive_boundary(self):
        self.assertEqual(codes(NOW - timedelta(days=6, hours=23), []), [])
        self.assertEqual(codes(NOW - timedelta(days=7), []), ["inactive"])

    def test_low_across_two_quizzes(self):
        rows = [{"attempts": 1, "best": 0.5, "latest": 0.5}, {"attempts": 1, "best": 0.2, "latest": 0.2}]
        self.assertEqual(codes(NOW, rows), ["low_quizzes"])
        self.assertEqual(codes(NOW, rows[:1]), [])

    def test_recovered_quiz_not_counted(self):
        rows = [{"attempts": 2, "best": 0.9, "latest": 0.9}, {"attempts": 1, "best": 0.2, "latest": 0.2}]
        self.assertEqual(codes(NOW, rows), [])

    def test_repeated_attempts_still_low(self):
        self.assertEqual(codes(NOW, [{"attempts": 3, "best": 0.6, "latest": 0.5}]), ["repeated_low"])
        self.assertEqual(codes(NOW, [{"attempts": 2, "best": 0.6, "latest": 0.5}]), [])
        self.assertEqual(codes(NOW, [{"attempts": 4, "best": 0.9, "latest": 0.5}]), [])


if __name__ == "__main__":
    unittest.main()
