"""May this teacher edit this lesson, module, course, question or item?

A teacher may edit a course they own. An ownerless (legacy) course can be
edited by a teacher who teaches at least one class that has it. The main admin
may edit every course.
Every check returns the row only when the teacher is allowed, so something
that does not exist and something that is not theirs both answer 404.
"""
import uuid

from fastapi import HTTPException
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

# The part every query shares: the teacher must be allowed to edit the course
# (aliased m.course_id or c.id). An owned course is edited only by its owner. An
# ownerless (legacy) course is edited by a teacher who teaches a class that has it.
_TEACHES_COURSE = """
    exists (
        select 1
        from courses cx
        where cx.id = {course_id}
          and (
              cx.owner_id = :teacher_id
              or (
                  cx.owner_id is null
                  and exists (
                      select 1
                      from class_courses cc
                      join class_teachers ct on ct.class_id = cc.class_id
                      where cc.course_id = cx.id and ct.teacher_id = :teacher_id
                  )
              )
              or exists (
                  select 1 from profiles ap where ap.id = :teacher_id and ap.is_admin
              )
          )
    )
"""

COURSE_QUERY = text(
    "select c.id from courses c where c.id = :id and "
    + _TEACHES_COURSE.format(course_id="c.id")
)

MODULE_QUERY = text(
    "select m.id, m.course_id from modules m where m.id = :id and "
    + _TEACHES_COURSE.format(course_id="m.course_id")
)

LESSON_QUERY = text("""
    select l.id, l.title, l.module_id, m.course_id
    from lessons l
    join modules m on m.id = l.module_id
    where l.id = :id and
""" + _TEACHES_COURSE.format(course_id="m.course_id"))

QUIZ_QUESTION_QUERY = text("""
    select qq.id, qq.quiz_id, q.lesson_id
    from quiz_questions qq
    join quizzes q on q.id = qq.quiz_id
    join lessons l on l.id = q.lesson_id
    join modules m on m.id = l.module_id
    where qq.id = :id and
""" + _TEACHES_COURSE.format(course_id="m.course_id"))

PRACTICE_ITEM_QUERY = text("""
    select pi.id, pi.practice_id, p.lesson_id
    from practice_items pi
    join practices p on p.id = pi.practice_id
    join lessons l on l.id = p.lesson_id
    join modules m on m.id = l.module_id
    where pi.id = :id and
""" + _TEACHES_COURSE.format(course_id="m.course_id"))

# Classes the teacher teaches, out of the ones that were asked for.
TEACHER_CLASSES_QUERY = text(
    "select class_id from class_teachers "
    "where teacher_id = :teacher_id and class_id in :ids"
).bindparams(bindparam("ids", expanding=True))


def _find(db: Session, query, item_id, teacher_id: uuid.UUID, not_found: str):
    row = db.execute(query, {"id": item_id, "teacher_id": teacher_id}).first()
    if row is None:
        raise HTTPException(status_code=404, detail=not_found)
    return row


def get_course(db: Session, teacher_id: uuid.UUID, course_id: str):
    return _find(db, COURSE_QUERY, course_id, teacher_id, "Course not found")


def get_module(db: Session, teacher_id: uuid.UUID, module_id: str):
    return _find(db, MODULE_QUERY, module_id, teacher_id, "Module not found")


def get_lesson(db: Session, teacher_id: uuid.UUID, lesson_id: str):
    return _find(db, LESSON_QUERY, lesson_id, teacher_id, "Lesson not found")


def get_quiz_question(db: Session, teacher_id: uuid.UUID, question_id: int):
    return _find(db, QUIZ_QUESTION_QUERY, question_id, teacher_id, "Question not found")


def get_practice_item(db: Session, teacher_id: uuid.UUID, item_id: int):
    return _find(db, PRACTICE_ITEM_QUERY, item_id, teacher_id, "Item not found")


def classes_taught(db: Session, teacher_id: uuid.UUID, class_ids: list[str]) -> list[str]:
    rows = db.execute(
        TEACHER_CLASSES_QUERY, {"teacher_id": teacher_id, "ids": class_ids}
    ).all()
    return [row[0] for row in rows]
