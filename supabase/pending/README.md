# Course Studio: pending SQL (NOT applied)

These files are deliberately outside `supabase/migrations/` so `supabase db push`
cannot pick them up. Nothing here has been run against any database.

Apply order, once approved:

1. `20261102000000_course_studio.sql`   (schema, transactional)
2. `course_studio_backfill.sql`         (data, transactional, idempotent)
3. Deploy the backend. The ORM models select the new `courses` columns, so the
   backend must be deployed AFTER step 1, never before.

When approved, move file 1 into `supabase/migrations/`; keep file 2 as a script.

`course_studio_rollback_pre_use_only.sql` refuses to run once any teacher-created
Course Studio data exists. After Studio is in use there is no rollback that drops
data: stop the backend routes instead (see the header of that file).

# Course marketplace: pending SQL (NOT applied)

Paid courses, payment requests and the main admin flag. Apply order, once approved:

1. `20261106000000_course_marketplace.sql`   (schema and private bucket, transactional)
2. Set the main admin by hand, once: `update public.profiles set is_admin = true where id = '<id>';`
3. Add `SUPABASE_SERVICE_ROLE_KEY` to the backend's environment (never to Expo or Vite).
4. Deploy the backend. The ORM models select the new columns, so the backend must
   be deployed AFTER step 1, never before.

When approved, move file 1 into `supabase/migrations/`.

`course_marketplace_rollback_pre_use_only.sql` refuses to run once a course has a
price, a request or access row exists, or an admin has been set.

`demo_data_cleanup.sql` removes the demo accounts, class and courses. As written it only reports:
change its last line to `commit` to really delete. Run it before deploying.

# Performance indexes (APPLIED to live 2026-11-07)

`20261107000000_performance_indexes.sql` adds six indexes and changes nothing else: no
table, column or row. The backend works the same with or without them (only faster with
them), so it could be applied in any order. Applied 2026-11-07: all six valid, row counts
of every table unchanged.

`performance_indexes_rollback.sql` drops exactly those six; safe at any time.

# Submission ids (APPLIED to live 2026-11-07, approved by the user)

`20261107010000_submission_ids.sql` makes a chapter submission count once: a nullable
`client_submission_id` column on `quiz_attempts` and `practice_attempts` (existing rows keep
NULL; no row is rewritten) and a partial unique index per table over rows that have one.

Applied 2026-11-07 in 197 ms: both columns nullable uuid with no values, both indexes valid,
existing attempts, XP and streaks identical by checksum. Duplicate protection then verified on
live inside a rolled-back transaction (13/13 checks). Order was: apply this, then deploy the backend. The new backend also works before it is applied
for every request that sends no submission id (older apps); only submits from the new app,
which send one, need the column. `submission_ids_rollback.sql` undoes it (deploy the previous
backend first).
