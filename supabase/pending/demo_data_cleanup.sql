-- demo_data_cleanup  (NOT APPLIED)
--
-- Removes the demo accounts, the demo class and the demo teacher's courses. Run this before
-- deploying, because every published owned course becomes visible to all students.
--
-- Selects by email pattern and owner, never by title. It refuses to run if any real student
-- has history in a demo course, or sits in the demo class.
--
-- As written it only REPORTS: the last line is `rollback`, so nothing changes. Read the
-- counts it prints, then change that last line to `commit` to really delete.
begin;
set local lock_timeout = '5s';

create temp table demo_users on commit drop as
  select id from auth.users where email like '%demo%@example.com';
create temp table demo_courses on commit drop as
  select id from public.courses where owner_id in (select id from demo_users);
create temp table demo_lessons on commit drop as
  select l.id from public.lessons l
  join public.modules m on m.id = l.module_id
  where m.course_id in (select id from demo_courses);

do $$
declare
  real_history integer;
  real_in_class integer;
begin
  select
    (select count(*) from public.lesson_progress
      where lesson_id in (select id from demo_lessons)
        and student_id not in (select id from demo_users))
    + (select count(*) from public.quiz_attempts a join public.quizzes q on q.id = a.quiz_id
        where q.lesson_id in (select id from demo_lessons)
          and a.student_id not in (select id from demo_users))
    + (select count(*) from public.practice_attempts a join public.practices p on p.id = a.practice_id
        where p.lesson_id in (select id from demo_lessons)
          and a.student_id not in (select id from demo_users))
    + (select count(*) from public.activity_progress ap
        join public.lesson_activities la on la.id = ap.activity_id
        where la.lesson_id in (select id from demo_lessons)
          and ap.student_id not in (select id from demo_users))
  into real_history;
  if real_history > 0 then
    raise exception 'REFUSED: % history rows from real students are in demo courses', real_history;
  end if;

  select count(*) into real_in_class from public.profiles
    where class_id = 'ea-demo-class' and id not in (select id from demo_users);
  if real_in_class > 0 then
    raise exception 'REFUSED: % real accounts are in the demo class', real_in_class;
  end if;

  if to_regclass('public.payment_requests') is not null then
    execute 'select count(*) from public.payment_requests
             where course_id in (select id from demo_courses)
               and student_id not in (select id from demo_users)' into real_history;
    if real_history > 0 then
      raise exception 'REFUSED: % payment requests from real students are on demo courses', real_history;
    end if;
    execute 'delete from public.payment_requests
             where course_id in (select id from demo_courses) or student_id in (select id from demo_users)
                or reviewed_by in (select id from demo_users)';
    execute 'delete from public.course_access where course_id in (select id from demo_courses)';
  end if;

  raise notice 'Will remove: % accounts, % courses, % lessons, class ea-demo-class',
    (select count(*) from demo_users), (select count(*) from demo_courses), (select count(*) from demo_lessons);
end $$;

-- History first: these foreign keys refuse to let content go while records point at it.
delete from public.activity_progress
  where activity_id in (select id from public.lesson_activities where lesson_id in (select id from demo_lessons));
delete from public.lesson_progress where lesson_id in (select id from demo_lessons);
delete from public.quiz_attempts
  where quiz_id in (select id from public.quizzes where lesson_id in (select id from demo_lessons));
delete from public.practice_attempts
  where practice_id in (select id from public.practices where lesson_id in (select id from demo_lessons));

delete from public.lesson_activities where lesson_id in (select id from demo_lessons);
delete from public.courses where id in (select id from demo_courses);  -- modules, lessons, quizzes cascade
update public.profiles set class_id = null where id in (select id from demo_users);
delete from public.classes where id = 'ea-demo-class';
delete from auth.users where id in (select id from demo_users);        -- profiles, XP, streaks cascade

rollback;
