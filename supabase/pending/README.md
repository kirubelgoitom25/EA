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

# Accounts and EA Pro (APPLIED to live 2026-11-08, approved by the user)

Applied 2026-11-08 in 854 ms, after a JSON backup of every public table
(~/EA-backups/2026-11-08) and a full dry run on live inside a rolled-back transaction (18/18
checks: Supabase's insert-then-update order saves username, phone and school; a taken phone is
refused; dashboard-made accounts unchanged; apps cannot call apply_signup_details). Every
existing table's row count unchanged; 1 priced course became `paid`, the rest `free`.

Original notes:

`20261108000000_accounts_and_pro.sql` adds username and phone to `profiles`, the
`student_profiles`, `plans` and `memberships` tables, `courses.access_tier` (filled from the price:
above 0 is paid, the rest free, so nothing opens or closes), `payment_requests.plan_id`, and makes
the new-account trigger save username, phone and school from `raw_app_meta_data` (only the service
key can set it). Additive; the only update is the one-time `access_tier` fill.

Apply order, once approved (and only after the tests in `docs/ACCOUNTS_AND_PRO_LAUNCH.md` pass on a
test project):

1. This file.
2. Deploy the backend. The ORM models select the new columns, so the backend must be deployed
   AFTER step 1, never before.

`accounts_and_pro_rollback_pre_use_only.sql` refuses to run once any student has a username or
phone, or any plan, membership, plan request or Pro course exists.
