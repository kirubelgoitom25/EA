"""Read-mostly data shared by every request: the course catalogue and the national XP board.

Every student request needs the catalogue (which lesson is in which course, what is
published, what it costs), and the national ranking needs every student's XP. Both are
read far more often than they change, so each is loaded once and kept in memory.

Staying correct:
  * Any ORM write to a table a snapshot is built from drops that snapshot: when the
    session flushes, and again when its transaction ends (commit or rollback), so a
    reader that raced the commit cannot keep what it saw before.
  * A session holding its own uncommitted writes never reads or fills the shared copy;
    it loads straight from the database, so it always sees its own changes.
  * A snapshot is never older than CACHE_SECONDS (default 60). That limit only matters
    for changes the ORM never sees: SQL run directly against the database, or a second
    server process (two workers, or the old and new instance during a deploy).

Snapshots are keyed by engine, so separate databases (as in the tests) never mix.
"""
import os
import threading
import time
from dataclasses import dataclass
from decimal import Decimal
from itertools import chain
from typing import Callable, Optional
from weakref import WeakKeyDictionary

from sqlalchemy import event, select, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Session

from app.models import Course, Lesson, LessonActivity, Module, Profile, XPEvent

MAX_AGE_SECONDS = float(os.getenv("CACHE_SECONDS", "60"))


class SharedSnapshot:
    def __init__(self, name: str, loader: Callable[[Session], object], watched: tuple):
        self.name = name
        self.flag = f"snapshot_dirty:{name}"
        self.watched = watched
        self._loader = loader
        self._lock = threading.Lock()
        self._entries: WeakKeyDictionary = WeakKeyDictionary()  # bind -> (version, loaded_at, value)
        self._versions: WeakKeyDictionary = WeakKeyDictionary()  # bind -> int
        _ALL.append(self)

    def get(self, db: Session):
        bind = db.get_bind()
        own_writes = db.info.get(self.flag, False)
        with self._lock:
            version = self._versions.get(bind, 0)
            entry = self._entries.get(bind)
        if (
            entry is not None
            and not own_writes
            and entry[0] == version
            and time.monotonic() - entry[1] < MAX_AGE_SECONDS
        ):
            return entry[2]
        value = self._loader(db)
        if not own_writes:
            with self._lock:
                # Kept only if nothing was written while it loaded.
                if self._versions.get(bind, 0) == version:
                    self._entries[bind] = (version, time.monotonic(), value)
        return value

    def invalidate(self, bind) -> None:
        with self._lock:
            self._versions[bind] = self._versions.get(bind, 0) + 1
            self._entries.pop(bind, None)


_ALL: list[SharedSnapshot] = []


def _bind_of(session: Session):
    try:
        return session.get_bind()
    except Exception:  # an unbound session has nothing cached
        return None


@event.listens_for(Session, "after_flush")
def _after_flush(session, flush_context):
    touched = list(chain(session.new, session.dirty, session.deleted))
    for snapshot in _ALL:
        if any(isinstance(obj, snapshot.watched) for obj in touched):
            session.info[snapshot.flag] = True
            bind = _bind_of(session)
            if bind is not None:
                snapshot.invalidate(bind)


@event.listens_for(Session, "do_orm_execute")
def _bulk_write(state):
    # query(...).update() / .delete() bypass the flush.
    if not (state.is_update or state.is_delete):
        return
    mapper = state.bind_mapper
    if mapper is None:
        return
    for snapshot in _ALL:
        if issubclass(mapper.class_, snapshot.watched):
            state.session.info[snapshot.flag] = True
            bind = _bind_of(state.session)
            if bind is not None:
                snapshot.invalidate(bind)


@event.listens_for(Session, "after_transaction_end")
def _after_transaction_end(session, transaction):
    if transaction.parent is not None:  # a savepoint; the real end comes later
        return
    for snapshot in _ALL:
        if session.info.pop(snapshot.flag, False):
            bind = _bind_of(session)
            if bind is not None:
                snapshot.invalidate(bind)


# ---- the catalogue -----------------------------------------------------------------------------
# Live content only: archived modules and lessons are left out, exactly as the student routes
# always filtered them. archived_at is kept (always None) so code written for the ORM rows,
# such as courses._course_to_dict, works on these unchanged.


@dataclass(frozen=True)
class CatalogLesson:
    id: str
    title: str
    duration: Optional[str]
    video_url: Optional[str]
    archived_at: None = None


@dataclass(frozen=True)
class CatalogModule:
    id: str
    title: str
    lessons: tuple
    archived_at: None = None


@dataclass(frozen=True)
class CatalogCourse:
    id: str
    title: str
    description: str
    sort_order: int
    owner_id: object
    status: str
    price: Decimal
    currency: str
    access_days: Optional[int]
    payment_instructions: Optional[str]
    modules: tuple


@dataclass(frozen=True)
class Catalog:
    courses: tuple  # every course, drafts included, in display order
    by_id: dict  # course id -> CatalogCourse
    lesson_course: dict  # live lesson id -> course id

    def course_of_lesson(self, lesson_id: str) -> Optional[str]:
        return self.lesson_course.get(lesson_id)


def _load_catalog(db: Session) -> Catalog:
    lessons_by_module: dict[str, list] = {}
    for row in db.execute(
        select(Lesson.id, Lesson.module_id, Lesson.title, Lesson.duration, Lesson.video_url)
        .where(Lesson.archived_at.is_(None))
        .order_by(Lesson.sort_order, Lesson.id)
    ):
        lessons_by_module.setdefault(row.module_id, []).append(
            CatalogLesson(row.id, row.title, row.duration, row.video_url)
        )

    modules_by_course: dict[str, list] = {}
    for row in db.execute(
        select(Module.id, Module.course_id, Module.title)
        .where(Module.archived_at.is_(None))
        .order_by(Module.sort_order, Module.id)
    ):
        modules_by_course.setdefault(row.course_id, []).append(
            CatalogModule(row.id, row.title, tuple(lessons_by_module.get(row.id, ())))
        )

    courses = []
    for row in db.execute(
        select(
            Course.id, Course.title, Course.description, Course.sort_order, Course.owner_id,
            Course.status, Course.price, Course.currency, Course.access_days,
            Course.payment_instructions, Course.created_at,
        )
    ):
        courses.append(
            (
                # Display order: sort_order first. Ties were left to the database before;
                # now the oldest course comes first, legacy (undated) ones before any.
                (
                    row.sort_order,
                    row.created_at is not None,
                    row.created_at.isoformat() if row.created_at else "",
                    row.id,
                ),
                CatalogCourse(
                    row.id, row.title, row.description, row.sort_order, row.owner_id, row.status,
                    row.price, row.currency, row.access_days, row.payment_instructions,
                    tuple(modules_by_course.get(row.id, ())),
                ),
            )
        )
    courses.sort(key=lambda pair: pair[0])
    ordered = tuple(course for _, course in courses)
    return Catalog(
        courses=ordered,
        by_id={c.id: c for c in ordered},
        lesson_course={
            lesson.id: course.id for course in ordered for module in course.modules for lesson in module.lessons
        },
    )


# A video activity is mirrored into lessons.video_url, so activity writes count too.
catalog = SharedSnapshot("catalog", _load_catalog, (Course, Module, Lesson, LessonActivity))


# ---- the national XP board ---------------------------------------------------------------------

NATIONAL_TOTALS_QUERY = text("""
    select p.id, p.name,
           coalesce(sum(x.amount), 0) as xp,
           coalesce(sum(x.amount) filter (where x.created_at >= now() - interval '7 days'), 0) as weekly_xp,
           coalesce(sum(x.amount) filter (where x.created_at >= now() - interval '30 days'), 0) as monthly_xp
    from public.profiles p
    left join public.xp_events x on x.student_id = p.id
    where p.role = 'student' and p.is_active
    group by p.id, p.name
""").columns(id=UUID(as_uuid=True))


def _load_national_totals(db: Session) -> tuple:
    return tuple(dict(row) for row in db.execute(NATIONAL_TOTALS_QUERY).mappings())


# New XP, and any profile change (a rename, a turned-off account), rebuild it.
national_totals = SharedSnapshot("national_totals", _load_national_totals, (XPEvent, Profile))
