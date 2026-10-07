from sqlalchemy import text
from sqlalchemy.orm import Session

# The course each student last worked on. The latest of three signals counts:
# an XP-earning quiz, an XP-earning practice, or a finished lesson. Only
# courses assigned to the class are considered. XP events do not store a
# course, so it is found through quiz/practice -> lesson -> module -> course.
CURRENT_COURSE_QUERY = text("""
    with act as (
        select x.student_id, m.course_id, x.created_at as at
        from xp_events x
        join quizzes q on x.source = 'quiz' and q.id = x.source_id
        join lessons l on l.id = q.lesson_id
        join modules m on m.id = l.module_id
        where x.student_id in (select id from profiles where class_id = :class_id)
        union all
        select x.student_id, m.course_id, x.created_at as at
        from xp_events x
        join practices pr on x.source = 'practice' and pr.id = x.source_id
        join lessons l on l.id = pr.lesson_id
        join modules m on m.id = l.module_id
        where x.student_id in (select id from profiles where class_id = :class_id)
        union all
        select lp.student_id, m.course_id, lp.completed_at as at
        from lesson_progress lp
        join lessons l on l.id = lp.lesson_id
        join modules m on m.id = l.module_id
        where lp.student_id in (select id from profiles where class_id = :class_id)
    )
    select distinct on (a.student_id) a.student_id, c.id as course_id, c.title
    from act a
    join class_courses cc on cc.course_id = a.course_id and cc.class_id = :class_id
    join courses c on c.id = a.course_id
    order by a.student_id, a.at desc
""")


def current_courses_for_class(db: Session, class_id: str) -> dict[str, dict]:
    """Return {student_id: {"id": course_id, "title": course title}}."""
    rows = db.execute(CURRENT_COURSE_QUERY, {"class_id": class_id}).mappings().all()
    return {
        str(r["student_id"]): {"id": r["course_id"], "title": r["title"]}
        for r in rows
    }