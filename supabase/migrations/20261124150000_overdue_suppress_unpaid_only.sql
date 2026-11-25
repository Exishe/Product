-- Correction to 20261124100000 (ADR-084): the owner-set table alert replaces the fixed
-- 20-minute ticket alert only for orders it can report. table.alert skips paid orders
-- (an order paid at the counter and then stuck in the kitchen), so for those the chat
-- still gets order.overdue; otherwise nobody would hear about it.

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
      -- the owner-set slow-table alert replaces the fixed 20-minute ticket alert,
      -- but only for unpaid orders: table.alert does not report paid ones
      and not (p_event = 'order.overdue' and 'table.alert' = any (c.events)
               and exists (select 1 from public.orders o
                           where o.id = (p_payload ->> 'order_id')::uuid and o.paid_at is null))
      and (c.kind = 'telegram' or exists (select 1 from public.push_subscriptions s where s.channel_id = c.id))
    on conflict (channel_id, dedupe_key) do nothing
    returning 1)
  select count(*)::integer from ins
$$;

revoke execute on function private.enqueue_notification(uuid, uuid, text, text, jsonb) from public, anon, authenticated;
