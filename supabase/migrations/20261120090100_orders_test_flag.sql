-- Dashboard test data (ADR-066): a demo café's dashboard is full of old test
-- orders. Every dashboard, metrics and export query already leaves out orders
-- with is_test, but nothing could set the flag. This lets an owner or manager
-- flag (or un-flag) the orders of a range of business days. Nothing is
-- deleted, so it can be undone.
create function api.set_orders_test(p_location_id uuid, p_from date, p_to date, p_is_test boolean) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_count integer;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  if p_from is null or p_to is null or p_is_test is null or p_from > p_to or p_to - p_from > 366 then
    raise exception using errcode = '22023', message = 'invalid_range';
  end if;
  select l.restaurant_id into v_restaurant from public.locations l where l.id = p_location_id;

  update public.orders o set is_test = p_is_test
  where o.location_id = p_location_id and o.business_date between p_from and p_to
    and o.is_test is distinct from p_is_test;
  get diagnostics v_count = row_count;

  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, data)
  values (v_restaurant, p_location_id, 'member', auth.uid(), 'orders.test_flag', 'order',
          jsonb_build_object('from', p_from, 'to', p_to, 'is_test', p_is_test, 'orders', v_count));
  return v_count;
end $$;

revoke execute on function api.set_orders_test(uuid, date, date, boolean) from public, anon, authenticated;
grant execute on function api.set_orders_test(uuid, date, date, boolean) to authenticated;
