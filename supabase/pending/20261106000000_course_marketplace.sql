-- course_marketplace_schema  (NOT APPLIED; see README.md)
--
-- Paid courses with manual payment review, plus the main admin flag.
--
-- Additive only. No existing row is rewritten: every course gets price 0, so it
-- stays free, and every profile gets is_admin false. Nothing here deletes or
-- changes student progress, XP or streaks.
--
-- Two tables, two jobs:
--   payment_requests  the permanent history of what students submitted
--   course_access     the current permission, one row per student per course
begin;
set local lock_timeout = '5s';

-- 0. Pre-flight: fail clean if the live shape is not what this was written for -----
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='courses' and column_name='owner_id') then
    raise exception 'Course Studio must be applied first';
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='courses' and column_name='price') then
    raise exception 'courses already migrated';
  end if;
end $$;

-- 1. Courses: what it costs and how long access lasts --------------------------------
alter table public.courses
  add column price                numeric(10,2) not null default 0,  -- 0 means free
  add column currency             text          not null default 'ETB',
  add column access_days          integer,                           -- NULL means permanent
  add column payment_instructions text;
alter table public.courses
  add constraint courses_price_check       check (price >= 0),
  add constraint courses_currency_check    check (currency ~ '^[A-Z]{3}$'),
  add constraint courses_access_days_check check (access_days is null or access_days > 0);

-- 2. The main admin. Set by hand, never through the API ---------------------------------
alter table public.profiles
  add column is_admin boolean not null default false;

-- 3. Payment history -------------------------------------------------------------------------
-- amount, currency and access_days are a copy of what the student saw when submitting,
-- so a later price change cannot alter the deal or the history. There is no teacher_id:
-- the reviewer comes from courses.owner_id, so ownership lives in one place. student_id
-- and course_id do not cascade, so history cannot vanish with a course or an account.
create table public.payment_requests (
  id           uuid          primary key default gen_random_uuid(),
  student_id   uuid          not null references public.profiles(id),
  course_id    text          not null references public.courses(id),
  status       text          not null default 'pending'
               check (status in ('pending','approved','rejected')),
  amount       numeric(10,2) not null check (amount > 0),
  currency     text          not null check (currency ~ '^[A-Z]{3}$'),
  access_days  integer       check (access_days is null or access_days > 0),
  proof_path   text          not null,
  proof_type   text          not null check (proof_type in ('image/jpeg','image/png','image/webp')),
  proof_sha256 text          not null,
  reviewed_by  uuid          references public.profiles(id) on delete set null,
  reviewed_at  timestamptz,
  review_note  text,
  created_at   timestamptz   not null default now(),
  constraint payment_requests_decided_check check ((status = 'pending') = (reviewed_at is null))
);
create index payment_requests_review_idx  on public.payment_requests(course_id, status, created_at desc);
create index payment_requests_student_idx on public.payment_requests(student_id, created_at desc);
create index payment_requests_image_idx   on public.payment_requests(proof_sha256);
-- A double tap sends the same image twice. Only one of them may stay undecided.
create unique index payment_requests_pending_image_uq
  on public.payment_requests(student_id, course_id, proof_sha256) where status = 'pending';

-- 4. Current permission -------------------------------------------------------------------------
-- Free courses write no rows. Revoking fills revoked_at and keeps the row.
create table public.course_access (
  student_id uuid        not null references public.profiles(id) on delete cascade,
  course_id  text        not null references public.courses(id),
  expires_at timestamptz,                                -- NULL means permanent
  granted_at timestamptz not null default now(),
  source     text        not null check (source in ('payment','existing_learner','admin')),
  granted_by uuid        references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid        references public.profiles(id) on delete set null,
  primary key (student_id, course_id)
);
create index course_access_course_idx on public.course_access(course_id);

-- 5. Only the backend reaches these tables ----------------------------------------------------
alter table public.payment_requests enable row level security;
alter table public.course_access    enable row level security;
revoke all on table public.payment_requests, public.course_access from public, anon, authenticated;
grant all on table public.payment_requests, public.course_access to service_role;

-- 6. Private bucket for payment screenshots ---------------------------------------------------
-- No policies on purpose: only the backend's service key can reach it.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('payment-proofs', 'payment-proofs', false, 5242880,
            array['image/jpeg','image/png','image/webp'])
    on conflict (id) do nothing;
  end if;
end $$;

commit;
