-- accounts_and_pro  (NOT APPLIED; see README.md)
--
-- 1. Student accounts by username + phone + password + school, created by the backend
--    with the service key (public sign-up stays off).
-- 2. EA Pro: admin-set plans and one membership row per student.
-- 3. Course access options: free, paid or pro.
--
-- Additive only. No existing row is rewritten except the one-time fill of
-- courses.access_tier from the price (price > 0 -> 'paid', else 'free'), which keeps every
-- course exactly as open as it is today. Nothing here changes progress, XP, streaks,
-- payment history or course_access.
--
-- Pro and purchases never touch each other: memberships and course_access are separate
-- tables, and nothing here (or in the backend) writes one when the other changes.
begin;
set local lock_timeout = '5s';

-- 0. Pre-flight ----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.tables
                 where table_schema='public' and table_name='course_access') then
    raise exception 'The course marketplace must be applied first';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='profiles' and column_name='username') then
    raise exception 'profiles already migrated';
  end if;
end $$;

-- 1. Identity: username and phone ---------------------------------------------------------
-- Both optional: teachers and older email accounts have neither. Stored in one form only
-- (lowercase username, +251 phone), so uniqueness is a plain index.
alter table public.profiles
  add column username text,
  add column phone    text;
alter table public.profiles
  add constraint profiles_username_check check (username is null or username ~ '^[a-z0-9_]{3,20}$'),
  add constraint profiles_phone_check    check (phone is null or phone ~ '^\+251[79][0-9]{8}$');
create unique index profiles_username_uq on public.profiles(username) where username is not null;
create unique index profiles_phone_uq    on public.profiles(phone)    where phone is not null;

-- 2. Student attributes -----------------------------------------------------------------------
-- One row per student. Later attributes (birth year, region, field of study, academic
-- level...) are new nullable columns here: additive, no rewrite, no API redesign.
create table public.student_profiles (
  student_id uuid        primary key references public.profiles(id) on delete cascade,
  school     text        check (school is null or char_length(school) between 2 and 120),
  updated_at timestamptz not null default now()
);

-- 3. New accounts also save username, phone and school ---------------------------------------
-- Read from raw_APP_meta_data, which only the service key can set: a client signing up
-- through Supabase cannot put a username or phone here.
--
-- Supabase's admin "create user" INSERTs the user first and applies app_metadata in a
-- separate UPDATE afterwards, inside the same transaction (supabase/auth
-- internal/api/admin.go, adminUserCreate: tx.Create(user), then user.UpdateAppMetaData).
-- So the insert trigger cannot see these keys, and a second trigger on that UPDATE writes
-- them. Both run inside Supabase's transaction, so a taken username or phone (unique index)
-- stops the whole account: nothing half-made. The backend also checks afterwards and fills
-- in anything missing (account_service.register), in case Supabase ever changes the order.
-- Accounts made without these keys (teachers, the Supabase dashboard) work as before.
create or replace function public.apply_signup_details(user_id uuid, app jsonb)
  returns void
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
begin
  if nullif(app->>'ea_username', '') is null
     and nullif(app->>'ea_phone', '') is null
     and nullif(app->>'ea_school', '') is null then
    return;
  end if;
  -- Only fills what is empty: a later app_metadata change never rewrites a profile.
  update public.profiles
     set username = coalesce(username, nullif(app->>'ea_username', '')),
         phone    = coalesce(phone, nullif(app->>'ea_phone', ''))
   where id = user_id;
  if nullif(app->>'ea_school', '') is not null then
    insert into public.student_profiles (student_id, school)
    values (user_id, app->>'ea_school')
    on conflict (student_id) do nothing;
  end if;
end;
$function$;
revoke all on function public.apply_signup_details(uuid, jsonb) from public, anon, authenticated;

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
  -- Empty today (see above); kept so the details still land if Supabase ever inserts them.
  perform public.apply_signup_details(new.id, coalesce(new.raw_app_meta_data, '{}'::jsonb));
  return new;
end;
$function$;

create or replace function public.handle_user_app_metadata()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
begin
  perform public.apply_signup_details(new.id, coalesce(new.raw_app_meta_data, '{}'::jsonb));
  return new;
end;
$function$;

drop trigger if exists on_auth_user_app_metadata on auth.users;
create trigger on_auth_user_app_metadata
  after update of raw_app_meta_data on auth.users
  for each row execute function public.handle_user_app_metadata();

-- 4. Course access option --------------------------------------------------------------------
-- pro_included: a paid course its owner also includes in EA Pro (Pro members open it
-- without buying; everyone else can still buy it).
alter table public.courses
  add column access_tier  text    not null default 'free',
  add column pro_included boolean not null default false;
update public.courses set access_tier = 'paid' where price > 0;
alter table public.courses
  add constraint courses_access_tier_check  check (access_tier in ('free','paid','pro')),
  -- Only a paid course has a price.
  add constraint courses_tier_price_check   check ((access_tier = 'paid') = (price > 0)),
  add constraint courses_pro_included_check check (not pro_included or access_tier = 'paid');

-- 5. Pro plans (set by the admin) ---------------------------------------------------------
create table public.plans (
  id                   text          primary key,
  tier                 text          not null default 'pro' check (tier in ('pro')),
  title                text          not null check (char_length(title) between 1 and 80),
  price                numeric(10,2) not null check (price > 0),
  currency             text          not null default 'ETB' check (currency ~ '^[A-Z]{3}$'),
  access_days          integer       not null check (access_days > 0),
  payment_instructions text          not null,
  is_active            boolean       not null default true,
  sort_order           integer       not null default 0,
  created_at           timestamptz   not null default now(),
  updated_at           timestamptz   not null default now()
);

-- 6. Pro membership: one row per student, kept like course_access ------------------------
create table public.memberships (
  student_id uuid        not null references public.profiles(id) on delete cascade,
  tier       text        not null check (tier in ('pro')),
  expires_at timestamptz,                                 -- NULL means permanent (admin only)
  granted_at timestamptz not null default now(),
  source     text        not null check (source in ('payment','admin')),
  granted_by uuid        references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid        references public.profiles(id) on delete set null,
  primary key (student_id, tier)
);

-- 7. A payment request is for a course OR a plan -------------------------------------------
alter table public.payment_requests
  alter column course_id drop not null,
  add column plan_id text references public.plans(id);
alter table public.payment_requests
  add constraint payment_requests_target_check check ((course_id is null) <> (plan_id is null));
create index payment_requests_plan_review_idx
  on public.payment_requests(plan_id, status, created_at desc) where plan_id is not null;
create unique index payment_requests_pending_plan_image_uq
  on public.payment_requests(student_id, plan_id, proof_sha256)
  where status = 'pending' and plan_id is not null;

-- 8. Only the backend reaches the new tables ----------------------------------------------------
alter table public.student_profiles enable row level security;
alter table public.plans            enable row level security;
alter table public.memberships      enable row level security;
revoke all on table public.student_profiles, public.plans, public.memberships
  from public, anon, authenticated;
grant all on table public.student_profiles, public.plans, public.memberships to service_role;

commit;
