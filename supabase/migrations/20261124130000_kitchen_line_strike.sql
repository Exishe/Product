-- ADR-087: struck lines of a ticket in Cooking are shared between kitchen screens.
--
-- A cook strikes a dish off a ticket when it is plated (item-level bump). Until
-- now that lived in one browser tab, so two kitchen screens, or a reload,
-- disagreed. The strike is now a column on the ticket's lines, written only by
-- api.set_line_struck and read by the board through the existing RLS policy.
--
-- * kitchen_ticket_items.struck_at: when the line was struck; null = not struck.
-- * api.set_line_struck(ticket, order line, struck): kitchen, manager or owner
--   of the ticket's location (the same people who move it from Cooking to
--   Ready); only on an order ticket in Cooking; idempotent. Returns true when
--   every line still wanted on the ticket is now struck, so the caller can move
--   the ticket on even when another screen struck the other lines a moment ago.
-- * A strike that really changes something touches the ticket so the other
--   screens hear about it. The broadcast trigger of kitchen_tickets listens to
--   "update of status, acknowledged_at", and Postgres fires such a trigger when
--   a column is named in the SET list even if the value is the same, so the
--   update sets status to itself (the touch trigger moves updated_at; the
--   history trigger only fires when the status differs, the order-status
--   trigger finds nothing to change).
-- * When a ticket leaves Cooking (ready, cancelled) its strikes are cleared, so
--   undoing a wrong "ready" starts the ticket fresh, as the browser-only
--   version did.
--
-- Lock order (ADR-064): order, then ticket. The strike updates only
-- kitchen_ticket_items, which takes no lock on the order line it points to.

alter table public.kitchen_ticket_items add column struck_at timestamptz;

-- The table is read through the existing select policy and the blanket select
-- grant (new columns included); nobody writes it directly (no insert/update grant).

create function api.set_line_struck(p_ticket_id uuid, p_order_item_id uuid, p_struck boolean)
returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_order_id uuid;
  v_location_id uuid;
  v_kind public.ticket_kind;
  v_t public.kitchen_tickets;
  v_changed integer;
begin
  if p_struck is null then
    raise exception using errcode = 'RS422', message = 'invalid_argument';
  end if;

  -- Who may: looked up without a lock, so a caller who may not locks nothing.
  select order_id, location_id, kind into v_order_id, v_location_id, v_kind
  from public.kitchen_tickets where id = p_ticket_id;
  if not found or v_kind <> 'order' then
    raise exception using errcode = 'P0002', message = 'ticket_not_found';
  end if;
  perform private.assert_location_role(v_location_id, '{owner,manager,kitchen}');

  -- 1. the order, 2. the ticket (ADR-064), then read what we decide on
  perform 1 from public.orders where id = v_order_id for update;
  select * into v_t from public.kitchen_tickets where id = p_ticket_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ticket_not_found';
  end if;
  if v_t.status <> 'cooking' then
    raise exception using errcode = 'RS409', message = 'stale_status', detail = v_t.status::text;
  end if;

  update public.kitchen_ticket_items
  set struck_at = case when p_struck then now() else null end
  where ticket_id = p_ticket_id and order_item_id = p_order_item_id
    and (struck_at is not null) is distinct from p_struck;
  get diagnostics v_changed = row_count;

  if v_changed > 0 then
    -- Tell the other screens: the broadcast trigger fires on "status" in the SET list.
    update public.kitchen_tickets set status = status where id = p_ticket_id;
  elsif not exists (select 1 from public.kitchen_ticket_items
                    where ticket_id = p_ticket_id and order_item_id = p_order_item_id) then
    raise exception using errcode = 'P0002', message = 'line_not_found';
  end if;

  -- Done when every line still wanted (not fully cancelled) is struck.
  return coalesce((
    select bool_and(k.struck_at is not null)
    from public.kitchen_ticket_items k
    join public.order_items oi on oi.id = k.order_item_id
    where k.ticket_id = p_ticket_id
      and least(k.quantity, oi.quantity - oi.cancelled_quantity) > 0
  ), false);
end $$;

revoke execute on function api.set_line_struck(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function api.set_line_struck(uuid, uuid, boolean) to authenticated;

-- A ticket that leaves Cooking forgets its strikes.
create function private.clear_struck_lines() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.kitchen_ticket_items set struck_at = null
  where ticket_id = new.id and struck_at is not null;
  return null;
end $$;
revoke execute on function private.clear_struck_lines() from public, anon, authenticated;

create trigger kitchen_tickets_clear_struck after update of status on public.kitchen_tickets
  for each row when (old.status = 'cooking' and new.status <> 'cooking')
  execute function private.clear_struck_lines();
