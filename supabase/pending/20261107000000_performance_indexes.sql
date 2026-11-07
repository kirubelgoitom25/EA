-- performance_indexes  (APPLIED to live 2026-11-07 in 217 ms; row counts verified unchanged)
--
-- Six indexes for lookups the backend makes on every refresh or teacher page, which today
-- read the whole table. Indexes only: no table, column, constraint or row is created,
-- changed or deleted, so no student progress, attempt, XP or streak can be affected.
--
-- Each index, and the queries it serves:
--   xp_events (student_id, created_at) include (amount)
--       /me/stats on every app refresh, class rankings, teacher class and student pages,
--       needs-attention flags. Today: 30,000+ full scans, zero index scans.
--   practice_attempts (student_id, practice_id)
--       "done before?" on every practice open and submit (the existing unique index only
--       covers first completions).
--   practice_attempts (practice_id), quiz_attempts (quiz_id)
--       "does this have attempts?" before a teacher edits or deletes questions.
--   profiles (class_id)
--       every class ranking, class roster, presence and needs-attention query.
--   lesson_progress (lesson_id)
--       course statistics and the archive-instead-of-delete check in Course Studio.
--
-- Locking: a plain CREATE INDEX blocks writes to that one table while it builds. On the
-- live tables (a few hundred rows each) that is milliseconds. lock_timeout makes it give
-- up instead of queueing behind a long transaction. On tables with millions of rows, use
-- CREATE INDEX CONCURRENTLY outside a transaction instead.
--
-- Rollback: performance_indexes_rollback.sql (drops only these six; safe at any time).
begin;
set local lock_timeout = '5s';

create index if not exists xp_events_student_created_idx
  on public.xp_events (student_id, created_at) include (amount);

create index if not exists practice_attempts_student_practice_idx
  on public.practice_attempts (student_id, practice_id);

create index if not exists practice_attempts_practice_idx
  on public.practice_attempts (practice_id);

create index if not exists quiz_attempts_quiz_idx
  on public.quiz_attempts (quiz_id);

create index if not exists profiles_class_idx
  on public.profiles (class_id);

create index if not exists lesson_progress_lesson_idx
  on public.lesson_progress (lesson_id);

-- Refresh planner statistics so the new indexes are considered straight away.
analyze public.xp_events, public.practice_attempts, public.quiz_attempts,
        public.profiles, public.lesson_progress;

commit;

-- Check (read-only), expected 6 rows:
-- select indexname from pg_indexes where schemaname = 'public' and indexname in (
--   'xp_events_student_created_idx', 'practice_attempts_student_practice_idx',
--   'practice_attempts_practice_idx', 'quiz_attempts_quiz_idx', 'profiles_class_idx',
--   'lesson_progress_lesson_idx');
