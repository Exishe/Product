-- Demo café «Դեմո սրճարան» / "Demo Café" (slug demo-cafe, location main).
-- Fictional. Prices are plausible for central Yerevan in 2026 and copy no real café.
-- Runs on a fresh database (supabase db reset) and on the dev project; a second
-- run changes nothing. Pure SQL, no psql commands, so the Supabase CLI can run it.
do $seed$
declare
  v_owner uuid := '0e000000-0000-4000-8000-000000000001';
  v_email text := 'owner@demo.pativ.test';
  v_password text;
  v_r uuid;
  v_l uuid;
  v_menu uuid;
  v_bar_area uuid;
  v_bar_station uuid;
  v_hall uuid;
  v_terrace uuid;
  v_cat uuid;
  v_item uuid;
  v_ids jsonb := '{}';
  v_sugar uuid;
  v_size uuid;
  v_milk uuid;
  v_mod uuid;
  c record;
  i record;
begin
  if exists (select 1 from public.restaurants where slug = 'demo-cafe') then
    raise notice 'demo café already seeded';
    return;
  end if;

  -- The demo owner. On Supabase a full auth user with a password generated now
  -- and shown once; on the plain-Postgres test harness a bare row.
  if exists (select 1 from information_schema.columns
             where table_schema = 'auth' and table_name = 'users' and column_name = 'encrypted_password') then
    -- A caller may pass the password (pativ.seed_owner_password) so tests can sign in.
    v_password := coalesce(nullif(current_setting('pativ.seed_owner_password', true), ''),
                           translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/', '-_'));
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', v_owner, 'authenticated', 'authenticated', v_email,
            extensions.crypt(v_password, extensions.gen_salt('bf')), now(),
            '{"provider": "email", "providers": ["email"]}', '{}', now(), now(), '', '', '', '');
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (v_owner::text, v_owner,
            jsonb_build_object('sub', v_owner::text, 'email', v_email, 'email_verified', true),
            'email', now(), now(), now());
    raise notice 'demo owner: % / % (shown once; keep it in .env.local)', v_email, v_password;
  else
    insert into auth.users (id, email) values (v_owner, v_email);
  end if;

  -- Act as the owner for the api.* calls below.
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_owner, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  v_r := api.create_restaurant('Դեմո սրճարան', 'demo-cafe', 'Կենտրոն', 'Դեմո');
  select id into v_l from public.locations where restaurant_id = v_r;

  -- The demo never runs out of its plan.
  update public.subscriptions
  set status = 'active', current_period_end = now() + interval '10 years', notes = 'demo café'
  where location_id = v_l;

  -- Menu, bar station
  insert into public.menus (restaurant_id, internal_name) values (v_r, 'Main') returning id into v_menu;
  insert into public.menu_locations (restaurant_id, menu_id, location_id) values (v_r, v_menu, v_l);
  insert into public.menu_translations (restaurant_id, menu_id, locale, name) values
    (v_r, v_menu, 'hy', 'Ճաշացանկ'), (v_r, v_menu, 'ru', 'Меню'), (v_r, v_menu, 'en', 'Menu');
  insert into public.prep_areas (restaurant_id, name) values (v_r, 'Bar') returning id into v_bar_area;
  insert into public.stations (restaurant_id, location_id, name) values (v_r, v_l, 'Bar') returning id into v_bar_station;
  insert into public.station_prep_areas (restaurant_id, location_id, prep_area_id, station_id)
  values (v_r, v_l, v_bar_area, v_bar_station);

  -- Categories and dishes
  for c in
    select * from (values
      (1, 'breakfast', false, 'Նախաճաշ', 'Завтрак', 'Breakfast'),
      (2, 'salads', false, 'Աղցաններ', 'Салаты', 'Salads'),
      (3, 'hot', false, 'Տաք ուտեստներ', 'Горячие блюда', 'Hot dishes'),
      (4, 'grill', false, 'Խորոված', 'Хоровац', 'Khorovats'),
      (5, 'bakery', false, 'Թխվածքներ', 'Выпечка', 'Bakery'),
      (6, 'desserts', false, 'Աղանդեր', 'Десерты', 'Desserts'),
      (7, 'coffee', true, 'Սուրճ և թեյ', 'Кофе и чай', 'Coffee and tea'),
      (8, 'drinks', true, 'Ըմպելիքներ', 'Напитки', 'Drinks')
    ) as t(sort, key, bar, hy, ru, en)
  loop
    insert into public.categories (restaurant_id, menu_id, sort, prep_area_id)
    values (v_r, v_menu, c.sort, case when c.bar then v_bar_area end) returning id into v_cat;
    insert into public.category_translations (restaurant_id, category_id, locale, name) values
      (v_r, v_cat, 'hy', c.hy), (v_r, v_cat, 'ru', c.ru), (v_r, v_cat, 'en', c.en);

    for i in
      select * from (values
        ('breakfast', 1, 'eggs', 1800, 'Լոլիկով ձվածեղ', 'Яичница с помидорами', 'Scrambled eggs with tomatoes', null, null, null, false),
        ('breakfast', 2, 'zhingyalov', 1500, 'Ժենգյալով հաց', 'Женгялов хац', 'Zhingyalov hats',
          'Բարակ խմոր՝ լցոնված կանաչիներով', 'Тонкая лепёшка с зеленью', 'Thin flatbread filled with herbs', false),
        ('breakfast', 3, 'syrniki', 1900, 'Կաթնաշոռով բլիթներ', 'Сырники', 'Cottage cheese pancakes',
          'Թթվասերով և մուրաբայով', 'Со сметаной и вареньем', 'With sour cream and jam', false),
        ('breakfast', 4, 'armenian-breakfast', 3500, 'Հայկական նախաճաշ', 'Армянский завтрак', 'Armenian breakfast',
          'Պանիր, կանաչի, ձու, լավաշ և մածուն', 'Сыр, зелень, яйцо, лаваш и мацун', 'Cheese, herbs, egg, lavash and matsoni', false),
        ('breakfast', 5, 'oatmeal', 1600, 'Վարսակի շիլա մրգերով', 'Овсяная каша с фруктами', 'Oatmeal with fruit', null, null, null, false),
        ('salads', 1, 'summer-salad', 1600, 'Ամառային աղցան', 'Летний салат', 'Summer salad',
          'Լոլիկ, վարունգ, կանաչի', 'Помидоры, огурцы, зелень', 'Tomatoes, cucumbers, herbs', false),
        ('salads', 2, 'caesar', 3100, 'Ցեզար աղցան հավով', 'Цезарь с курицей', 'Caesar salad with chicken', null, null, null, false),
        ('salads', 3, 'eggplant-salad', 1900, 'Բադրիջանի աղցան', 'Салат из баклажанов', 'Eggplant salad', null, null, null, false),
        ('salads', 4, 'greek-salad', 2400, 'Հունական աղցան', 'Греческий салат', 'Greek salad', null, null, null, false),
        ('salads', 5, 'herbs', 1200, 'Թարմ կանաչի', 'Свежая зелень', 'Fresh herbs', null, null, null, false),
        ('hot', 1, 'tolma', 3200, 'Տոլմա', 'Толма', 'Tolma',
          'Աղացած միս և բրինձ՝ խաղողի տերևի մեջ, մածունով', 'Фарш с рисом в виноградных листьях, с мацуном',
          'Minced meat and rice in grape leaves, with matsoni', false),
        ('hot', 2, 'khashlama', 4500, 'Խաշլամա', 'Хашлама', 'Khashlama',
          'Գառան միս՝ եփված բանջարեղենով', 'Баранина, тушённая с овощами', 'Lamb stewed with vegetables', true),
        ('hot', 3, 'harissa', 2800, 'Հարիսա', 'Ариса', 'Harissa',
          'Հավով ցորենի շիլա', 'Пшеничная каша с курицей', 'Wheat porridge with chicken', false),
        ('hot', 4, 'spas', 1500, 'Սպաս', 'Спас', 'Spas',
          'Մածունով և ձավարով ապուր', 'Суп из мацуна с пшеничной крупой', 'Yogurt soup with wheat', true),
        ('hot', 5, 'kyufta', 3800, 'Քյուֆթա', 'Кюфта', 'Kyufta',
          'Ծեծած մսից գնդիկներ՝ կարագով', 'Тефтели из отбитого мяса со сливочным маслом', 'Pounded beef balls with butter', false),
        ('hot', 6, 'trout', 5200, 'Սևանի իշխան', 'Форель ишхан', 'Sevan trout',
          'Թոնրում թխված', 'Запечённая в тонире', 'Baked in a tonir', false),
        ('grill', 1, 'pork-ribs', 4200, 'Խոզի չալաղաջ', 'Хоровац из свиной корейки', 'Pork rib khorovats', null, null, null, false),
        ('grill', 2, 'chicken', 3300, 'Հավի խորոված', 'Хоровац из курицы', 'Chicken khorovats', null, null, null, false),
        ('grill', 3, 'lamb', 5500, 'Գառան խորոված', 'Хоровац из баранины', 'Lamb khorovats', null, null, null, false),
        ('grill', 4, 'lula', 2900, 'Լյուլյա քյաբաբ', 'Люля-кебаб', 'Lula kebab', null, null, null, false),
        ('grill', 5, 'veg-grill', 1900, 'Բանջարեղենի խորոված', 'Овощи на мангале', 'Grilled vegetables', null, null, null, false),
        ('bakery', 1, 'gata', 900, 'Գաթա', 'Гата', 'Gata',
          'Քաղցր շերտավոր խմորեղեն', 'Сладкая слоёная выпечка', 'Sweet layered pastry', false),
        ('bakery', 2, 'lahmajo', 900, 'Լահմաջո', 'Лахмаджо', 'Lahmajo',
          'Բարակ խմոր՝ աղացած մսով և համեմունքներով', 'Тонкая лепёшка с фаршем и специями', 'Thin flatbread with minced meat and spices', false),
        ('bakery', 3, 'lavash', 300, 'Լավաշ', 'Лаваш', 'Lavash', null, null, null, false),
        ('bakery', 4, 'meat-pie', 700, 'Մսով կարկանդակ', 'Пирожок с мясом', 'Meat pie', null, null, null, false),
        ('desserts', 1, 'baklava', 1200, 'Փախլավա', 'Пахлава', 'Baklava', null, null, null, false),
        ('desserts', 2, 'napoleon', 1400, 'Նապոլեոն', 'Наполеон', 'Napoleon cake', null, null, null, false),
        ('desserts', 3, 'sujukh', 1000, 'Սուջուխ', 'Суджух', 'Sujukh',
          'Ընկույզ՝ խաղողի թանձր հյութի մեջ', 'Грецкие орехи в загущённом виноградном соке', 'Walnuts in thickened grape juice', false),
        ('desserts', 4, 'ice-cream', 900, 'Պաղպաղակ', 'Мороженое', 'Ice cream', null, null, null, false),
        ('coffee', 1, 'armenian-coffee', 700, 'Հայկական սուրճ', 'Армянский кофе', 'Armenian coffee', null, null, null, false),
        ('coffee', 2, 'espresso', 800, 'Էսպրեսո', 'Эспрессо', 'Espresso', null, null, null, false),
        ('coffee', 3, 'cappuccino', 1300, 'Կապուչինո', 'Капучино', 'Cappuccino', null, null, null, false),
        ('coffee', 4, 'latte', 1400, 'Լատե', 'Латте', 'Latte', null, null, null, false),
        ('coffee', 5, 'cocoa', 1000, 'Կակաո', 'Какао', 'Cocoa', null, null, null, false),
        ('coffee', 6, 'thyme-tea', 900, 'Ուրցով թեյ', 'Чай с чабрецом', 'Thyme tea', null, null, null, false),
        ('coffee', 7, 'rosehip-tea', 900, 'Մասուրով թեյ', 'Чай из шиповника', 'Rosehip tea', null, null, null, false),
        ('drinks', 1, 'jermuk', 600, '«Ջերմուկ» հանքային ջուր', 'Минеральная вода «Джермук»', 'Jermuk mineral water', null, null, null, false),
        ('drinks', 2, 'orange-juice', 1600, 'Թարմ քամված նարնջի հյութ', 'Свежевыжатый апельсиновый сок', 'Fresh orange juice', null, null, null, false),
        ('drinks', 3, 'tan', 600, 'Թան', 'Тан', 'Tan',
          'Ջրով նոսրացված մածուն', 'Мацун, разбавленный водой', 'Matsoni thinned with water', false),
        ('drinks', 4, 'tarragon-lemonade', 1200, 'Թարխունով տնական լիմոնադ', 'Домашний лимонад с тархуном', 'Homemade tarragon lemonade', null, null, null, false),
        ('drinks', 5, 'apricot-compote', 800, 'Ծիրանի կոմպոտ', 'Абрикосовый компот', 'Apricot compote', null, null, null, false)
      ) as t(cat, sort, key, price, hy, ru, en, hy_desc, ru_desc, en_desc, ai)
      where t.cat = c.key
    loop
      insert into public.items (restaurant_id, category_id, price, sort, tags)
      values (v_r, v_cat, i.price, i.sort,
              case when i.key in ('tolma', 'pork-ribs', 'zhingyalov') then '{popular}'::text[] else '{}'::text[] end)
      returning id into v_item;
      v_ids := v_ids || jsonb_build_object(i.key, v_item);
      insert into public.item_translations (restaurant_id, item_id, locale, name, description, source, reviewed_at) values
        (v_r, v_item, 'hy', i.hy, i.hy_desc, 'owner', null),
        (v_r, v_item, 'ru', i.ru, i.ru_desc, case when i.ai then 'ai' else 'owner' end::public.translation_source,
         case when i.ai then now() end),
        (v_r, v_item, 'en', i.en, i.en_desc, case when i.ai then 'ai' else 'owner' end::public.translation_source,
         case when i.ai then now() end);
    end loop;
  end loop;

  -- Options: sugar for Armenian coffee, size and milk for milk coffees
  insert into public.modifier_groups (restaurant_id, min_select, max_select, sort) values (v_r, 1, 1, 1) returning id into v_sugar;
  insert into public.modifier_group_translations (restaurant_id, group_id, locale, name) values
    (v_r, v_sugar, 'hy', 'Շաքար'), (v_r, v_sugar, 'ru', 'Сахар'), (v_r, v_sugar, 'en', 'Sugar');
  insert into public.modifier_groups (restaurant_id, min_select, max_select, sort) values (v_r, 1, 1, 1) returning id into v_size;
  insert into public.modifier_group_translations (restaurant_id, group_id, locale, name) values
    (v_r, v_size, 'hy', 'Չափ'), (v_r, v_size, 'ru', 'Размер'), (v_r, v_size, 'en', 'Size');
  insert into public.modifier_groups (restaurant_id, min_select, max_select, sort) values (v_r, 0, 1, 2) returning id into v_milk;
  insert into public.modifier_group_translations (restaurant_id, group_id, locale, name) values
    (v_r, v_milk, 'hy', 'Կաթ'), (v_r, v_milk, 'ru', 'Молоко'), (v_r, v_milk, 'en', 'Milk');

  for i in
    select * from (values
      ('sugar', 1, 0, true, 'Առանց շաքարի', 'Без сахара', 'No sugar'),
      ('sugar', 2, 0, false, 'Միջին', 'Средний', 'Medium'),
      ('sugar', 3, 0, false, 'Քաղցր', 'Сладкий', 'Sweet'),
      ('size', 1, 0, true, '250 մլ', '250 мл', '250 ml'),
      ('size', 2, 300, false, '350 մլ', '350 мл', '350 ml'),
      ('milk', 1, 300, false, 'Վարսակի կաթ', 'Овсяное молоко', 'Oat milk'),
      ('milk', 2, 200, false, 'Առանց լակտոզի կաթ', 'Безлактозное молоко', 'Lactose-free milk')
    ) as t(grp, sort, delta, is_default, hy, ru, en)
  loop
    insert into public.modifiers (restaurant_id, group_id, price_delta, is_default, sort)
    values (v_r, case i.grp when 'sugar' then v_sugar when 'size' then v_size else v_milk end, i.delta, i.is_default, i.sort)
    returning id into v_mod;
    insert into public.modifier_translations (restaurant_id, modifier_id, locale, name) values
      (v_r, v_mod, 'hy', i.hy), (v_r, v_mod, 'ru', i.ru), (v_r, v_mod, 'en', i.en);
  end loop;

  insert into public.item_modifier_groups (restaurant_id, item_id, group_id, sort) values
    (v_r, (v_ids ->> 'armenian-coffee')::uuid, v_sugar, 1),
    (v_r, (v_ids ->> 'cappuccino')::uuid, v_size, 1),
    (v_r, (v_ids ->> 'cappuccino')::uuid, v_milk, 2),
    (v_r, (v_ids ->> 'latte')::uuid, v_size, 1),
    (v_r, (v_ids ->> 'latte')::uuid, v_milk, 2),
    (v_r, (v_ids ->> 'cocoa')::uuid, v_milk, 1);

  -- Floor: 8 tables in the hall, 4 on the terrace
  insert into public.areas (restaurant_id, location_id, name, sort) values (v_r, v_l, 'Սրահ', 1) returning id into v_hall;
  insert into public.areas (restaurant_id, location_id, name, sort) values (v_r, v_l, 'Բացօթյա', 2) returning id into v_terrace;
  insert into public.tables (restaurant_id, location_id, area_id, label, seats, shape, pos_x, pos_y, sort)
  select v_r, v_l, case when n <= 8 then v_hall else v_terrace end, n::text,
         (array[2, 2, 4, 4, 2, 4, 6, 4, 2, 4, 4, 2])[n],
         case when n in (3, 6, 10) then 'round' when n = 7 then 'rect' else 'square' end,
         case when n <= 8 then (n - 1) % 4 else n - 9 end,
         case when n <= 4 then 0 when n <= 8 then 1 else 2 end,
         n
  from generate_series(1, 12) n;

  perform api.publish_menu(v_l);
  perform set_config('request.jwt.claims', '', true);
end
$seed$;
