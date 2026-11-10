-- Task 11.2 security review (docs/06-build/security-review.md).
--
-- M-1: a web push subscription may only point at a browser's push service.
--      /api/push posts to the stored endpoint, so any other host would let a
--      café owner make the server send requests to a host of their choosing.
-- L-1: storage paths kept on menu rows stay inside the café's own folder, the
--      same shape the editor writes. Owners and managers can update these rows
--      directly through RLS, so the rule lives on the table, not in an RPC.
--
-- No new functions or tables: nothing to revoke or grant.

-- M-1 -------------------------------------------------------------------------
-- A row that fails the rule could never have received a push, so it goes.
delete from public.push_subscriptions
where endpoint !~ '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)/';

alter table public.push_subscriptions
  add constraint push_subscriptions_endpoint_push_service check (
    endpoint ~ '^https://([a-z0-9-]+\.)*(fcm\.googleapis\.com|android\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)/'
  );

-- L-1 -------------------------------------------------------------------------
-- NOT VALID: rows written before this migration are left as they are; every
-- insert and update from now on is checked.
alter table public.items
  add constraint items_image_path_scoped check (
    image_path is null
    or image_path ~ ('^' || restaurant_id::text || '/items/' || id::text || '/[0-9]+\.webp$')
  ) not valid;

alter table public.categories
  add constraint categories_image_path_scoped check (
    image_path is null
    or (image_path like restaurant_id::text || '/%' and image_path !~ '(^|/)\.\.(/|$)')
  ) not valid;

alter table public.restaurants
  add constraint restaurants_logo_path_scoped check (
    logo_path is null
    or (logo_path like id::text || '/%' and logo_path !~ '(^|/)\.\.(/|$)')
  ) not valid;
