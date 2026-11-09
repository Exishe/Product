-- Menu from a photo (Task 9.2): start, register photos, save the reading,
-- apply it as unreviewed AI text, and the review rules that let it publish.
-- Runs after menu_editor.sql (café E has a menu with a few dishes).
\set ON_ERROR_STOP 1
\set QUIET 1
\pset tuples_only on
\pset format unaligned

reset role;
select set_config('request.jwt.claims', '', false);
select id as rd from public.restaurants where slug = 'cafe-d' \gset
select id as re from public.restaurants where slug = 'cafe-e' \gset
select count(*) as cats_before from public.categories where restaurant_id = :'re' \gset
select count(*) as dishes_before from public.items where restaurant_id = :'re' \gset

-- Starting, and who may
select test.act_as('d0000000-0000-0000-0000-000000000006');
select api.start_menu_import(:'re') as imp \gset
select test.ok((select status = 'uploaded' and created_by = 'd0000000-0000-0000-0000-000000000006'
                from public.menu_imports where id = :'imp'), 'an import starts as uploaded, owned by its creator');
select test.act_as('d0000000-0000-0000-0000-000000000001');
select test.fails(format('select api.start_menu_import(%L)', :'re'), 'forbidden', 'another café''s owner cannot start one');
select test.fails(format('select api.save_menu_import_draft(%L, %L)', :'imp', '{"categories": []}'), 'forbidden',
  'or write into this café''s import');
select test.act_as('d0000000-0000-0000-0000-000000000002', true);
select test.fails(format('select api.start_menu_import(%L)', :'re'), 'forbidden', 'nor can a guest');

-- Photos must sit in the import's own folder
select test.act_as('d0000000-0000-0000-0000-000000000006');
select test.fails(format('select api.add_menu_import_images(%L, %L)', :'imp', array[:'rd' || '/' || :'imp' || '/1.jpg']),
  'forbidden', 'a photo path in another café''s folder is refused');
select test.fails(format('select api.add_menu_import_images(%L, %L)', :'imp', array[:'re' || '/' || :'imp' || '/../x.jpg']),
  'forbidden', 'a path that climbs out of the folder is refused');
select test.fails(format('select api.add_menu_import_images(%L, %L::text[])', :'imp', '{}'), 'invalid_pages', 'an import needs a photo');
select api.add_menu_import_images(:'imp', array[:'re' || '/' || :'imp' || '/1.jpg', :'re' || '/' || :'imp' || '/2.jpg']);
select test.ok((select count(*) from public.menu_import_images where import_id = :'imp') = 2
               and (select status from public.menu_imports where id = :'imp') = 'processing', 'two pages registered, now processing');

-- The reading, with one dish lacking a price
select api.save_menu_import_draft(:'imp', $json${
  "source_locale": "hy",
  "categories": [
    {"names": {"hy": "Աղցաններ", "ru": "Салаты", "en": "Salads"}, "items": [
      {"names": {"hy": "Ամառային աղցան", "ru": "Летний салат", "en": "Summer salad"},
       "descriptions": {"hy": "Լոլիկ, վարունգ", "ru": "Помидоры, огурцы", "en": "Tomatoes, cucumbers"},
       "price_amd": 1800, "price_text": "1 800 դր.", "confidence": 0.95, "variants": [], "reviewed": true},
      {"names": {"hy": "Կեսարի աղցան", "ru": "Салат Цезарь", "en": "Caesar salad"},
       "descriptions": {"hy": "", "ru": "", "en": ""},
       "price_amd": null, "price_text": "", "confidence": 0.3, "variants": [], "reviewed": false}]},
    {"names": {"hy": "Ըմպելիքներ", "ru": "Напитки", "en": "Drinks"}, "items": [
      {"names": {"hy": "Թան", "ru": "Тан", "en": "Tan"}, "descriptions": {"hy": "", "ru": "", "en": ""},
       "price_amd": 600, "price_text": "600 / 900", "confidence": 0.5, "reviewed": false, "variants": [
         {"names": {"hy": "0.33 լ", "ru": "0,33 л", "en": "0.33 l"}, "price_amd": 600, "price_text": "600"},
         {"names": {"hy": "0.5 լ", "ru": "0,5 л", "en": "0.5 l"}, "price_amd": 900, "price_text": "900"}]}]},
    {"names": {"hy": "Դատարկ", "ru": "", "en": ""}, "items": []}
  ]}$json$::jsonb, 'gemini-3-flash-preview', 1600, 900);
select test.ok((select status = 'needs_review' and model = 'gemini-3-flash-preview' and input_tokens = 1600
                from public.menu_imports where id = :'imp'), 'the reading is saved for review');
select test.fails(format('select api.save_menu_import_draft(%L, %L)', :'imp', '{"categories": "x"}'), 'invalid_draft',
  'a draft without a list of sections is refused');
select test.fails(format('select api.apply_menu_import(%L)', :'imp'), 'price_required', 'a dish without a price stops the apply');
select test.ok((select count(*) from public.categories where restaurant_id = :'re') = :cats_before,
  'and nothing of it is left behind');

-- The owner fixes the price and applies
select api.save_menu_import_draft(:'imp', jsonb_set(draft, '{categories,0,items,1,price_amd}', '2800'))
  from public.menu_imports where id = :'imp';
select test.ok(api.apply_menu_import(:'imp') = 3, 'apply creates the three dishes');
select test.ok((select count(*) from public.categories where restaurant_id = :'re') = :cats_before + 2,
  'in two new sections (the empty one is skipped)');
select id as summer from public.items i where restaurant_id = :'re'
  and exists (select 1 from public.item_translations t where t.item_id = i.id and t.name = 'Ամառային աղցան') \gset
select id as caesar from public.items i where restaurant_id = :'re'
  and exists (select 1 from public.item_translations t where t.item_id = i.id and t.name = 'Կեսարի աղցան') \gset
select id as tan from public.items i where restaurant_id = :'re'
  and exists (select 1 from public.item_translations t where t.item_id = i.id and t.name = 'Թան') \gset
select test.ok((select price from public.items where id = :'caesar') = 2800, 'with the price the owner typed');
select test.ok((select bool_and(source = 'ai') and count(*) = 3 from public.item_translations where item_id = :'summer'),
  'every name is marked as AI text');
select test.ok((select bool_and(reviewed_at is not null) from public.item_translations where item_id = :'summer'),
  'the dish the owner ticked is reviewed');
select test.ok((select bool_and(reviewed_at is null) from public.item_translations where item_id = :'caesar'),
  'the others are not');
select test.ok((select description from public.item_translations where item_id = :'summer' and locale = 'ru') = 'Помидоры, огурцы',
  'descriptions come along');
select test.ok((select bool_and(t.reviewed_at is null) from public.category_translations t
                join public.items i on i.category_id = t.category_id where i.id = :'summer'),
  'a section with an unticked dish is not reviewed');
select test.ok((select array_agg(m.price_delta order by m.sort) from public.modifiers m
                join public.item_modifier_groups g on g.group_id = m.group_id where g.item_id = :'tan') = '{0,300}',
  'sizes become a required choice priced from the dish');
select test.ok((select min_select = 1 and max_select = 1 from public.modifier_groups mg
                join public.item_modifier_groups g on g.group_id = mg.id where g.item_id = :'tan'), 'pick exactly one size');
select test.ok((select status = 'applied' and applied_by = 'd0000000-0000-0000-0000-000000000006'
                from public.menu_imports where id = :'imp'), 'the import is closed');
select test.fails(format('select api.apply_menu_import(%L)', :'imp'), 'import_closed', 'and cannot be applied twice');

-- Publishing waits for the review
select id as eloc from public.locations where restaurant_id = :'re' \gset
select test.fails(format('select api.publish_menu(%L)', :'eloc'), 'unreviewed_ai_translations',
  'the menu does not publish with unreviewed AI names');
select api.save_item(:'re', jsonb_build_object('id', :'caesar', 'category_id', category_id, 'price', price,
  'names', '{"hy": "Կեսարի աղցան", "ru": "Салат Цезарь", "en": "Caesar salad"}'::jsonb, 'mark_reviewed', true))
  from public.items where id = :'caesar';
select test.ok((select bool_and(t.reviewed_at is not null) from public.category_translations t
                join public.items i on i.category_id = t.category_id where i.id = :'caesar'),
  'reviewing the last dish of a section reviews the section');
select test.fails(format('select api.publish_menu(%L)', :'eloc'), 'unreviewed_ai_translations', 'the drinks are still unchecked');
select api.save_item(:'re', jsonb_build_object('id', :'tan', 'category_id', category_id, 'price', price,
  'names', '{"hy": "Թան", "ru": "Тан", "en": "Tan"}'::jsonb, 'mark_reviewed', true))
  from public.items where id = :'tan';
select test.ok((select bool_and(t.reviewed_at is not null) from public.modifier_translations t
                join public.modifiers m on m.id = t.modifier_id
                join public.item_modifier_groups g on g.group_id = m.group_id where g.item_id = :'tan'),
  'reviewing a dish reviews its sizes');
select test.ok(api.publish_menu(:'eloc') is not null, 'with everything checked, the menu publishes');
select test.ok((select item_count from public.menu_versions v join public.locations l on l.published_menu_version_id = v.id
                where l.id = :'eloc') = :dishes_before + 3, 'with the imported dishes in it');

-- Discarding, and failures
select api.start_menu_import(:'re') as imp2 \gset
select api.fail_menu_import(:'imp2', 'not_a_menu');
select test.ok((select status = 'failed' and error = 'not_a_menu' from public.menu_imports where id = :'imp2'), 'a failed reading keeps its reason');
select api.discard_menu_import(:'imp2');
select test.ok((select status from public.menu_imports where id = :'imp2') = 'discarded', 'and can be discarded');
select test.fails(format('select api.discard_menu_import(%L)', :'imp'), 'import_closed', 'an applied import cannot be discarded');

reset role;
select set_config('request.jwt.claims', '', false);
select test.ok((select file_size_limit = 4194304 from storage.buckets where id = 'menu-imports'),
  'paper-menu photos are limited to 4 MB');

\echo 'MENU IMPORT TESTS PASSED'
