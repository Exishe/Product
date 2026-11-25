-- Ingredients, substitutes and "ingredient out" (ADR-076).
-- One action from staff ("this ingredient is out") and the guest never hears it:
--   * a dish whose KEY ingredient is out and has no substitute disappears from
--     the guest menu (or shows the usual "sold out" label, a per-location choice);
--   * a dish whose key ingredient has a substitute stays, with a `substitution`
--     note and the price difference, and the order line stores it;
--   * it ends by itself at the end of the business day, like the stop list.
-- Live overlay on the published menu: no republish. Every rule is in the
-- database; the app only draws.
--
--   1. Ingredients in three languages + kcal; a read-only catalog to copy from.
--   2. recipe_lines: is_key, substitute, price difference.
--   3. public.ingredient_outages + the rules (private.outage_*).
--   4. api.public_menu / api.public_menu_status wrapped with the overlay.
--   5. The order: hidden dish refused, substitution stored, `subs_ack` checked.
--   6. Owner/manager and staff functions (the bot calls the private core).

-- -----------------------------------------------------------------------------
-- 1. Ingredients
-- -----------------------------------------------------------------------------
alter table public.ingredients
  add column name_i18n jsonb not null default '{}',                    -- {"ru": "...", "en": "..."}; `name` stays the Armenian one
  add column kcal_per_100g numeric(7, 2) check (kcal_per_100g is null or kcal_per_100g between 0 and 1000),
  add constraint ingredients_name_i18n_shape check (jsonb_typeof(name_i18n) = 'object'),
  add constraint ingredients_name_len check (char_length(btrim(name)) between 1 and 80);
create unique index ingredients_name_uq on public.ingredients (restaurant_id, lower(name));

alter table public.ingredients enable row level security;
alter table public.recipe_lines enable row level security;
create policy ingredients_read on public.ingredients for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids('{owner,manager}')));
create policy recipe_lines_read on public.recipe_lines for select to authenticated
  using (restaurant_id in (select private.my_restaurant_ids('{owner,manager}')));
-- No client write grant on either table: only the api functions below change them.

-- All three names, never blank: a missing translation falls back to Armenian.
create function private.ingredient_names(p_ingredient_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'hy', i.name,
    'ru', coalesce(nullif(btrim(i.name_i18n ->> 'ru'), ''), i.name),
    'en', coalesce(nullif(btrim(i.name_i18n ->> 'en'), ''), i.name))
  from public.ingredients i where i.id = p_ingredient_id
$$;

-- The read-only reference list owners copy from. Approximate kcal per 100 g
-- from commonly published public nutrition tables; owners can edit their copy.
create table public.ingredient_catalog (
  key text primary key,
  name_i18n jsonb not null check (jsonb_typeof(name_i18n) = 'object' and name_i18n ? 'hy'),
  unit text not null check (unit in ('g', 'ml', 'pcs')),
  kcal_per_100g numeric(7, 2) check (kcal_per_100g is null or kcal_per_100g between 0 and 1000)
);
alter table public.ingredient_catalog enable row level security;
revoke all on public.ingredient_catalog from anon, authenticated;
-- No policy and no grant: guests and staff read it only through api.ingredient_catalog().

insert into public.ingredient_catalog (key, name_i18n, unit, kcal_per_100g)
select v.key, jsonb_build_object('hy', v.hy, 'ru', v.ru, 'en', v.en), v.unit, v.kcal
from (values
  -- dairy and eggs
  ('milk', 'Կաթ', 'Молоко', 'Milk', 'ml', 61),
  ('cream', 'Սերուցք', 'Сливки', 'Cream (20%)', 'ml', 205),
  ('sour_cream', 'Թթվասեր', 'Сметана', 'Sour cream', 'g', 193),
  ('butter', 'Կարագ', 'Сливочное масло', 'Butter', 'g', 717),
  ('hard_cheese', 'Կարծր պանիր', 'Сыр твёрдый', 'Hard cheese', 'g', 400),
  ('mozzarella', 'Մոցարելլա', 'Моцарелла', 'Mozzarella', 'g', 280),
  ('feta', 'Ֆետա', 'Фета', 'Feta', 'g', 264),
  ('cream_cheese', 'Սերուցքային պանիր', 'Сливочный сыр', 'Cream cheese', 'g', 342),
  ('mascarpone', 'Մասկարպոնե', 'Маскарпоне', 'Mascarpone', 'g', 429),
  ('matsoni', 'Մածուն', 'Мацони', 'Matsoni (plain yogurt)', 'g', 61),
  ('cottage_cheese', 'Կաթնաշոռ', 'Творог', 'Cottage cheese', 'g', 98),
  ('condensed_milk', 'Խտացրած կաթ', 'Сгущённое молоко', 'Condensed milk', 'g', 321),
  ('ice_cream', 'Պաղպաղակ', 'Мороженое', 'Ice cream', 'g', 207),
  ('egg', 'Ձու', 'Яйцо', 'Egg', 'pcs', 143),
  -- meat and fish
  ('chicken_breast', 'Հավի կրծքամիս', 'Куриная грудка', 'Chicken breast', 'g', 165),
  ('chicken_thigh', 'Հավի ազդր', 'Куриное бедро', 'Chicken thigh', 'g', 209),
  ('beef', 'Տավարի միս', 'Говядина', 'Beef', 'g', 250),
  ('ground_beef', 'Տավարի աղացած միս', 'Говяжий фарш', 'Ground beef', 'g', 254),
  ('pork', 'Խոզի միս', 'Свинина', 'Pork', 'g', 242),
  ('lamb', 'Գառան միս', 'Баранина', 'Lamb', 'g', 294),
  ('ham', 'Խոզապուխտ', 'Ветчина', 'Ham', 'g', 145),
  ('sausage', 'Երշիկ', 'Колбаса', 'Sausage', 'g', 301),
  ('bacon', 'Բեկոն', 'Бекон', 'Bacon', 'g', 541),
  ('salmon', 'Սաղմոն', 'Лосось', 'Salmon', 'g', 208),
  ('trout', 'Իշխան', 'Форель', 'Trout', 'g', 141),
  ('tuna_canned', 'Թունա (պահածո)', 'Тунец консервированный', 'Canned tuna', 'g', 116),
  ('shrimp', 'Ծովախեցգետին', 'Креветки', 'Shrimp', 'g', 99),
  -- vegetables and herbs
  ('tomato', 'Լոլիկ', 'Помидор', 'Tomato', 'g', 18),
  ('cucumber', 'Վարունգ', 'Огурец', 'Cucumber', 'g', 15),
  ('potato', 'Կարտոֆիլ', 'Картофель', 'Potato', 'g', 77),
  ('onion', 'Սոխ', 'Лук репчатый', 'Onion', 'g', 40),
  ('garlic', 'Սխտոր', 'Чеснок', 'Garlic', 'g', 149),
  ('carrot', 'Գազար', 'Морковь', 'Carrot', 'g', 41),
  ('bell_pepper', 'Բիբար', 'Болгарский перец', 'Bell pepper', 'g', 31),
  ('eggplant', 'Սմբուկ', 'Баклажан', 'Eggplant', 'g', 25),
  ('zucchini', 'Դդմիկ', 'Кабачок', 'Zucchini', 'g', 17),
  ('cabbage', 'Կաղամբ', 'Капуста', 'Cabbage', 'g', 25),
  ('salad_leaves', 'Աղցանի տերևներ', 'Салатные листья', 'Salad leaves', 'g', 15),
  ('spinach', 'Սպանախ', 'Шпинат', 'Spinach', 'g', 23),
  ('mushrooms', 'Սունկ', 'Шампиньоны', 'Mushrooms', 'g', 22),
  ('broccoli', 'Բրոկկոլի', 'Брокколи', 'Broccoli', 'g', 34),
  ('avocado', 'Ավոկադո', 'Авокадо', 'Avocado', 'g', 160),
  ('corn_canned', 'Եգիպտացորենի պահածո', 'Кукуруза консервированная', 'Canned corn', 'g', 86),
  ('green_peas', 'Կանաչ ոլոռ', 'Зелёный горошек', 'Green peas', 'g', 81),
  ('beetroot', 'Ճակնդեղ', 'Свёкла', 'Beetroot', 'g', 43),
  ('olives', 'Ձիթապտուղ', 'Оливки', 'Olives', 'g', 115),
  ('herbs', 'Կանաչի', 'Зелень', 'Fresh herbs', 'g', 36),
  -- fruit
  ('apple', 'Խնձոր', 'Яблоко', 'Apple', 'g', 52),
  ('banana', 'Բանան', 'Банан', 'Banana', 'g', 89),
  ('lemon', 'Կիտրոն', 'Лимон', 'Lemon', 'g', 29),
  ('orange', 'Նարինջ', 'Апельсин', 'Orange', 'g', 47),
  ('strawberry', 'Ելակ', 'Клубника', 'Strawberry', 'g', 32),
  ('raspberry', 'Ազնվամորի', 'Малина', 'Raspberry', 'g', 52),
  ('peach', 'Դեղձ', 'Персик', 'Peach', 'g', 39),
  ('apricot', 'Ծիրան', 'Абрикос', 'Apricot', 'g', 48),
  ('pomegranate', 'Նուռ', 'Гранат', 'Pomegranate', 'g', 83),
  ('grapes', 'Խաղող', 'Виноград', 'Grapes', 'g', 69),
  -- grains, bread, legumes
  ('flour', 'Ալյուր', 'Мука пшеничная', 'Wheat flour', 'g', 364),
  ('rice', 'Բրինձ', 'Рис', 'Rice (dry)', 'g', 365),
  ('pasta', 'Մակարոն', 'Макароны', 'Pasta (dry)', 'g', 371),
  ('bread', 'Հաց', 'Хлеб', 'Bread', 'g', 265),
  ('lavash', 'Լավաշ', 'Лаваш', 'Lavash', 'g', 275),
  ('bulgur', 'Բլղուր', 'Булгур', 'Bulgur', 'g', 342),
  ('oats', 'Վարսակի փաթիլներ', 'Овсяные хлопья', 'Rolled oats', 'g', 389),
  ('buckwheat', 'Հնդկաձավար', 'Гречка', 'Buckwheat', 'g', 343),
  ('yeast', 'Խմորիչ', 'Дрожжи', 'Dry yeast', 'g', 325),
  ('chickpeas', 'Սիսեռ', 'Нут', 'Chickpeas (dry)', 'g', 364),
  ('lentils', 'Ոսպ', 'Чечевица', 'Lentils (dry)', 'g', 352),
  ('beans', 'Լոբի', 'Фасоль', 'Beans (dry)', 'g', 333),
  -- pantry
  ('sugar', 'Շաքար', 'Сахар', 'Sugar', 'g', 387),
  ('salt', 'Աղ', 'Соль', 'Salt', 'g', 0),
  ('black_pepper', 'Սև պղպեղ', 'Чёрный перец', 'Black pepper', 'g', 251),
  ('cinnamon', 'Դարչին', 'Корица', 'Cinnamon', 'g', 247),
  ('sunflower_oil', 'Արևածաղկի ձեթ', 'Подсолнечное масло', 'Sunflower oil', 'ml', 884),
  ('olive_oil', 'Ձիթապտղի յուղ', 'Оливковое масло', 'Olive oil', 'ml', 884),
  ('honey', 'Մեղր', 'Мёд', 'Honey', 'g', 304),
  ('mayonnaise', 'Մայոնեզ', 'Майонез', 'Mayonnaise', 'g', 680),
  ('ketchup', 'Կետչուպ', 'Кетчуп', 'Ketchup', 'g', 112),
  ('tomato_paste', 'Տոմատի մածուկ', 'Томатная паста', 'Tomato paste', 'g', 82),
  ('vinegar', 'Քացախ', 'Уксус', 'Vinegar', 'ml', 18),
  ('soy_sauce', 'Սոյայի սոուս', 'Соевый соус', 'Soy sauce', 'ml', 53),
  ('mustard', 'Մանանեխ', 'Горчица', 'Mustard', 'g', 66),
  ('baking_powder', 'Թխման փոշի', 'Разрыхлитель', 'Baking powder', 'g', 53),
  ('gelatin', 'Ժելատին', 'Желатин', 'Gelatin', 'g', 335),
  ('walnut', 'Ընկույզ', 'Грецкий орех', 'Walnut', 'g', 654),
  ('almond', 'Նուշ', 'Миндаль', 'Almond', 'g', 579),
  ('hazelnut', 'Պնդուկ', 'Фундук', 'Hazelnut', 'g', 628),
  ('peanut', 'Գետնանուշ', 'Арахис', 'Peanut', 'g', 567),
  ('raisins', 'Չամիչ', 'Изюм', 'Raisins', 'g', 299),
  ('prunes', 'Սալորաչիր', 'Чернослив', 'Prunes', 'g', 240),
  ('dark_chocolate', 'Մուգ շոկոլադ', 'Тёмный шоколад', 'Dark chocolate', 'g', 546),
  ('cocoa', 'Կակաո', 'Какао-порошок', 'Cocoa powder', 'g', 228),
  -- drinks
  ('water', 'Ջուր', 'Вода', 'Water', 'ml', 0),
  ('orange_juice', 'Նարնջի հյութ', 'Апельсиновый сок', 'Orange juice', 'ml', 45),
  ('red_wine', 'Կարմիր գինի', 'Красное вино', 'Red wine', 'ml', 85),
  ('beer', 'Գարեջուր', 'Пиво', 'Beer', 'ml', 43),
  ('vodka', 'Օղի', 'Водка', 'Vodka', 'ml', 231),
  ('brandy', 'Կոնյակ', 'Коньяк', 'Brandy', 'ml', 225),
  ('coffee_beans', 'Սուրճի հատիկներ', 'Кофе в зёрнах', 'Coffee beans', 'g', null),
  ('tea_leaves', 'Թեյի տերևներ', 'Чай листовой', 'Tea leaves', 'g', null)
) as v (key, hy, ru, en, unit, kcal);

-- -----------------------------------------------------------------------------
-- 2. The recipe: key ingredients and their substitutes
-- -----------------------------------------------------------------------------
alter table public.recipe_lines
  add column is_key boolean not null default false,
  add column substitute_ingredient_id uuid,
  add column substitute_price_delta numeric(12, 2),            -- AMD, may be negative; null: no price change
  add constraint recipe_lines_substitute_fk foreign key (restaurant_id, substitute_ingredient_id)
    references public.ingredients (restaurant_id, id) on delete set null (substitute_ingredient_id),
  add constraint recipe_lines_key_on_dish check (not is_key or item_id is not null),
  add constraint recipe_lines_substitute_needs_key check (substitute_ingredient_id is null or is_key),
  add constraint recipe_lines_substitute_differs check (substitute_ingredient_id is distinct from ingredient_id),
  add constraint recipe_lines_delta_range check (substitute_price_delta is null or substitute_price_delta between -1000000 and 1000000);
create unique index recipe_lines_item_ingredient_uq on public.recipe_lines (item_id, ingredient_id) where item_id is not null;
create index recipe_lines_key_idx on public.recipe_lines (ingredient_id) where is_key;

-- -----------------------------------------------------------------------------
-- 3. Outages
-- -----------------------------------------------------------------------------
alter table public.locations
  add column out_ingredient_display text not null default 'hide' check (out_ingredient_display in ('hide', 'sold_out'));
-- No client write grant on this column: api.set_out_ingredient_display changes it.

create table public.ingredient_outages (
  restaurant_id uuid not null,
  location_id uuid not null,
  ingredient_id uuid not null,
  out_at timestamptz not null default now(),
  until timestamptz not null,                    -- end of the business day; active while until > now()
  set_by_user uuid references auth.users (id) on delete set null,
  set_by_member uuid references public.members (id) on delete set null,
  source text not null check (source in ('kitchen', 'bot', 'admin')),
  primary key (location_id, ingredient_id),
  foreign key (restaurant_id, location_id) references public.locations (restaurant_id, id) on delete cascade,
  foreign key (restaurant_id, ingredient_id) references public.ingredients (restaurant_id, id) on delete cascade
);
create index ingredient_outages_until_idx on public.ingredient_outages (until);

alter table public.ingredient_outages enable row level security;
create policy ingredient_outages_read on public.ingredient_outages for select to authenticated
  using (location_id in (select private.my_location_ids()));
revoke all on public.ingredient_outages from anon, authenticated;
grant select on public.ingredient_outages to authenticated;
-- Writes only through api.set_ingredient_out (or the bot's private core).

-- The next business-day opening: where "not today" ends (the same boundary as
-- the stop list and the closed kitchen).
create function private.business_day_end(p_location_id uuid) returns timestamptz
language sql stable security definer set search_path = '' as $$
  select (case
            when date_trunc('day', now() at time zone l.timezone) + l.business_day_starts <= now() at time zone l.timezone
              then date_trunc('day', now() at time zone l.timezone) + l.business_day_starts + interval '1 day'
            else date_trunc('day', now() at time zone l.timezone) + l.business_day_starts
          end) at time zone l.timezone
  from public.locations l where l.id = p_location_id
$$;

-- What the active outages do to dishes, per dish (key ingredient lines only):
--   hidden    the dish cannot be made: a key ingredient is out with no usable
--             substitute (none set, or the substitute is out too), or more than
--             one key ingredient needs replacing (one note per dish).
--   otherwise the single substitution: from, to, price difference in whole AMD.
create function private.outage_effects(p_location_id uuid)
returns table (item_id uuid, hidden boolean, from_id uuid, to_id uuid, price_delta integer)
language sql stable security definer set search_path = '' as $$
  with active as (
    select o.ingredient_id from public.ingredient_outages o
    where o.location_id = p_location_id and o.until > now()),
  hit as (
    select rl.item_id, rl.ingredient_id, rl.substitute_ingredient_id as sub,
           coalesce(round(rl.substitute_price_delta), 0)::integer as delta,
           (rl.substitute_ingredient_id is null
            or rl.substitute_ingredient_id in (select a.ingredient_id from active a)) as dead
    from public.recipe_lines rl
    where rl.is_key and rl.item_id is not null
      and rl.restaurant_id = (select l.restaurant_id from public.locations l where l.id = p_location_id)
      and rl.ingredient_id in (select a.ingredient_id from active a))
  select h.item_id,
         bool_or(h.dead) or count(*) > 1,
         case when bool_or(h.dead) or count(*) > 1 then null else (array_agg(h.ingredient_id))[1] end,
         case when bool_or(h.dead) or count(*) > 1 then null else (array_agg(h.sub))[1] end,
         case when bool_or(h.dead) or count(*) > 1 then 0 else (array_agg(h.delta))[1] end
  from hit h
  group by h.item_id
$$;

-- The one JSON every reader shares (menu, status, order):
--   {} when nothing is active, else
--   {"mode": "hide"|"sold_out", "hidden": [item ids],
--    "substitutions": {item id: {"from": {"id", "name": {hy,ru,en}}, "to": {...}, "price_delta": int}}}
create function private.outage_overlay(p_location_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_mode text;
  v_hidden jsonb;
  v_subs jsonb;
begin
  select coalesce(jsonb_agg(e.item_id order by e.item_id) filter (where e.hidden), '[]'::jsonb),
         coalesce(jsonb_object_agg(e.item_id, jsonb_build_object(
                    'from', jsonb_build_object('id', e.from_id, 'name', private.ingredient_names(e.from_id)),
                    'to', jsonb_build_object('id', e.to_id, 'name', private.ingredient_names(e.to_id)),
                    'price_delta', e.price_delta)) filter (where not e.hidden), '{}'::jsonb)
  into v_hidden, v_subs
  from private.outage_effects(p_location_id) e;

  if v_hidden = '[]'::jsonb and v_subs = '{}'::jsonb then
    return '{}'::jsonb;
  end if;
  select l.out_ingredient_display into v_mode from public.locations l where l.id = p_location_id;
  return jsonb_build_object('mode', coalesce(v_mode, 'hide'), 'hidden', v_hidden, 'substitutions', v_subs);
end $$;

-- A short version of the active outages: changes whenever what guests see changes.
create function private.outage_version(p_overlay jsonb) returns text
language sql immutable set search_path = '' as $$
  select case when p_overlay = '{}'::jsonb then null else left(md5(p_overlay::text), 8) end
$$;

-- Sold-out ids = the stop list plus, in 'sold_out' display mode, the dishes an outage blocks.
create function private.merge_sold_out(p_sold jsonb, p_overlay jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case when p_overlay ->> 'mode' = 'sold_out' and p_overlay -> 'hidden' <> '[]'::jsonb
              then (select coalesce(jsonb_agg(x.id order by x.id), '[]'::jsonb)
                    from (select distinct e #>> '{}' as id
                          from jsonb_array_elements(p_sold || (p_overlay -> 'hidden')) e) x)
              else p_sold end
$$;

-- Applies the overlay to the menu answer.
create function private.apply_outages_menu(p_menu jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ov jsonb;
  v_out jsonb;
  v_hide text[];
  v_id text;
  v_sub jsonb;
begin
  if p_menu is null then
    return null;
  end if;
  v_ov := private.outage_overlay((p_menu #>> '{location,id}')::uuid);
  if v_ov = '{}'::jsonb then
    return p_menu;
  end if;
  v_out := p_menu || jsonb_build_object('outages', private.outage_version(v_ov),
                                        'sold_out', private.merge_sold_out(p_menu -> 'sold_out', v_ov));

  -- Dishes that are blocked and shown as hidden leave the menu completely.
  if v_ov ->> 'mode' = 'hide' and v_ov -> 'hidden' <> '[]'::jsonb then
    select array_agg(e #>> '{}') into v_hide from jsonb_array_elements(v_ov -> 'hidden') e;
    v_out := jsonb_set(v_out, '{menu,items}', (v_out #> '{menu,items}') - v_hide);
    v_out := jsonb_set(v_out, '{menu,menus}', (
      select coalesce(jsonb_agg(
        jsonb_set(m.m, '{categories}', (
          select coalesce(jsonb_agg(
            jsonb_set(c.c, '{item_ids}', (
              select coalesce(jsonb_agg(i.e order by i.o), '[]'::jsonb)
              from jsonb_array_elements(c.c -> 'item_ids') with ordinality as i (e, o)
              where not ((i.e #>> '{}') = any (v_hide))))
            order by c.o), '[]'::jsonb)
          from jsonb_array_elements(m.m -> 'categories') with ordinality as c (c, o)))
        order by m.o), '[]'::jsonb)
      from jsonb_array_elements(v_out #> '{menu,menus}') with ordinality as m (m, o)));
  end if;

  -- Substituted dishes stay; the price shown includes the difference.
  for v_id, v_sub in select s.key, s.value from jsonb_each(v_ov -> 'substitutions') s loop
    if v_out #> array['menu', 'items', v_id, 'price'] is not null then
      v_out := jsonb_set(v_out, array['menu', 'items', v_id, 'price'],
        to_jsonb(greatest(0, (v_out #>> array['menu', 'items', v_id, 'price'])::integer + (v_sub ->> 'price_delta')::integer)));
    else
      v_ov := jsonb_set(v_ov, '{substitutions}', (v_ov -> 'substitutions') - v_id);
    end if;
  end loop;
  if v_ov -> 'substitutions' <> '{}'::jsonb then
    v_out := v_out || jsonb_build_object('substitutions', v_ov -> 'substitutions');
  end if;
  return v_out;
end $$;

-- Applies the overlay to the status the guest menu polls.
create function private.apply_outages_status(p_status jsonb, p_location_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ov jsonb;
begin
  if p_status is null then
    return null;
  end if;
  v_ov := private.outage_overlay(p_location_id);
  if v_ov = '{}'::jsonb then
    return p_status;
  end if;
  return p_status || jsonb_build_object('outages', private.outage_version(v_ov),
                                        'sold_out', private.merge_sold_out(p_status -> 'sold_out', v_ov));
end $$;

-- -----------------------------------------------------------------------------
-- 4. What guests read: the published base functions keep their bodies (whatever
-- the earlier migrations made them); the public ones wrap them. A later
-- migration that changes the menu answer changes private.public_menu_base.
-- -----------------------------------------------------------------------------
alter function api.public_menu(text, text) set schema private;
alter function private.public_menu(text, text) rename to public_menu_base;
alter function api.public_menu_status(uuid) set schema private;
alter function private.public_menu_status(uuid) rename to public_menu_status_base;
revoke execute on function private.public_menu_base(text, text) from public, anon, authenticated;
revoke execute on function private.public_menu_status_base(uuid) from public, anon, authenticated;

create function api.public_menu(p_restaurant_slug text, p_location_slug text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.apply_outages_menu(private.public_menu_base(p_restaurant_slug, p_location_slug))
$$;

create function api.public_menu_status(p_location_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.apply_outages_status(private.public_menu_status_base(p_location_id), p_location_id)
$$;

-- -----------------------------------------------------------------------------
-- 5. The order
-- -----------------------------------------------------------------------------
alter table public.order_items add column substitution jsonb;   -- {"from": {...}, "to": {...}, "price_delta": int} or null

-- A guest order must carry the guest's "yes" for every substitution it meets:
-- `subs_ack` is a list of the ingredient ids that are being replaced (the
-- `from` ids the menu showed). Anything missing is refused with
-- substitution_changed; the detail lists what to ask again.
create function private.assert_subs_acked(p_location_id uuid, p_lines jsonb, p_ack jsonb) returns void
language plpgsql stable security definer set search_path = '' as $$
declare
  v_ov jsonb;
  v_missing jsonb;
begin
  if p_ack is not null and jsonb_typeof(p_ack) <> 'array' then
    raise exception using errcode = 'RS422', message = 'invalid_lines';
  end if;
  if jsonb_typeof(p_lines) <> 'array' then
    return;  -- the order core rejects it
  end if;
  v_ov := private.outage_overlay(p_location_id);
  if coalesce(v_ov -> 'substitutions', '{}'::jsonb) = '{}'::jsonb then
    return;
  end if;
  select jsonb_agg(jsonb_build_object('item_id', s.key) || s.value order by s.key) into v_missing
  from jsonb_each(v_ov -> 'substitutions') s
  where exists (select 1 from jsonb_array_elements(p_lines) l where lower(l ->> 'item_id') = s.key)
    and not (coalesce(p_ack, '[]'::jsonb) ? (s.value #>> '{from,id}'));
  if v_missing is not null then
    raise exception using errcode = 'RS422', message = 'substitution_changed', detail = v_missing::text;
  end if;
end $$;

-- The order core, unchanged from the baseline except: a dish blocked by an
-- outage is refused (item_unavailable, or item_sold_out when the café shows
-- the "sold out" label), and a substituted dish stores the substitution and
-- the price difference on its line. Waiters get the substitution too; only
-- guests have to confirm it (private.assert_subs_acked, before this runs).
create or replace function private.place_order_core(
  p_location_id uuid,
  p_table_id uuid,
  p_table_session_id uuid,
  p_guest_session_id uuid,
  p_member_id uuid,
  p_source public.order_source,
  p_locale public.app_locale,
  p_idempotency_key uuid,
  p_lines jsonb,             -- [{"item_id": uuid, "quantity": int, "modifier_ids": [uuid], "note": text}]
  p_note text,
  p_needs_acceptance boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_location public.locations;
  v_snapshot jsonb;
  v_hash text := encode(extensions.digest(p_lines::text || coalesce(p_note, ''), 'sha256'), 'hex');
  v_existing public.orders;
  v_order_id uuid;
  v_number integer;
  v_date date;
  v_line jsonb;
  v_item jsonb;
  v_item_id uuid;
  v_qty integer;
  v_selected jsonb;
  v_group jsonb;
  v_cnt integer;
  v_sum integer;
  v_mod_total integer;
  v_matched integer;
  v_station uuid;
  v_oi uuid;
  v_subtotal integer := 0;
  v_count integer := 0;
  v_sort integer := 0;
  v_auto boolean;
  v_overlay jsonb;
  v_sub jsonb;
  v_unit integer;
begin
  select * into v_location from public.locations where id = p_location_id;

  -- Idempotent replay: same key + same body returns the same order.
  select * into v_existing from public.orders
  where restaurant_id = v_location.restaurant_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.request_hash = v_hash
       and v_existing.guest_session_id is not distinct from p_guest_session_id
       and v_existing.created_by_member is not distinct from p_member_id then
      return v_existing.id;
    end if;
    raise exception using errcode = 'RS409', message = 'idempotency_key_reused';
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) not between 1 and 30 then
    raise exception using errcode = 'RS422', message = 'invalid_lines';
  end if;

  select v.snapshot into v_snapshot from public.menu_versions v where v.id = v_location.published_menu_version_id;
  if v_snapshot is null then
    raise exception using errcode = 'RS422', message = 'menu_not_published';
  end if;

  v_overlay := private.outage_overlay(p_location_id);
  v_date := private.business_date(p_location_id);
  v_number := private.next_number(p_location_id, v_date, 'order');

  insert into public.orders (restaurant_id, location_id, table_id, table_session_id, guest_session_id,
                             created_by_member, source, locale, business_date, number, idempotency_key,
                             request_hash, guest_note)
  values (v_location.restaurant_id, p_location_id, p_table_id, p_table_session_id, p_guest_session_id,
          p_member_id, p_source, p_locale, v_date, v_number, p_idempotency_key, v_hash,
          nullif(trim(left(p_note, 300)), ''))
  returning id into v_order_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item_id := (v_line ->> 'item_id')::uuid;
    v_qty := (v_line ->> 'quantity')::integer;
    v_item := v_snapshot -> 'items' -> (v_item_id::text);
    if v_item is null then
      raise exception using errcode = 'RS422', message = 'item_unavailable', detail = v_item_id::text;
    end if;
    if coalesce(v_overlay -> 'hidden', '[]'::jsonb) ? (v_item_id::text) then
      raise exception using errcode = 'RS422',
        message = case when v_overlay ->> 'mode' = 'sold_out' then 'item_sold_out' else 'item_unavailable' end,
        detail = v_item_id::text;
    end if;
    if exists (select 1 from public.stop_list s where s.location_id = p_location_id and s.item_id = v_item_id
               and (s.until is null or s.until > now())) then
      raise exception using errcode = 'RS422', message = 'item_sold_out', detail = v_item_id::text;
    end if;
    if v_qty is null or v_qty not between 1 and 20 then
      raise exception using errcode = 'RS422', message = 'invalid_quantity';
    end if;

    v_sub := v_overlay -> 'substitutions' -> (v_item_id::text);
    v_unit := greatest(0, (v_item ->> 'price')::integer + coalesce((v_sub ->> 'price_delta')::integer, 0));

    v_selected := coalesce(v_line -> 'modifier_ids', '[]'::jsonb);
    v_mod_total := 0;
    v_matched := 0;
    for v_group in select * from jsonb_array_elements(v_item -> 'groups') loop
      select count(*), coalesce(sum((md ->> 'price_delta')::integer), 0)
      into v_cnt, v_sum
      from jsonb_array_elements(v_group -> 'modifiers') md
      where v_selected ? (md ->> 'id');
      if v_cnt < (v_group ->> 'min')::integer or v_cnt > (v_group ->> 'max')::integer then
        raise exception using errcode = 'RS422', message = 'invalid_modifiers', detail = v_group ->> 'id';
      end if;
      v_mod_total := v_mod_total + v_sum;
      v_matched := v_matched + v_cnt;
    end loop;
    if v_matched <> jsonb_array_length(v_selected) then
      raise exception using errcode = 'RS422', message = 'unknown_modifier';
    end if;

    v_station := null;
    select sp.station_id into v_station from public.station_prep_areas sp
    where sp.location_id = p_location_id and sp.prep_area_id = (v_item ->> 'prep_area_id')::uuid;
    if v_station is null then
      select s.id into v_station from public.stations s where s.location_id = p_location_id and s.is_default;
    end if;
    if v_station is null then
      raise exception using errcode = 'RS422', message = 'no_station_configured';
    end if;

    v_sort := v_sort + 1;
    insert into public.order_items (restaurant_id, order_id, item_id, name_i18n, prep_area_id, station_id,
                                    unit_price, modifiers_total, quantity, line_total, note, sort, substitution)
    values (v_location.restaurant_id, v_order_id, v_item_id, v_item -> 'name', (v_item ->> 'prep_area_id')::uuid,
            v_station, v_unit, v_mod_total, v_qty,
            (v_unit + v_mod_total) * v_qty,
            nullif(left(trim(v_line ->> 'note'), 200), ''), v_sort, v_sub)
    returning id into v_oi;

    insert into public.order_item_modifiers (restaurant_id, order_id, order_item_id, modifier_id, name_i18n, price_delta)
    select v_location.restaurant_id, v_order_id, v_oi, (md ->> 'id')::uuid, md -> 'name', (md ->> 'price_delta')::integer
    from jsonb_array_elements(v_item -> 'groups') g, jsonb_array_elements(g -> 'modifiers') md
    where v_selected ? (md ->> 'id');

    v_subtotal := v_subtotal + (v_unit + v_mod_total) * v_qty;
    v_count := v_count + v_qty;
  end loop;

  v_auto := not p_needs_acceptance;
  update public.orders
  set subtotal = v_subtotal, total = v_subtotal, item_count = v_count,
      status = case when v_auto then 'accepted'::public.order_status else 'placed'::public.order_status end,
      accepted_at = case when v_auto then now() end,
      accepted_by = case when v_auto then p_member_id end
  where id = v_order_id;

  if v_auto then
    perform private.create_tickets(v_order_id);
  end if;
  perform private.enqueue_order_notification(v_order_id);
  return v_order_id;
end $$;

-- The guest order gains p_subs_ack (default null: as before). A new function
-- replaces the old one so PostgREST sees one name.
drop function api.guest_place_order(uuid, uuid, jsonb, text);
drop function private.place_guest_order(uuid, uuid, uuid, jsonb, text);

create function private.place_guest_order(
  p_user_id uuid,
  p_guest_session_id uuid,
  p_idempotency_key uuid,
  p_lines jsonb,
  p_note text default null,
  p_subs_ack jsonb default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_guest public.guest_sessions;
  v_table public.tables;
  v_location public.locations;
  v_replay boolean;
  v_block text;
  v_total integer;
  v_dishes jsonb;
  v_duplicate uuid;
  v_id uuid;
begin
  select * into v_guest from public.guest_sessions where id = p_guest_session_id;
  if not found or v_guest.user_id <> p_user_id or v_guest.revoked_at is not null or v_guest.expires_at <= now() then
    raise exception using errcode = 'RS403', message = 'guest_session_invalid';
  end if;
  select * into v_table from public.tables where id = v_guest.table_id;
  select * into v_location from public.locations where id = v_guest.location_id;
  if not v_table.is_active or v_table.qr_version <> v_guest.qr_version
     or not v_location.qr_ordering_enabled or v_location.status <> 'active' then
    raise exception using errcode = 'RS403', message = 'ordering_disabled';
  end if;

  v_replay := exists (select 1 from public.orders o where o.restaurant_id = v_guest.restaurant_id
                      and o.idempotency_key = p_idempotency_key);
  if not v_replay then
    v_block := private.ordering_block(v_location.id);
    if v_block is not null then
      raise exception using errcode = 'RS403', message = v_block;
    end if;
    perform private.assert_lines_in_window(v_location.id, p_lines);
    perform private.assert_subs_acked(v_location.id, p_lines, p_subs_ack);
    if not private.rate_limit_hit('order:guest:' || p_guest_session_id, 6, interval '10 minutes')
       or not private.rate_limit_hit('order:table:' || v_table.id, 30, interval '1 hour') then
      raise exception using errcode = 'RS429', message = 'rate_limited';
    end if;
  end if;

  -- On a replay the core checks the request hash and the guest session and
  -- returns the original order.
  v_id := private.place_order_core(v_location.id, v_table.id, v_guest.table_session_id, v_guest.id, null, 'qr',
                                   v_guest.locale, p_idempotency_key, p_lines, p_note, true);
  if v_replay then
    return v_id;
  end if;

  select o.total into v_total from public.orders o where o.id = v_id;

  select jsonb_object_agg(d.item_id, d.qty) into v_dishes
  from (select oi.item_id::text as item_id, sum(oi.quantity) as qty
        from public.order_items oi where oi.order_id = v_id group by oi.item_id) d;

  select o.id into v_duplicate
  from public.orders o
  where o.table_id = v_table.id
    and o.id <> v_id
    and o.guest_session_id is distinct from v_guest.id
    and o.status in ('placed', 'accepted')
    and o.placed_at > now() - interval '3 minutes'
    and (select jsonb_object_agg(d.item_id, d.qty)
         from (select oi.item_id::text as item_id, sum(oi.quantity) as qty
               from public.order_items oi where oi.order_id = o.id group by oi.item_id) d) = v_dishes
  order by o.placed_at desc
  limit 1;

  if v_duplicate is not null then
    update public.orders set possible_duplicate_of = v_duplicate where id = v_id;
  elsif not v_location.require_acceptance and v_total <= v_location.max_auto_accept_total then
    -- Small orders go straight to the kitchen; large or flagged ones wait for a waiter.
    update public.orders set status = 'accepted', accepted_at = now() where id = v_id and status = 'placed';
    if found then
      perform private.create_tickets(v_id);
    end if;
  end if;

  update public.guest_sessions set last_seen_at = now(), expires_at = now() + interval '4 hours' where id = v_guest.id;
  return v_id;
end $$;

create function api.guest_place_order(
  p_guest_session_id uuid,
  p_idempotency_key uuid,
  p_lines jsonb,
  p_note text default null,
  p_subs_ack jsonb default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  return private.place_guest_order(auth.uid(), p_guest_session_id, p_idempotency_key, p_lines, p_note, p_subs_ack);
end $$;

-- -----------------------------------------------------------------------------
-- 6. Functions
-- -----------------------------------------------------------------------------

-- Staff mark an ingredient out (or back). The rule is private so the Telegram
-- bot calls the same one. Returns when it ends by itself (null: back).
create function private.apply_ingredient_out(
  p_location_id uuid, p_ingredient_id uuid, p_out boolean, p_source text,
  p_actor_kind public.actor_kind, p_actor_user uuid, p_member uuid) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_until timestamptz;
  v_name text;
begin
  select l.restaurant_id into v_restaurant from public.locations l where l.id = p_location_id;
  select i.name into v_name from public.ingredients i where i.id = p_ingredient_id and i.restaurant_id = v_restaurant;
  if v_restaurant is null or v_name is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if p_out then
    v_until := private.business_day_end(p_location_id);
    insert into public.ingredient_outages (restaurant_id, location_id, ingredient_id, out_at, until, set_by_user, set_by_member, source)
    values (v_restaurant, p_location_id, p_ingredient_id, now(), v_until, p_actor_user, p_member, p_source)
    on conflict (location_id, ingredient_id) do update
      set out_at = now(), until = excluded.until, set_by_user = excluded.set_by_user,
          set_by_member = excluded.set_by_member, source = excluded.source;
  else
    delete from public.ingredient_outages where location_id = p_location_id and ingredient_id = p_ingredient_id;
  end if;

  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, p_location_id, p_actor_kind, p_actor_user,
          case when p_out then 'ingredient.out' else 'ingredient.back' end, 'ingredient', p_ingredient_id,
          jsonb_build_object('name', v_name, 'until', v_until, 'source', p_source));
  return v_until;
end $$;

-- Who may call it: the same people who may change the stop list from the
-- kitchen screen (stop_list_write): owner, manager, kitchen, waiter, of this location.
create function api.set_ingredient_out(p_location_id uuid, p_ingredient_id uuid, p_out boolean) returns timestamptz
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_admin boolean;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager,kitchen,waiter}');
  if p_out is null then
    raise exception using errcode = '22023', message = 'invalid_value';
  end if;
  select l.restaurant_id into v_restaurant from public.locations l where l.id = p_location_id;
  v_admin := exists (select 1 from private.my_location_ids('{owner,manager}') x where x = p_location_id);
  return private.apply_ingredient_out(p_location_id, p_ingredient_id, p_out,
                                      case when v_admin then 'admin' else 'kitchen' end,
                                      'member', auth.uid(), private.current_member_id(v_restaurant));
end $$;

-- The café's ingredients matching what staff typed (any of the three names),
-- the most used in recipes first, at most 30.
create function api.search_ingredients(p_location_id uuid, p_query text default null)
returns table (id uuid, name text, names jsonb, unit text, is_out boolean, uses integer)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_q text := lower(btrim(coalesce(p_query, '')));
begin
  perform private.assert_location_role(p_location_id, '{owner,manager,kitchen,waiter}');
  select l.restaurant_id into v_restaurant from public.locations l where l.id = p_location_id;
  return query
  select i.id, i.name, private.ingredient_names(i.id), i.unit,
         exists (select 1 from public.ingredient_outages o
                 where o.location_id = p_location_id and o.ingredient_id = i.id and o.until > now()),
         (select count(*)::integer from public.recipe_lines rl where rl.ingredient_id = i.id)
  from public.ingredients i
  where i.restaurant_id = v_restaurant and i.is_active
    and (v_q = ''
         or position(v_q in lower(i.name)) > 0
         or position(v_q in lower(coalesce(i.name_i18n ->> 'ru', ''))) > 0
         or position(v_q in lower(coalesce(i.name_i18n ->> 'en', ''))) > 0)
  order by 6 desc, lower(i.name), i.id
  limit 30;
end $$;

-- Owner display choice: a blocked dish is hidden ('hide') or shown with the
-- usual "sold out" label ('sold_out').
create function api.set_out_ingredient_display(p_location_id uuid, p_mode text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
begin
  perform private.assert_location_role(p_location_id, '{owner,manager}');
  if p_mode is null or p_mode not in ('hide', 'sold_out') then
    raise exception using errcode = '22023', message = 'invalid_value';
  end if;
  update public.locations set out_ingredient_display = p_mode where id = p_location_id
  returning restaurant_id into v_restaurant;
  insert into public.audit_log (restaurant_id, location_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, p_location_id, 'member', auth.uid(), 'ingredient.display', 'location', p_location_id,
          jsonb_build_object('mode', p_mode));
end $$;

-- Create (p_ingredient_id null) or change an ingredient. p_names: {"hy": required, "ru", "en"}.
-- p_is_active null keeps the stored value. Returns the id.
create function api.save_ingredient(
  p_restaurant_id uuid,
  p_ingredient_id uuid,
  p_names jsonb,
  p_unit text,
  p_cost_per_unit numeric default 0,
  p_kcal_per_100g numeric default null,
  p_is_active boolean default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_hy text;
  v_i18n jsonb := '{}'::jsonb;
  v_lang text;
  v_val text;
  v_id uuid;
begin
  perform private.assert_restaurant_role(p_restaurant_id, '{owner,manager}');
  if p_names is null or jsonb_typeof(p_names) <> 'object' then
    raise exception using errcode = '22023', message = 'name_required';
  end if;
  perform private.require_hy_name(p_names);
  v_hy := btrim(p_names ->> 'hy');
  if char_length(v_hy) > 80 then
    raise exception using errcode = '22023', message = 'name_too_long';
  end if;
  foreach v_lang in array array['ru', 'en'] loop
    v_val := nullif(btrim(coalesce(p_names ->> v_lang, '')), '');
    if v_val is not null then
      if char_length(v_val) > 80 then
        raise exception using errcode = '22023', message = 'name_too_long';
      end if;
      v_i18n := v_i18n || jsonb_build_object(v_lang, v_val);
    end if;
  end loop;
  if p_unit is null or p_unit not in ('g', 'ml', 'pcs') or coalesce(p_cost_per_unit, 0) < 0
     or (p_kcal_per_100g is not null and p_kcal_per_100g not between 0 and 1000) then
    raise exception using errcode = '22023', message = 'invalid_value';
  end if;

  begin
    if p_ingredient_id is null then
      if (select count(*) from public.ingredients i where i.restaurant_id = p_restaurant_id) >= 500 then
        raise exception using errcode = 'RS422', message = 'ingredient_limit';
      end if;
      insert into public.ingredients (restaurant_id, name, name_i18n, unit, cost_per_unit, kcal_per_100g, is_active)
      values (p_restaurant_id, v_hy, v_i18n, p_unit, coalesce(p_cost_per_unit, 0), p_kcal_per_100g, coalesce(p_is_active, true))
      returning id into v_id;
    else
      update public.ingredients
      set name = v_hy, name_i18n = v_i18n, unit = p_unit, cost_per_unit = coalesce(p_cost_per_unit, 0),
          kcal_per_100g = p_kcal_per_100g, is_active = coalesce(p_is_active, is_active)
      where id = p_ingredient_id and restaurant_id = p_restaurant_id
      returning id into v_id;
      if v_id is null then
        raise exception using errcode = '42501', message = 'forbidden';
      end if;
    end if;
  exception when unique_violation then
    raise exception using errcode = 'RS409', message = 'ingredient_exists';
  end;

  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (p_restaurant_id, 'member', auth.uid(),
          case when p_ingredient_id is null then 'ingredient.created' else 'ingredient.updated' end,
          'ingredient', v_id, jsonb_build_object('name', v_hy, 'unit', p_unit));
  return v_id;
end $$;

-- The reference list, filtered by a typed text (any language), for owners and managers.
create function api.ingredient_catalog(p_query text default null)
returns table (key text, names jsonb, unit text, kcal_per_100g numeric)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_q text := lower(btrim(coalesce(p_query, '')));
begin
  if not exists (select 1 from private.my_restaurant_ids('{owner,manager}')) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  return query
  select c.key, c.name_i18n, c.unit, c.kcal_per_100g
  from public.ingredient_catalog c
  where v_q = '' or lower(c.name_i18n::text) like '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by c.name_i18n ->> 'en'
  limit 120;
end $$;

-- Copy one reference ingredient into the café. Returns the café's ingredient
-- (an existing one with the same Armenian name is reused).
create function api.add_catalog_ingredient(p_restaurant_id uuid, p_key text, p_cost_per_unit numeric default 0) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.ingredient_catalog;
  v_id uuid;
begin
  perform private.assert_restaurant_role(p_restaurant_id, '{owner,manager}');
  select * into v_c from public.ingredient_catalog where key = p_key;
  if not found then
    raise exception using errcode = '22023', message = 'invalid_value';
  end if;
  select i.id into v_id from public.ingredients i
  where i.restaurant_id = p_restaurant_id and lower(i.name) = lower(v_c.name_i18n ->> 'hy');
  if v_id is not null then
    return v_id;
  end if;
  return api.save_ingredient(p_restaurant_id, null,
                             jsonb_build_object('hy', v_c.name_i18n ->> 'hy', 'ru', v_c.name_i18n ->> 'ru', 'en', v_c.name_i18n ->> 'en'),
                             v_c.unit, p_cost_per_unit, v_c.kcal_per_100g);
end $$;

-- Add or change one ingredient of a dish: how much, whether it is a key
-- ingredient, and what can replace it (with the price difference in AMD, may
-- be negative; null = no price change). Replaceable = a substitute is set.
-- Passing is_key false clears the substitute.
create function api.set_item_ingredient(
  p_item_id uuid,
  p_ingredient_id uuid,
  p_quantity numeric,
  p_is_key boolean default false,
  p_substitute_ingredient_id uuid default null,
  p_price_delta numeric default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
  v_key boolean := coalesce(p_is_key, false);
  v_id uuid;
begin
  select i.restaurant_id into v_restaurant from public.items i where i.id = p_item_id;
  if v_restaurant is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  perform private.assert_restaurant_role(v_restaurant, '{owner,manager}');
  if not exists (select 1 from public.ingredients g where g.id = p_ingredient_id and g.restaurant_id = v_restaurant)
     or (p_substitute_ingredient_id is not null
         and not exists (select 1 from public.ingredients g where g.id = p_substitute_ingredient_id and g.restaurant_id = v_restaurant)) then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 999999
     or p_substitute_ingredient_id = p_ingredient_id
     or (p_price_delta is not null and (p_price_delta not between -1000000 and 1000000
                                        or p_substitute_ingredient_id is null)) then
    raise exception using errcode = '22023', message = 'invalid_value';
  end if;
  if not v_key then
    p_substitute_ingredient_id := null;
    p_price_delta := null;
  end if;

  update public.recipe_lines
  set quantity = round(p_quantity, 3), is_key = v_key, substitute_ingredient_id = p_substitute_ingredient_id,
      substitute_price_delta = p_price_delta
  where item_id = p_item_id and ingredient_id = p_ingredient_id
  returning id into v_id;
  if v_id is null then
    insert into public.recipe_lines (restaurant_id, item_id, ingredient_id, quantity, is_key, substitute_ingredient_id, substitute_price_delta)
    values (v_restaurant, p_item_id, p_ingredient_id, round(p_quantity, 3), v_key, p_substitute_ingredient_id, p_price_delta)
    returning id into v_id;
  end if;

  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, 'member', auth.uid(), 'recipe.line', 'item', p_item_id,
          jsonb_build_object('ingredient_id', p_ingredient_id, 'is_key', v_key,
                             'substitute_id', p_substitute_ingredient_id, 'price_delta', p_price_delta));
  return v_id;
end $$;

create function api.remove_item_ingredient(p_item_id uuid, p_ingredient_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_restaurant uuid;
begin
  select i.restaurant_id into v_restaurant from public.items i where i.id = p_item_id;
  if v_restaurant is null then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  perform private.assert_restaurant_role(v_restaurant, '{owner,manager}');
  delete from public.recipe_lines where item_id = p_item_id and ingredient_id = p_ingredient_id;
  insert into public.audit_log (restaurant_id, actor_kind, actor_user_id, action, entity, entity_id, data)
  values (v_restaurant, 'member', auth.uid(), 'recipe.line_removed', 'item', p_item_id,
          jsonb_build_object('ingredient_id', p_ingredient_id));
end $$;

-- Old rows go: an outage ends by itself (until > now()), this only tidies the table.
create function private.purge_old_outages() returns void
language sql security definer set search_path = '' as $$
  delete from public.ingredient_outages where until < now() - interval '2 days'
$$;

do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('pativ-purge-outages', '20 3 * * *', 'select private.purge_old_outages()');
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Privileges: nothing is callable until granted by name
-- -----------------------------------------------------------------------------
revoke execute on function
  private.ingredient_names(uuid), private.business_day_end(uuid), private.outage_effects(uuid),
  private.outage_overlay(uuid), private.outage_version(jsonb), private.merge_sold_out(jsonb, jsonb),
  private.apply_outages_menu(jsonb), private.apply_outages_status(jsonb, uuid),
  private.assert_subs_acked(uuid, jsonb, jsonb),
  private.apply_ingredient_out(uuid, uuid, boolean, text, public.actor_kind, uuid, uuid),
  private.purge_old_outages()
from public, anon, authenticated;

revoke execute on function private.place_guest_order(uuid, uuid, uuid, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function private.place_guest_order(uuid, uuid, uuid, jsonb, text, jsonb) to service_role;
revoke execute on function api.guest_place_order(uuid, uuid, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function api.guest_place_order(uuid, uuid, jsonb, text, jsonb) to authenticated;

revoke execute on function api.public_menu(text, text) from public, anon, authenticated;
grant execute on function api.public_menu(text, text) to anon, authenticated;
revoke execute on function api.public_menu_status(uuid) from public, anon, authenticated;
grant execute on function api.public_menu_status(uuid) to anon, authenticated;

revoke execute on function api.set_ingredient_out(uuid, uuid, boolean) from public, anon, authenticated;
grant execute on function api.set_ingredient_out(uuid, uuid, boolean) to authenticated;
revoke execute on function api.search_ingredients(uuid, text) from public, anon, authenticated;
grant execute on function api.search_ingredients(uuid, text) to authenticated;
revoke execute on function api.set_out_ingredient_display(uuid, text) from public, anon, authenticated;
grant execute on function api.set_out_ingredient_display(uuid, text) to authenticated;
revoke execute on function api.save_ingredient(uuid, uuid, jsonb, text, numeric, numeric, boolean) from public, anon, authenticated;
grant execute on function api.save_ingredient(uuid, uuid, jsonb, text, numeric, numeric, boolean) to authenticated;
revoke execute on function api.ingredient_catalog(text) from public, anon, authenticated;
grant execute on function api.ingredient_catalog(text) to authenticated;
revoke execute on function api.add_catalog_ingredient(uuid, text, numeric) from public, anon, authenticated;
grant execute on function api.add_catalog_ingredient(uuid, text, numeric) to authenticated;
revoke execute on function api.set_item_ingredient(uuid, uuid, numeric, boolean, uuid, numeric) from public, anon, authenticated;
grant execute on function api.set_item_ingredient(uuid, uuid, numeric, boolean, uuid, numeric) to authenticated;
revoke execute on function api.remove_item_ingredient(uuid, uuid) from public, anon, authenticated;
grant execute on function api.remove_item_ingredient(uuid, uuid) to authenticated;
