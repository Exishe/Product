-- "Kitchen busy" switch (ADR-033, day-in-the-life.md 20:10). The kitchen
-- screen, the owner or a manager sets an expected wait of 20, 30 or 45 minutes;
-- guests see it on the menu and their status page (api.public_menu). It turns
-- itself off after an hour; null switches it off at once.

create function api.set_kitchen_busy(p_location_id uuid, p_minutes integer)
returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_until timestamptz;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager,kitchen}');
  if p_minutes is not null and p_minutes not in (20, 30, 45) then
    raise exception using errcode = '22023', message = 'invalid_minutes';
  end if;
  v_until := case when p_minutes is not null then now() + interval '1 hour' end;

  update public.locations
  set kitchen_busy_until = v_until, expected_wait_minutes = p_minutes
  where id = p_location_id
  returning restaurant_id into v_restaurant;

  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, p_location_id, 'member', auth.uid(),
          case when p_minutes is null then 'kitchen.busy_off' else 'kitchen.busy_on' end,
          'location', p_location_id, jsonb_build_object('minutes', p_minutes, 'until', v_until));

  -- Other screens of the location (bar, waiter tablet) update at once.
  perform realtime.send(jsonb_build_object('id', p_location_id, 'kitchen_busy_until', v_until,
                                           'expected_wait_minutes', p_minutes),
                        'location', 'loc:' || p_location_id, true);
  return v_until;
end $$;

revoke execute on function api.set_kitchen_busy(uuid, integer) from public, anon, authenticated;
grant execute on function api.set_kitchen_busy(uuid, integer) to authenticated;
