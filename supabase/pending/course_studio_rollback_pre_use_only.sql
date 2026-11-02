-- course_studio_rollback_pre_use_only  (NOT APPLIED)
--
-- ONLY for undoing the migration + backfill BEFORE any teacher has used Course Studio.
-- The guard below refuses to run if any teacher-created data exists, so this script
-- can never drop teacher work. It removes only objects/rows the migration and the
-- backfill created.
--
-- AFTER Studio is in use there is NO rollback that drops tables or columns.
-- Instead: stop/disable the /teacher Studio routes in the backend (legacy student
-- routes keep working because every legacy table and column is untouched), and
-- fix forward. If a schema revert is ever unavoidable, export lesson_activities,
-- activity_progress and the new courses columns first and review them by hand.
--
-- The three history foreign keys are deliberately NOT reverted to ON DELETE CASCADE:
-- NO ACTION protects student data and nothing depends on cascading.
begin;

do $$
declare n bigint;
begin
  select count(*) into n from public.courses where owner_id is not null or status <> 'published';
  if n > 0 then raise exception 'REFUSED: % teacher-owned/draft/unpublished courses exist', n; end if;

  select count(*) into n from public.lesson_activities where legacy_ref is null;
  if n > 0 then raise exception 'REFUSED: % activities were created in Studio', n; end if;

  select count(*) into n from public.lesson_activities where kind = 'reading' or is_required;
  if n > 0 then raise exception 'REFUSED: % reading/required activities exist', n; end if;

  select count(*) into n from public.activity_progress where source in ('manual','quiz_attempt','practice_attempt');
  if n > 0 then raise exception 'REFUSED: % activity_progress rows were written after the backfill', n; end if;

  select count(*) into n from public.modules where archived_at is not null;
  if n > 0 then raise exception 'REFUSED: % archived modules', n; end if;
  select count(*) into n from public.lessons where archived_at is not null;
  if n > 0 then raise exception 'REFUSED: % archived lessons', n; end if;

  select count(*) into n from public.lesson_activities where kind = 'video' and archived_at is not null;
  if n > 0 then raise exception 'REFUSED: % archived video activities hold URLs that exist nowhere else', n; end if;
end $$;

drop trigger if exists lessons_video_after_insert  on public.lessons;
drop trigger if exists lessons_video_after_update  on public.lessons;
drop trigger if exists lesson_activities_sync_video on public.lesson_activities;
drop trigger if exists courses_set_updated_at       on public.courses;
drop trigger if exists lesson_activities_set_updated_at on public.lesson_activities;
drop function if exists public.trg_lesson_video_to_activity();
drop function if exists public.trg_activity_to_lesson_video();
drop function if exists public.sync_lesson_video(text);
drop function if exists public.set_updated_at();

-- Only backfill-created rows exist at this point (the guard above proved it).
drop table public.activity_progress;
drop table public.lesson_activities;

alter table public.quizzes   drop constraint quizzes_id_lesson_id_key;
alter table public.practices drop constraint practices_id_lesson_id_key;

alter table public.modules drop column archived_at;
alter table public.lessons drop column archived_at;
drop index if exists public.modules_course_idx;
drop index if exists public.lessons_module_idx;
alter table public.courses
  drop column owner_id, drop column status, drop column created_at,
  drop column updated_at, drop column published_at;

commit;
