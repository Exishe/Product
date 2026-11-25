-- Staff sounds (ADR-088): the owner chooses which of the built-in sounds the
-- kitchen plays for a new order and which one the waiters hear when a guest
-- calls or asks for the bill. The sounds themselves are synthesized in the
-- browser (src/lib/sounds/library.ts); the database only keeps the two names.
-- Staff screens already read their location row (locations_read lets any
-- member of the café select it), so no new read path is needed.

-- The ids the app knows. A new sound is a new migration that widens this check.
alter table public.locations
  add column order_sound text not null default 'bell',
  add column call_sound text not null default 'doorbell',
  add constraint locations_order_sound_known
    check (order_sound in ('bell', 'chime', 'doorbell', 'marimba', 'triple', 'pop', 'alarm', 'gong', 'service', 'timer', 'xylophone', 'harp', 'ship', 'coin')),
  add constraint locations_call_sound_known
    check (call_sound in ('bell', 'chime', 'doorbell', 'marimba', 'triple', 'pop', 'alarm', 'gong', 'service', 'timer', 'xylophone', 'harp', 'ship', 'coin'));
-- No client write grant on these columns: api.set_staff_sounds changes them.

create function api.set_staff_sounds(p_location_id uuid, p_order_sound text, p_call_sound text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_ids constant text[] := array['bell', 'chime', 'doorbell', 'marimba', 'triple', 'pop', 'alarm', 'gong', 'service', 'timer', 'xylophone', 'harp', 'ship', 'coin'];
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  if p_order_sound is null or not (p_order_sound = any (v_ids)) then
    raise exception using errcode = '22023', message = 'invalid_order_sound';
  end if;
  if p_call_sound is null or not (p_call_sound = any (v_ids)) then
    raise exception using errcode = '22023', message = 'invalid_call_sound';
  end if;

  update public.locations
  set order_sound = p_order_sound, call_sound = p_call_sound
  where id = p_location_id
  returning restaurant_id into v_restaurant;

  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, p_location_id, 'member', auth.uid(), 'sounds.settings', 'location', p_location_id,
          jsonb_build_object('order_sound', p_order_sound, 'call_sound', p_call_sound));
end $$;

revoke execute on function api.set_staff_sounds(uuid, text, text) from public, anon, authenticated;
grant execute on function api.set_staff_sounds(uuid, text, text) to authenticated;
