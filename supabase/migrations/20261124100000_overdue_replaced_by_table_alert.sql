-- One late-order message per chat, not two (ADR-071, addendum in ADR-084).
--
-- The kitchen's fixed "ticket cooking for 20 minutes" alert (order.overdue) and the
-- owner-set "table waiting N minutes" alert (table.alert, ADR-071) describe the same
-- late order. A chat that receives table.alert already gets it at the limit the owner
-- chose, so order.overdue is no longer queued for that chat. A chat that only has
-- order.overdue behaves exactly as before. Nothing is deleted; the owner can still
-- switch either event off in the Telegram settings.

create or replace function private.enqueue_notification(
  p_restaurant_id uuid, p_location_id uuid, p_event text, p_dedupe_key text, p_payload jsonb
) returns integer
language sql security definer set search_path = '' as $$
  with ins as (
    insert into public.notification_outbox (restaurant_id, channel_id, event, dedupe_key, payload)
    select p_restaurant_id, c.id, p_event, p_dedupe_key, p_payload
    from public.notification_channels c
    where c.restaurant_id = p_restaurant_id and c.is_active
      and (c.location_id is null or p_location_id is null or c.location_id = p_location_id)
      and p_event = any (c.events)
      -- the owner-set slow-table alert replaces the fixed 20-minute ticket alert
      and not (p_event = 'order.overdue' and 'table.alert' = any (c.events))
      and (c.kind = 'telegram' or exists (select 1 from public.push_subscriptions s where s.channel_id = c.id))
    on conflict (channel_id, dedupe_key) do nothing
    returning 1)
  select count(*)::integer from ins
$$;

revoke execute on function private.enqueue_notification(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
