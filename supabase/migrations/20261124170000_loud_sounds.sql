-- Six loud, high sounds for noisy kitchens and floors (ADR-088 addendum, owner request 25 Nov):
-- pager, smoke alarm, whistle, phone ring, bicycle bell, siren. Widens the two checks and
-- the list api.set_staff_sounds accepts. The sounds are synthesized in the browser.

alter table public.locations
  drop constraint locations_order_sound_known,
  drop constraint locations_call_sound_known,
  add constraint locations_order_sound_known check (order_sound in ('bell', 'chime', 'doorbell', 'marimba', 'triple', 'pop', 'alarm', 'gong', 'service', 'timer', 'xylophone', 'harp', 'ship', 'coin', 'pager', 'smoke', 'whistle', 'phone', 'bikebell', 'siren')),
  add constraint locations_call_sound_known check (call_sound in ('bell', 'chime', 'doorbell', 'marimba', 'triple', 'pop', 'alarm', 'gong', 'service', 'timer', 'xylophone', 'harp', 'ship', 'coin', 'pager', 'smoke', 'whistle', 'phone', 'bikebell', 'siren'));

create or replace function api.set_staff_sounds(p_location_id uuid, p_order_sound text, p_call_sound text)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_ids constant text[] := array['bell', 'chime', 'doorbell', 'marimba', 'triple', 'pop', 'alarm', 'gong', 'service', 'timer', 'xylophone', 'harp', 'ship', 'coin', 'pager', 'smoke', 'whistle', 'phone', 'bikebell', 'siren'];
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
