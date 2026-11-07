-- performance_indexes_rollback
--
-- Drops exactly the six indexes added by 20261107000000_performance_indexes.sql. Indexes
-- hold no data of their own, so this is safe at any time: queries return the same rows,
-- only slower. Nothing else is touched.
begin;
set local lock_timeout = '5s';

drop index if exists public.xp_events_student_created_idx;
drop index if exists public.practice_attempts_student_practice_idx;
drop index if exists public.practice_attempts_practice_idx;
drop index if exists public.quiz_attempts_quiz_idx;
drop index if exists public.profiles_class_idx;
drop index if exists public.lesson_progress_lesson_idx;

commit;
