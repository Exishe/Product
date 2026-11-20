-- ADR-067: the nightly purge and staff logins.
-- Test cafés now come with a waiter and a kitchen login (address
-- <username>@staff.pativ.invalid). Two rules:
--   1. A café is a test café by its people: staff logins are left out of the
--      "every person is @pativ.test" check, so a test café is still purged,
--      and a café with a real owner is never touched.
--   2. After the cafés are gone, their staff-login users (now without any
--      member) are deleted too. A login that still belongs to a café is never
--      matched: it has a member row.

create or replace function private.purge_test_cafes(p_older_than interval default '1 day') returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_cutoff timestamptz := now() - p_older_than;
  v_ids uuid[];
  v_cafes integer;
  v_users integer := 0;
  v_user uuid;
begin
  -- A test café: not the demo, old enough, has an owner, and every person
  -- member has a @pativ.test address (device members have no real email).
  -- Staff logins (ADR-067) are ignored here: they have their own reserved
  -- address, which is not a @pativ.test one, and a café is judged by its
  -- people, not by the logins we made for it.
  select coalesce(array_agg(id), '{}') into v_ids from (
    select r.id
    from public.restaurants r
    where r.slug <> 'demo-cafe'
      and r.created_at < v_cutoff
      and exists (select 1 from public.members m where m.restaurant_id = r.id and m.role = 'owner')
      and not exists (
        select 1
        from public.members m
        left join auth.users u on u.id = m.user_id
        where m.restaurant_id = r.id
          and m.kind = 'person'
          and not exists (select 1 from public.staff_logins sl where sl.member_id = m.id)
          and coalesce(lower(u.email), '') not like '%@pativ.test'
      )
    order by r.created_at
    limit 1000
  ) t;

  -- Orders first: deleting a guest or table session (or a table) of a café
  -- would otherwise null columns that a QR / dine-in order must keep.
  delete from public.orders where restaurant_id = any (v_ids);
  with doomed as (
    delete from public.restaurants where id = any (v_ids) returning id
  )
  select count(*) into v_cafes from doomed;

  -- Test users left without any café. A user still referenced by a surviving
  -- row without cascade (created_by, invited_by) is skipped, not an error.
  for v_user in
    select u.id from auth.users u
    where lower(u.email) like '%@pativ.test'
      and u.created_at < v_cutoff
      and not exists (select 1 from public.members m where m.user_id = u.id)
      and not exists (select 1 from public.platform_admins a where a.user_id = u.id)
    limit 1000
  loop
    begin
      delete from auth.users where id = v_user;
      v_users := v_users + 1;
    exception when foreign_key_violation then
      null;
    end;
  end loop;

  -- Staff-login users whose café is gone (their member rows went with it).
  -- Only users with no member at all: a café that still exists keeps its logins.
  for v_user in
    select u.id from auth.users u
    where lower(u.email) like '%@' || private.staff_email_domain()
      and u.created_at < v_cutoff
      and not exists (select 1 from public.members m where m.user_id = u.id)
      and not exists (select 1 from public.platform_admins a where a.user_id = u.id)
    limit 2000
  loop
    begin
      delete from auth.users where id = v_user;
      v_users := v_users + 1;
    exception when foreign_key_violation then
      null;
    end;
  end loop;

  return jsonb_build_object('cafes', v_cafes, 'users', v_users);
end $$;

revoke execute on function private.purge_test_cafes(interval) from public, anon, authenticated;
