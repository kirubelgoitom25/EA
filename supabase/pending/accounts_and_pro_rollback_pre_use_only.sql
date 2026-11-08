-- accounts_and_pro_rollback  (only before anyone has used it)
--
-- Refuses to run once a student has a username or phone, a Pro course, plan, membership
-- or plan request exists. After that, accounts and payment history must be kept: stop
-- the backend routes instead of dropping anything.
begin;
set local lock_timeout = '5s';

do $$
begin
  if exists (select 1 from public.profiles where username is not null or phone is not null)
     or exists (select 1 from public.student_profiles)
     or exists (select 1 from public.plans)
     or exists (select 1 from public.memberships)
     or exists (select 1 from public.payment_requests where plan_id is not null)
     or exists (select 1 from public.courses where access_tier = 'pro') then
    raise exception 'REFUSED: accounts or Pro are in use, so their data must be kept';
  end if;
end $$;

drop index public.payment_requests_pending_plan_image_uq;
drop index public.payment_requests_plan_review_idx;
alter table public.payment_requests drop constraint payment_requests_target_check;
alter table public.payment_requests drop column plan_id;
alter table public.payment_requests alter column course_id set not null;

drop table public.memberships;
drop table public.plans;

alter table public.courses
  drop constraint courses_tier_price_check,
  drop constraint courses_access_tier_check,
  drop column access_tier;

drop trigger if exists on_auth_user_app_metadata on auth.users;
drop function if exists public.handle_user_app_metadata();

create or replace function public.handle_new_user()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
begin
  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    'student'
  );
  return new;
end;
$function$;

drop function if exists public.apply_signup_details(uuid, jsonb);
drop table public.student_profiles;
alter table public.profiles drop column phone, drop column username;

commit;
