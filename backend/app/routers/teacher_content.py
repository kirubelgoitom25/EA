import uuid

from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app import content_access, content_service
from app.content_schemas import (
    OrderIn,
    PasteIn,
    PracticeBulkIn,
    PracticeItemCreateIn,
    PracticeItemIn,
    PracticeItemOut,
    PracticeOrderIn,
    PracticeParseOut,
    PracticeTitleIn,
    QuizBulkIn,
    QuizParseOut,
    QuizQuestionIn,
    QuizQuestionOut,
    TeacherPracticeOut,
    TeacherQuizOut,
)
from app.database import get_db
from app.deps import require_teacher
from app.question_parser import parse_practice, parse_quiz

router = APIRouter(prefix="/teacher", tags=["teacher-content"])


def _teacher_id(current_user: dict) -> uuid.UUID:
    return uuid.UUID(current_user["id"])


# ---- quiz ------------------------------------------------------------------


@router.get("/lessons/{lesson_id}/quiz", response_model=TeacherQuizOut)
def get_quiz(
    lesson_id: str,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return content_service.get_quiz(db, _teacher_id(current_user), lesson_id)


@router.post(
    "/lessons/{lesson_id}/quiz/questions",
    response_model=QuizQuestionOut,
    status_code=201,
)
def add_question(
    lesson_id: str,
    body: QuizQuestionIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    created = content_service.add_questions(
        db, _teacher_id(current_user), lesson_id, [body.model_dump()]
    )
    return created[0]


@router.post("/lessons/{lesson_id}/quiz/parse", response_model=QuizParseOut)
def parse_quiz_text(
    lesson_id: str,
    body: PasteIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    # Only the access check touches the database. Nothing is saved here.
    content_access.get_lesson(db, _teacher_id(current_user), lesson_id)
    return parse_quiz(body.text)


@router.post(
    "/lessons/{lesson_id}/quiz/bulk",
    response_model=list[QuizQuestionOut],
    status_code=201,
)
def add_questions_bulk(
    lesson_id: str,
    body: QuizBulkIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    # The preview is never trusted: everything is checked again on save.
    return content_service.add_questions(
        db,
        _teacher_id(current_user),
        lesson_id,
        [q.model_dump() for q in body.questions],
    )


@router.put("/quiz-questions/{question_id}", response_model=QuizQuestionOut)
def update_question(
    question_id: int,
    body: QuizQuestionIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return content_service.update_question(
        db, _teacher_id(current_user), question_id, body.model_dump()
    )


@router.delete("/quiz-questions/{question_id}", status_code=204)
def delete_question(
    question_id: int,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    content_service.delete_question(db, _teacher_id(current_user), question_id)
    return Response(status_code=204)


@router.put("/lessons/{lesson_id}/quiz/order", response_model=TeacherQuizOut)
def reorder_quiz(
    lesson_id: str,
    body: OrderIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return content_service.reorder_questions(
        db, _teacher_id(current_user), lesson_id, body.question_ids
    )


# ---- practice --------------------------------------------------------------


@router.get("/lessons/{lesson_id}/practice", response_model=TeacherPracticeOut)
def get_practice(
    lesson_id: str,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return content_service.get_practice(db, _teacher_id(current_user), lesson_id)


@router.post(
    "/lessons/{lesson_id}/practice/items",
    response_model=PracticeItemOut,
    status_code=201,
)
def add_practice_item(
    lesson_id: str,
    body: PracticeItemCreateIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    values = body.model_dump(exclude={"practice_title"})
    created = content_service.add_items(
        db, _teacher_id(current_user), lesson_id, [values], body.practice_title
    )
    return created[0]


@router.post("/lessons/{lesson_id}/practice/parse", response_model=PracticeParseOut)
def parse_practice_text(
    lesson_id: str,
    body: PasteIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    content_access.get_lesson(db, _teacher_id(current_user), lesson_id)
    return parse_practice(body.text)


@router.post(
    "/lessons/{lesson_id}/practice/bulk",
    response_model=list[PracticeItemOut],
    status_code=201,
)
def add_practice_items_bulk(
    lesson_id: str,
    body: PracticeBulkIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return content_service.add_items(
        db,
        _teacher_id(current_user),
        lesson_id,
        [item.model_dump() for item in body.items],
        body.practice_title,
    )


@router.put("/practice-items/{item_id}", response_model=PracticeItemOut)
def update_practice_item(
    item_id: int,
    body: PracticeItemIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return content_service.update_item(
        db, _teacher_id(current_user), item_id, body.model_dump()
    )


@router.delete("/practice-items/{item_id}", status_code=204)
def delete_practice_item(
    item_id: int,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    content_service.delete_item(db, _teacher_id(current_user), item_id)
    return Response(status_code=204)


@router.put("/lessons/{lesson_id}/practice/order", response_model=TeacherPracticeOut)
def reorder_practice(
    lesson_id: str,
    body: PracticeOrderIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return content_service.reorder_items(
        db, _teacher_id(current_user), lesson_id, body.item_ids
    )


@router.put("/lessons/{lesson_id}/practice/title", response_model=TeacherPracticeOut)
def set_practice_title(
    lesson_id: str,
    body: PracticeTitleIn,
    current_user: dict = Depends(require_teacher),
    db: Session = Depends(get_db),
):
    return content_service.set_practice_title(
        db, _teacher_id(current_user), lesson_id, body.title
    )
