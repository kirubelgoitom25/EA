-- submission_ids  (APPLIED to live 2026-11-07 in 197 ms; existing rows verified unchanged by checksum)
--
-- Makes a chapter submission count once. The app gives each chapter submission an id
-- and sends the same id on every retry; the backend stores it with the attempt and, when
-- it arrives again (a retry after a lost answer, a double tap), returns the first result
-- instead of recording a second attempt and awarding XP twice.
--
-- Additive only:
--   * one nullable column on quiz_attempts and on practice_attempts. Adding a nullable
--     column with no default changes no existing row (Postgres only updates the catalog);
--     every existing attempt keeps NULL, which means "no id".
--   * one partial unique index per table, over rows that have an id. Existing rows all
--     have NULL, so the index starts empty and cannot conflict with any existing data.
-- Nothing is deleted or rewritten; no progress, attempt, XP or streak changes.
--
-- The backend from before this change ignores the new columns, so this is safe to apply
-- before deploying. The new backend needs it applied first.
--
-- Rollback: submission_ids_rollback.sql (deploy the previous backend first).
begin;
set local lock_timeout = '5s';

alter table public.quiz_attempts     add column if not exists client_submission_id uuid;
alter table public.practice_attempts add column if not exists client_submission_id uuid;

create unique index if not exists quiz_attempts_submission_uq
  on public.quiz_attempts (student_id, client_submission_id)
  where client_submission_id is not null;

create unique index if not exists practice_attempts_submission_uq
  on public.practice_attempts (student_id, client_submission_id)
  where client_submission_id is not null;

commit;
