-- course_marketplace_rollback  (only before anyone has used it)
--
-- Refuses to run once a course has a price, a request or access row exists, or an
-- admin has been set. After that, payment history must be kept: stop the backend
-- routes instead of dropping anything.
begin;
set local lock_timeout = '5s';

do $$
begin
  if exists (select 1 from public.payment_requests)
     or exists (select 1 from public.course_access)
     or exists (select 1 from public.courses where price > 0)
     or exists (select 1 from public.profiles where is_admin) then
    raise exception 'REFUSED: the marketplace is in use, so its data must be kept';
  end if;
end $$;

drop table public.course_access;
drop table public.payment_requests;
alter table public.profiles drop column is_admin;
alter table public.courses
  drop column payment_instructions,
  drop column access_days,
  drop column currency,
  drop column price;

do $$
begin
  if to_regclass('storage.buckets') is not null then
    delete from storage.buckets where id = 'payment-proofs';
  end if;
end $$;

commit;
