-- Every ingredient that is out now, with its names, for the kitchen's "Ingredient
-- out" list (ADR-076). public.ingredients is owner-only under RLS and
-- api.search_ingredients returns at most 30, so staff could not name (and so not
-- bring back) every outage. Callable by the same people as api.set_ingredient_out.
create function api.list_ingredient_outages(p_location_id uuid)
returns table (id uuid, names jsonb, out_at timestamptz, source text)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.assert_location_role(p_location_id, '{owner,manager,kitchen,waiter}');
  return query
  select o.ingredient_id, private.ingredient_names(o.ingredient_id), o.out_at, o.source
  from public.ingredient_outages o
  where o.location_id = p_location_id and o.until > now()
  order by o.out_at desc, o.ingredient_id;
end $$;

revoke execute on function api.list_ingredient_outages(uuid) from public, anon, authenticated;
grant execute on function api.list_ingredient_outages(uuid) to authenticated;
