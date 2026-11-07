-- submission_ids_rollback
--
-- Undoes 20261107010000_submission_ids.sql. Deploy the previous backend FIRST: the new
-- one reads and writes client_submission_id and fails without it.
--
-- Drops only the two indexes and the two columns. The attempts themselves, their scores,
-- XP and dates are untouched; only the retry ids are lost, after which a retried
-- submission would again be recorded as a new attempt.
begin;
set local lock_timeout = '5s';

drop index if exists public.quiz_attempts_submission_uq;
drop index if exists public.practice_attempts_submission_uq;
alter table public.quiz_attempts     drop column if exists client_submission_id;
alter table public.practice_attempts drop column if exists client_submission_id;

commit;
