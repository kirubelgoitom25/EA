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
