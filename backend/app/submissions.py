"""One chapter submission is recorded once.

The app gives every chapter submission an id and sends the same id on every try (a retry
after a lost answer, "Save chapter results" later, a double tap). The id is stored in
client_submission_id on quiz_attempts / practice_attempts, under a unique index per
student, so the same submission can never make two attempts or award XP twice.

The column is deliberately left out of the ORM models: only these two statements touch
it, and only when an app sends an id. Requests without one (older apps) never name it.
"""
import uuid
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session

_TABLES = {"quiz": ("quiz_attempts", "quiz_id"), "practice": ("practice_attempts", "practice_id")}


def find(db: Session, kind: str, student_id: uuid.UUID, ref_id: int, submission_id) -> Optional[int]:
    """Id of the attempt this submission already made, or None."""
    table, ref = _TABLES[kind]
    return db.execute(
        text(
            f"select id from {table} where student_id = :student_id and {ref} = :ref "
            "and client_submission_id = :submission_id"
        ),
        {"student_id": student_id, "ref": ref_id, "submission_id": submission_id},
    ).scalar()


def tag(db: Session, kind: str, attempt_id: int, submission_id) -> None:
    """Stamp a just-flushed attempt with its submission id. A second attempt for the same
    submission fails here on the unique index (IntegrityError), inside the transaction."""
    table, _ = _TABLES[kind]
    db.execute(
        text(f"update {table} set client_submission_id = :submission_id where id = :id"),
        {"submission_id": submission_id, "id": attempt_id},
    )
