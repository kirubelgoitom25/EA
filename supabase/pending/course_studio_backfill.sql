-- course_studio_backfill  (NOT APPLIED; run only after 20261102000000_course_studio.sql)
--
-- One transaction. Idempotent. Any failed check raises and rolls everything back.
-- Never touches lesson_progress, attempts, xp_events, streaks or any course/lesson text.
--
-- Video reconciliation rule (activities are canonical, no URL is ever lost):
--   * lesson has a non-blank video_url that NO video activity of that lesson holds yet:
--       - no active video activity  -> add it as an ACTIVE activity;
--       - an active video activity with another URL exists (a teacher edit) -> add it as an
--         ARCHIVED activity so the URL is kept, and the teacher's active video is not overwritten.
--   * a video activity already holds that exact URL -> nothing to do.
begin;

-- 0. Pre-flight: every referenced table/column exists with the verified type -------------
do $$
declare missing text;
begin
  select string_agg(r.t || '.' || r.c, ', ') into missing
  from (values
    ('lessons','id','text'), ('lessons','video_url','text'), ('lessons','archived_at','timestamp with time zone'),
    ('quizzes','id','integer'), ('quizzes','lesson_id','text'),
    ('practices','id','integer'), ('practices','lesson_id','text'), ('practices','title','text'),
    ('quiz_attempts','student_id','uuid'), ('quiz_attempts','quiz_id','integer'),
    ('quiz_attempts','created_at','timestamp with time zone'),
    ('practice_attempts','student_id','uuid'), ('practice_attempts','practice_id','integer'),
    ('practice_attempts','created_at','timestamp with time zone'),
    ('lesson_progress','student_id','uuid'), ('lesson_progress','lesson_id','text'),
    ('lesson_progress','completed_at','timestamp with time zone'),
    ('lesson_activities','id','integer'), ('lesson_activities','legacy_ref','text'),
    ('lesson_activities','is_required','boolean'), ('lesson_activities','archived_at','timestamp with time zone'),
    ('activity_progress','activity_id','integer'), ('activity_progress','source','text'),
    ('activity_progress','completed_at','timestamp with time zone')
  ) as r(t, c, ty)
  where not exists (select 1 from information_schema.columns k
                    where k.table_schema='public' and k.table_name=r.t and k.column_name=r.c and k.data_type=r.ty);
  if missing is not null then raise exception 'pre-flight failed, missing/mismatched: %', missing; end if;
end $$;

-- Snapshots for the "nothing historical changed" checks (dropped at commit)
create temp table _bf_video on commit drop as
  select id, video_url from public.lessons;
create temp table _bf_fp on commit drop as
  select 'lesson_progress' t, count(*) n, md5(coalesce(string_agg(x::text,'|' order by x::text),'')) h from public.lesson_progress x
  union all select 'quiz_attempts',     count(*), md5(coalesce(string_agg(x::text,'|' order by x::text),'')) from public.quiz_attempts x
  union all select 'practice_attempts', count(*), md5(coalesce(string_agg(x::text,'|' order by x::text),'')) from public.practice_attempts x
  union all select 'xp_events',         count(*), md5(coalesce(string_agg(x::text,'|' order by x::text),'')) from public.xp_events x
  union all select 'streaks',           count(*), md5(coalesce(string_agg(x::text,'|' order by x::text),'')) from public.streaks x;

-- A. Video activities: exact copy of lessons.video_url, reconciled as described above.
--    Nothing is required: is_required = false everywhere.
insert into public.lesson_activities
  (lesson_id, kind, sort_order, title, is_required, video_url, legacy_ref, archived_at)
select l.id, 'video', 10, 'Video', false, l.video_url, 'lesson_video:' || l.id,
       case when exists (select 1 from public.lesson_activities a
                         where a.lesson_id = l.id and a.kind = 'video' and a.archived_at is null)
            then now() end
from public.lessons l
where nullif(btrim(l.video_url), '') is not null
  and not exists (select 1 from public.lesson_activities a
                  where a.lesson_id = l.id and a.kind = 'video' and a.video_url = l.video_url)
on conflict (legacy_ref) do nothing;

-- B. Quiz activities (not required)
insert into public.lesson_activities (lesson_id, kind, sort_order, title, is_required, quiz_id, legacy_ref)
select q.lesson_id, 'quiz', 20, 'Quiz', false, q.id, 'quiz:' || q.id
from public.quizzes q
where not exists (select 1 from public.lesson_activities a where a.quiz_id = q.id)
on conflict (legacy_ref) do nothing;

-- C. Practice activities (not required)
insert into public.lesson_activities (lesson_id, kind, sort_order, title, is_required, practice_id, legacy_ref)
select p.lesson_id, 'practice', 30, p.title, false, p.id, 'practice:' || p.id
from public.practices p
where not exists (select 1 from public.lesson_activities a where a.practice_id = p.id)
on conflict (legacy_ref) do nothing;

-- D. Activity progress from historical attempts (quiz_attempts.created_at and
--    practice_attempts.created_at are timestamptz NOT NULL, verified live and in pre-flight).
--    Any attempt counts, matching the legacy rule. Video/reading completion is never invented.
insert into public.activity_progress (student_id, activity_id, completed_at, source)
select a.student_id, la.id, min(a.created_at), 'backfill'
from public.quiz_attempts a
join public.lesson_activities la on la.quiz_id = a.quiz_id
group by a.student_id, la.id
on conflict (student_id, activity_id) do nothing;

insert into public.activity_progress (student_id, activity_id, completed_at, source)
select a.student_id, la.id, min(a.created_at), 'backfill'
from public.practice_attempts a
join public.lesson_activities la on la.practice_id = a.practice_id
group by a.student_id, la.id
on conflict (student_id, activity_id) do nothing;

-- E. Validation
do $$
declare n bigint;
begin
  -- every legacy YouTube URL survives, byte for byte, in some video activity of its lesson
  select count(*) into n from _bf_video s
   where nullif(btrim(s.video_url),'') is not null
     and not exists (select 1 from public.lesson_activities a
                     where a.lesson_id = s.id and a.kind = 'video' and a.video_url = s.video_url);
  if n > 0 then raise exception 'FAIL: % legacy video URLs missing from video activities', n; end if;

  -- lessons.video_url may only differ from the snapshot where a teacher-edited active video won
  select count(*) into n from _bf_video s join public.lessons l using (id)
   where l.video_url is distinct from s.video_url
     and not exists (select 1 from public.lesson_activities a
                     where a.lesson_id = l.id and a.kind = 'video' and a.archived_at is null
                       and a.legacy_ref is distinct from 'lesson_video:' || l.id);
  if n > 0 then raise exception 'FAIL: % lessons.video_url changed without a teacher-edited video', n; end if;

  -- nothing migrated is required
  select count(*) into n from public.lesson_activities where legacy_ref is not null and is_required;
  if n > 0 then raise exception 'FAIL: % migrated activities are required', n; end if;

  -- every quiz and practice backs exactly one activity; UNIQUE(lesson_id) constraints intact
  select count(*) into n from public.quizzes q
   where (select count(*) from public.lesson_activities a where a.quiz_id = q.id) <> 1;
  if n > 0 then raise exception 'FAIL: % quizzes without exactly one activity', n; end if;
  select count(*) into n from public.practices p
   where (select count(*) from public.lesson_activities a where a.practice_id = p.id) <> 1;
  if n > 0 then raise exception 'FAIL: % practices without exactly one activity', n; end if;
  select count(*) into n from pg_constraint
   where connamespace='public'::regnamespace and conname in ('quizzes_lesson_id_key','practices_lesson_id_key');
  if n <> 2 then raise exception 'FAIL: one-quiz/one-practice constraints missing'; end if;

  -- progress reconciles with attempts; no invented video/reading completion
  select (select count(*) from (select distinct a.student_id, la.id from public.quiz_attempts a
            join public.lesson_activities la on la.quiz_id = a.quiz_id) s)
       - (select count(*) from public.activity_progress ap join public.lesson_activities la on la.id = ap.activity_id
           where la.kind = 'quiz' and ap.source = 'backfill') into n;
  if n <> 0 then raise exception 'FAIL: quiz activity_progress off by %', n; end if;
  select (select count(*) from (select distinct a.student_id, la.id from public.practice_attempts a
            join public.lesson_activities la on la.practice_id = a.practice_id) s)
       - (select count(*) from public.activity_progress ap join public.lesson_activities la on la.id = ap.activity_id
           where la.kind = 'practice' and ap.source = 'backfill') into n;
  if n <> 0 then raise exception 'FAIL: practice activity_progress off by %', n; end if;
  select count(*) into n from public.activity_progress ap join public.lesson_activities la on la.id = ap.activity_id
   where la.kind in ('video','reading') and ap.source = 'backfill';
  if n > 0 then raise exception 'FAIL: % invented video/reading completions', n; end if;

  -- sync triggers installed
  select count(*) into n from pg_trigger
   where not tgisinternal and tgname in ('lesson_activities_sync_video','lessons_video_after_insert','lessons_video_after_update');
  if n <> 3 then raise exception 'FAIL: video sync triggers missing'; end if;

  -- historical tables byte-identical to the start of this script
  select count(*) into n from _bf_fp f
   join (select 'lesson_progress' t, md5(coalesce(string_agg(x::text,'|' order by x::text),'')) h from public.lesson_progress x
         union all select 'quiz_attempts',     md5(coalesce(string_agg(x::text,'|' order by x::text),'')) from public.quiz_attempts x
         union all select 'practice_attempts', md5(coalesce(string_agg(x::text,'|' order by x::text),'')) from public.practice_attempts x
         union all select 'xp_events',         md5(coalesce(string_agg(x::text,'|' order by x::text),'')) from public.xp_events x
         union all select 'streaks',           md5(coalesce(string_agg(x::text,'|' order by x::text),'')) from public.streaks x) c
     on c.t = f.t
   where c.h <> f.h;
  if n > 0 then raise exception 'FAIL: % historical tables changed', n; end if;
end $$;

-- F. Report (informational)
select 'video_activities' as check, count(*) as n from public.lesson_activities where kind = 'video'
union all select 'lessons_with_non_blank_video_url', count(*) from public.lessons where nullif(btrim(video_url),'') is not null
union all select 'archived_video_activities (URL conflicts kept)', count(*) from public.lesson_activities where kind = 'video' and archived_at is not null
union all select 'quiz_activities',     count(*) from public.lesson_activities where kind = 'quiz'
union all select 'practice_activities', count(*) from public.lesson_activities where kind = 'practice'
union all select 'required_activities (expect 0)', count(*) from public.lesson_activities where is_required
union all select 'activity_progress_backfilled', count(*) from public.activity_progress where source = 'backfill'
union all select 'lessons_with_no_activities', count(*) from public.lessons l
  where not exists (select 1 from public.lesson_activities a where a.lesson_id = l.id)
union all select 'quizzes_not_multiple_of_10_questions', count(*) from (
  select quiz_id from public.quiz_questions group by 1 having count(*) % 10 <> 0) s
union all select 'practices_not_multiple_of_10_items', count(*) from (
  select practice_id from public.practice_items group by 1 having count(*) % 10 <> 0) s;

commit;
