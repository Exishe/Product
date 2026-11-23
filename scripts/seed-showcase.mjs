#!/usr/bin/env node
// Seeds the demo cafés on the dev project, only through the app's own `api`
// functions as a signed-in owner (publishable key, RLS applies), exactly like
// the app does. Safe to run twice: everything is looked up before it is made.
//
//   node --env-file=.env.local scripts/seed-showcase.mjs [showcase] [blanca]
//
// Environment (secrets are read from here only, never written to the repo):
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
//   SHOWCASE_DEMO_EMAIL      default demo-pativ@example.com
//   SHOWCASE_DEMO_PASSWORD   if unset, read from the credentials file, else generated (one sign-up)
//   SHOWCASE_CREDENTIALS_OUT where the generated logins go (default: the OS temp dir)
//   BLANCA_DEMO_EMAIL, BLANCA_DEMO_PASSWORD   for the "blanca" part
//
// The old café `demo-cafe` is the CI fixture and is never touched. Parts that
// need migrations not yet applied on the project (calories / Chef's pick,
// 20261123320000) are detected and skipped with a note; run again after CI
// has applied them.

import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL_ || !KEY) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required");

const client = () => createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const log = (...a) => console.log(...a);
const secret = (n = 12) => randomBytes(n).toString("base64url");

async function call(c, fn, args) {
  const { data, error } = await c.schema("api").rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
}
async function must(q, what) {
  const { data, error } = await q;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}
// True when the function exists on the project (any other error means it is there).
async function hasFn(c, fn, args) {
  const { error } = await c.schema("api").rpc(fn, args);
  return !(error && (error.code === "PGRST202" || /could not find the function/i.test(error.message)));
}
const ZERO = "00000000-0000-0000-0000-000000000000";

// ---------------------------------------------------------------------------
// Ingredients the reference catalog does not have (kcal per 100 g or ml)
// ---------------------------------------------------------------------------
const CUSTOM = {
  oat_milk: { hy: "Վարսակի կաթ", ru: "Овсяное молоко", en: "Oat milk", unit: "ml", kcal: 45 },
  matcha: { hy: "Մատչա", ru: "Матча", en: "Matcha", unit: "g", kcal: 324 },
  mixed_berries: { hy: "Հատապտուղների խառնուրդ", ru: "Ягодный микс", en: "Mixed berries", unit: "g", kcal: 50 },
  espresso: { hy: "Էսպրեսսո", ru: "Эспрессо", en: "Espresso", unit: "ml", kcal: 2 },
  smoked_salmon: { hy: "Ապխտած սաղմոն", ru: "Копчёный лосось", en: "Smoked salmon", unit: "g", kcal: 180 },
  smoked_trout: { hy: "Ապխտած իշխան", ru: "Копчёная форель", en: "Smoked trout", unit: "g", kcal: 150 },
  green_beans: { hy: "Կանաչ լոբի", ru: "Стручковая фасоль", en: "Green beans", unit: "g", kcal: 31 },
  forest_berries: { hy: "Անտառային հատապտուղներ", ru: "Лесные ягоды", en: "Forest berries", unit: "g", kcal: 45 },
  burrata: { hy: "Բուրատա", ru: "Страчателла-бурата", en: "Burrata", unit: "g", kcal: 300 },
};
// One egg weighs about this much (used for kcal once calories are on the project).
const EGG_GRAMS = 55;

// ---------------------------------------------------------------------------
// The showcase menu
// ---------------------------------------------------------------------------
const CATEGORIES = [
  { key: "breakfast", hy: "Նախաճաշ", ru: "Завтраки", en: "Breakfast", window: ["07:00", "23:00"] },
  { key: "starters", hy: "Նախուտեստներ և աղցաններ", ru: "Закуски и салаты", en: "Starters and salads" },
  { key: "mains", hy: "Հիմնական ուտեստներ", ru: "Основные блюда", en: "Mains" },
  { key: "sides", hy: "Կողմնակի ուտեստներ և սոուսներ", ru: "Гарниры и соусы", en: "Sides and sauces" },
  { key: "desserts", hy: "Աղանդեր", ru: "Десерты", en: "Desserts" },
  { key: "drinks", hy: "Ըմպելիքներ", ru: "Напитки", en: "Drinks" },
];

// ing: [catalogKey | custom key, quantity (g, ml or pcs), options]
const DISHES = [
  { key: "omelette", cat: "breakfast", price: 2200, type: "breakfast", tags: ["vegetarian"], allergens: ["eggs", "milk"],
    hy: ["Օմլետ պանրով և կանաչիով", "Երեք ձվից փափուկ օմլետ՝ կարծր պանրով և թարմ կանաչիով։"],
    ru: ["Омлет с сыром и зеленью", "Пышный омлет из трёх яиц с сыром и свежей зеленью."],
    en: ["Cheese and herb omelette", "Fluffy three-egg omelette with hard cheese and fresh herbs."],
    ing: [["egg", 3], ["hard_cheese", 30], ["herbs", 8], ["butter", 10]] },
  { key: "granola", cat: "breakfast", price: 1900, type: "breakfast", tags: ["vegetarian"], allergens: ["gluten", "milk"],
    hy: ["Գրանոլա մածունով", "Տնական գրանոլա, մածուն, մեղր և սեզոնային հատապտուղներ։"],
    ru: ["Гранола с мацони", "Домашняя гранола, мацони, мёд и сезонные ягоды."],
    en: ["Granola with matsoni", "House granola, matsoni, honey and seasonal berries."],
    ing: [["oats", 50], ["matsoni", 150], ["honey", 15], ["mixed_berries", 50]] },
  { key: "pancakes", cat: "breakfast", price: 2100, type: "breakfast", tags: ["vegetarian"], allergens: ["gluten", "eggs", "milk"],
    hy: ["Նրբաբլիթ ելակով", "Բարակ նրբաբլիթներ թարմ ելակով և փոշեշաքարով։"],
    ru: ["Блинчики с клубникой", "Тонкие блинчики со свежей клубникой и сахарной пудрой."],
    en: ["Pancakes with strawberries", "Thin pancakes with fresh strawberries and powdered sugar."],
    ing: [["flour", 70], ["milk", 120], ["egg", 1], ["sugar", 10],
      ["strawberry", 80, { key: true, sub: "mixed_berries", delta: 0 }]] },
  { key: "toast", cat: "breakfast", price: 2400, type: "breakfast", tags: ["vegetarian"], allergens: ["gluten", "eggs"],
    hy: ["Տոստ ավոկադոյով և ձվով", "Բոված հաց, մանրացրած ավոկադո, եփած ձու և ձիթապտղի յուղ։"],
    ru: ["Тост с авокадо и яйцом", "Поджаренный хлеб, авокадо, яйцо пашот и оливковое масло."],
    en: ["Avocado toast with egg", "Toasted bread, smashed avocado, poached egg and olive oil."],
    ing: [["bread", 70], ["avocado", 60], ["egg", 1], ["olive_oil", 8]] },
  { key: "bagel", cat: "breakfast", price: 3200, type: "breakfast", tags: [], allergens: ["gluten", "fish", "milk"],
    hy: ["Բեյգլ ապխտած սաղմոնով", "Բեյգլ սերուցքային պանրով, ապխտած սաղմոնով և վարունգով։"],
    ru: ["Бейгл с копчёным лососем", "Бейгл со сливочным сыром, копчёным лососем и огурцом."],
    en: ["Bagel with smoked salmon", "Bagel with cream cheese, smoked salmon and cucumber."],
    ing: [["bread", 80], ["cream_cheese", 30], ["cucumber", 30],
      ["smoked_salmon", 50, { key: true, sub: "smoked_trout", delta: -400 }]] },

  { key: "greek", cat: "starters", price: 2200, type: "starter_salad", tags: ["vegetarian", "gluten_free"], allergens: ["milk"],
    hy: ["Հունական աղցան", "Լոլիկ, վարունգ, ֆետա, ձիթապտուղ և ձիթապտղի յուղ։"],
    ru: ["Греческий салат", "Помидоры, огурцы, фета, оливки и оливковое масло."],
    en: ["Greek salad", "Tomato, cucumber, feta, olives and olive oil."],
    ing: [["tomato", 100], ["cucumber", 80], ["feta", 40], ["olives", 20], ["olive_oil", 10]] },
  { key: "caesar", cat: "starters", price: 2900, type: "starter_salad", tags: ["popular"], allergens: ["gluten", "eggs", "milk"],
    hy: ["Կեսար հավով", "Հավի կրծքամիս, հռոմեական աղցան, պարմեզան և կրուտոններ։"],
    ru: ["Цезарь с курицей", "Куриная грудка, салат ромэн, пармезан и сухарики."],
    en: ["Chicken Caesar", "Chicken breast, romaine, parmesan and croutons."],
    ing: [["salad_leaves", 80], ["chicken_breast", 100], ["hard_cheese", 20], ["bread", 20], ["mayonnaise", 25]] },
  { key: "hummus", cat: "starters", price: 1800, type: "starter_salad", tags: ["vegan"], allergens: ["sesame", "gluten"],
    hy: ["Հումուս լավաշով", "Սիսեռի հումուս՝ ձիթապտղի յուղով և տաք լավաշով։"],
    ru: ["Хумус с лавашом", "Хумус из нута с оливковым маслом и тёплым лавашем."],
    en: ["Hummus with lavash", "Chickpea hummus with olive oil and warm lavash."],
    ing: [["chickpeas", 60], ["olive_oil", 10], ["lavash", 40]] },

  { key: "khorovats", cat: "mains", price: 4200, type: "main", chef: true, tags: ["gluten_free"], allergens: [],
    hy: ["Խոզի խորովածք", "Ածխի վրա խորոված խոզի վիզ, թխած լոլիկ և կանաչի։"],
    ru: ["Хоровац из свинины", "Свиная шейка на углях, запечённый помидор и зелень."],
    en: ["Pork khorovats", "Charcoal-grilled pork neck, baked tomato and herbs."],
    ing: [["pork", 220], ["tomato", 60], ["onion", 40], ["herbs", 5]] },
  { key: "chicken", cat: "mains", price: 3600, type: "main", tags: ["gluten_free"], allergens: ["milk"],
    hy: ["Հավ սնկով և սերուցքով", "Հավի ազդր սերուցքի և շամպինիոնի սոուսով։"],
    ru: ["Курица в сливочно-грибном соусе", "Куриное бедро в сливочном соусе с шампиньонами."],
    en: ["Chicken in creamy mushroom sauce", "Chicken thigh in a cream sauce with mushrooms."],
    ing: [["chicken_thigh", 200], ["mushrooms", 80], ["cream", 60], ["butter", 10]] },
  { key: "pasta", cat: "mains", price: 2600, type: "main", tags: ["vegetarian"], allergens: ["gluten", "milk"],
    hy: ["Պաստա լոլիկի սոուսով", "Սպագետի տնական լոլիկի սոուսով և կարծր պանրով։"],
    ru: ["Паста с томатным соусом", "Спагетти с домашним томатным соусом и твёрдым сыром."],
    en: ["Pasta with tomato sauce", "Spaghetti with house tomato sauce and hard cheese."],
    ing: [["pasta", 90], ["tomato", 80], ["tomato_paste", 30], ["garlic", 5], ["olive_oil", 10], ["hard_cheese", 15]] },
  { key: "salmon", cat: "mains", price: 5200, type: "main", chef: true, tags: ["gluten_free"], allergens: ["fish"],
    hy: ["Խորոված սաղմոն բանջարեղենով", "Սաղմոնի ֆիլե գրիլի վրա, խորոված դդմիկ ու բիբար, կիտրոն։"],
    ru: ["Лосось на гриле с овощами", "Филе лосося на гриле, кабачок, болгарский перец и лимон."],
    en: ["Grilled salmon with vegetables", "Grilled salmon fillet, zucchini, bell pepper and lemon."],
    ing: [["salmon", 180], ["zucchini", 80], ["bell_pepper", 60], ["lemon", 15], ["olive_oil", 10]] },
  { key: "burger", cat: "mains", price: 3800, type: "main", tags: [], allergens: ["gluten", "eggs", "milk", "sesame"],
    hy: ["Տավարի բուրգեր", "Տավարի կոտլետ, պանիր, լոլիկ, սոխ և տնական սոուս փափուկ բուլկու մեջ։"],
    ru: ["Бургер с говядиной", "Говяжья котлета, сыр, помидор, лук и фирменный соус в мягкой булочке."],
    en: ["Beef burger", "Beef patty, cheese, tomato, onion and house sauce in a soft bun."],
    ing: [["ground_beef", 150], ["bread", 80], ["hard_cheese", 20], ["tomato", 40], ["onion", 20], ["mayonnaise", 15]] },

  { key: "fries", cat: "sides", price: 1200, type: "side", tags: ["vegan", "gluten_free"], allergens: [], noAllergens: true,
    hy: ["Տապակած կարտոֆիլ", "Խրթխրթան կարտոֆիլ ծովի աղով։"],
    ru: ["Картофель фри", "Хрустящий картофель с морской солью."],
    en: ["French fries", "Crispy fries with sea salt."],
    ing: [["potato", 200], ["sunflower_oil", 20], ["salt", 2]] },
  { key: "veg", cat: "sides", price: 1800, type: "side", tags: ["vegan", "gluten_free"], allergens: [], noAllergens: true,
    hy: ["Խորոված բանջարեղեն", "Սմբուկ, դդմիկ և բիբար ածխի վրա։"],
    ru: ["Овощи гриль", "Баклажан, кабачок и перец на углях."],
    en: ["Grilled vegetables", "Eggplant, zucchini and pepper from the charcoal grill."],
    ing: [["eggplant", 80], ["zucchini", 80], ["bell_pepper", 60], ["olive_oil", 10]] },
  { key: "sauce", cat: "sides", price: 400, type: "sauce", tags: ["vegetarian", "gluten_free"], allergens: ["milk"],
    hy: ["Մածունի սոուս սխտորով", "Սառը մածուն, սխտոր և կանաչի։"],
    ru: ["Соус из мацони с чесноком", "Холодное мацони, чеснок и зелень."],
    en: ["Garlic matsoni sauce", "Cold matsoni with garlic and herbs."],
    ing: [["matsoni", 50], ["garlic", 3], ["herbs", 3]] },

  { key: "baklava", cat: "desserts", price: 1500, type: "dessert", chef: true, tags: ["vegetarian"], allergens: ["gluten", "nuts", "milk"],
    hy: ["Փախլավա", "Շերտավոր խմոր, ընկույզ և մեղր։"],
    ru: ["Пахлава", "Слоёное тесто, грецкий орех и мёд."],
    en: ["Baklava", "Layered pastry with walnuts and honey."],
    ing: [["flour", 30], ["walnut", 25], ["honey", 20], ["butter", 20]] },
  { key: "cheesecake", cat: "desserts", price: 2200, type: "dessert", tags: ["vegetarian", "popular"], allergens: ["gluten", "eggs", "milk"],
    hy: ["Չիզքեյք", "Սերուցքային պանրով չիզքեյք՝ ելակի սոուսով։"],
    ru: ["Чизкейк", "Чизкейк со сливочным сыром и клубничным соусом."],
    en: ["Cheesecake", "Cream cheese cheesecake with strawberry sauce."],
    ing: [["cream_cheese", 80], ["sugar", 20], ["egg", 1], ["flour", 15], ["butter", 20], ["strawberry", 30]] },
  { key: "icecream", cat: "desserts", price: 1500, type: "dessert", tags: ["vegetarian", "gluten_free"], allergens: ["milk"],
    hy: ["Պաղպաղակ՝ երեք գնդիկ", "Վանիլ, շոկոլադ կամ ելակ՝ ձեր ընտրությամբ։"],
    ru: ["Мороженое, три шарика", "Ваниль, шоколад или клубника на выбор."],
    en: ["Ice cream, three scoops", "Vanilla, chocolate or strawberry, your pick."],
    ing: [["ice_cream", 150]] },

  { key: "espresso", cat: "drinks", price: 700, type: "coffee_tea", tags: ["vegan", "gluten_free"], allergens: [], noAllergens: true,
    hy: ["Էսպրեսսո", "Մեկ չափաբաժին թարմ աղացած սուրճից։"],
    ru: ["Эспрессо", "Одна порция свежемолотого кофе."],
    en: ["Espresso", "A single shot of freshly ground coffee."],
    ing: [["espresso", 30]] },
  { key: "cappuccino", cat: "drinks", price: 1100, type: "coffee_tea", tags: ["vegetarian"], allergens: ["milk"],
    hy: ["Կապուչինո", "Էսպրեսսո և շոյված կաթ։"],
    ru: ["Капучино", "Эспрессо и взбитое молоко."],
    en: ["Cappuccino", "Espresso with steamed milk."],
    ing: [["espresso", 30], ["milk", 150]] },
  { key: "latte", cat: "drinks", price: 1300, type: "coffee_tea", tags: ["vegetarian", "popular"], allergens: ["milk"],
    hy: ["Լատտե", "Էսպրեսսո և շատ փափուկ կաթ։"],
    ru: ["Латте", "Эспрессо и много нежного молока."],
    en: ["Latte", "Espresso with plenty of silky milk."],
    ing: [["espresso", 30], ["milk", 250, { key: true, sub: "oat_milk", delta: 300 }]] },
  { key: "matcha", cat: "drinks", price: 1500, type: "coffee_tea", tags: ["vegetarian"], allergens: ["milk"],
    hy: ["Մատչա լատտե", "Ճապոնական մատչա և կաթ։"],
    ru: ["Матча-латте", "Японская матча и молоко."],
    en: ["Matcha latte", "Japanese matcha with milk."],
    ing: [["matcha", 4, { key: true }], ["milk", 200]] },
  { key: "tea", cat: "drinks", price: 700, type: "coffee_tea", tags: ["vegan", "gluten_free"], allergens: [], noAllergens: true,
    hy: ["Թեյ", "Սև կամ կանաչ թեյ թեյամանով։"],
    ru: ["Чай", "Чёрный или зелёный чай в чайнике."],
    en: ["Tea", "Black or green tea, served in a pot."],
    ing: [["tea_leaves", 4]] },
  { key: "juice", cat: "drinks", price: 1600, type: "cold_drink", tags: ["vegan", "gluten_free"], allergens: [], noAllergens: true,
    hy: ["Նարնջի թարմ հյութ", "Թարմ քամված նարինջ՝ առանց շաքարի։"],
    ru: ["Свежевыжатый апельсиновый сок", "Свежевыжатый апельсин без сахара."],
    en: ["Fresh orange juice", "Freshly squeezed orange, no added sugar."],
    ing: [["orange", 250]] },
  { key: "lemonade", cat: "drinks", price: 1200, type: "cold_drink", tags: ["vegan", "gluten_free"], allergens: [], noAllergens: true,
    hy: ["Տնական լիմոնադ", "Կիտրոն, անանուխ և սառույց։"],
    ru: ["Домашний лимонад", "Лимон, мята и лёд."],
    en: ["Homemade lemonade", "Lemon, mint and ice."],
    ing: [["lemon", 40], ["sugar", 25], ["water", 250]] },
  { key: "tan", cat: "drinks", price: 600, type: "cold_drink", tags: ["vegetarian", "gluten_free"], allergens: ["milk"],
    hy: ["Թան", "Սառը թան՝ աղով ու չոր անանուխով։"],
    ru: ["Тан", "Холодный тан с солью и сушёной мятой."],
    en: ["Tan (salted yogurt drink)", "Chilled salted yogurt drink with dried mint."],
    ing: [["matsoni", 150], ["water", 100], ["salt", 1]] },
];

// "Goes well with" by hand: dish -> [suggested dishes] (the default type table stays as it is).
const PAIRINGS = {
  khorovats: ["sauce", "veg"],
  burger: ["fries", "lemonade"],
  salmon: ["veg", "juice"],
  baklava: ["espresso", "cappuccino"],
  omelette: ["latte", "juice"],
  pancakes: ["cappuccino"],
};

const BRAND = {
  colors: { header: "#2f4a3f", accent: "#b4572f", highlight: "#e8c27a", line: "#d9d2c3", page: "#fbf8f2" },
  heading_font: "Cormorant Garamond",
  body_font: "Inter",
  plate: "porcelain",
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
async function myRestaurant(c, slug) {
  const rows = await must(c.from("restaurants").select("id, slug").eq("slug", slug), "restaurant");
  return rows[0] ?? null;
}
async function locationOf(c, restaurantId) {
  const rows = await must(c.from("locations").select("id").eq("restaurant_id", restaurantId).limit(1), "location");
  return rows[0].id;
}
const byLocale = (rows, key = "name") => Object.fromEntries(rows.map((t) => [t.locale, t[key]]));

// A café's ingredients: catalog entries copied once, custom ones saved once. Names are the key.
function ingredientBook(c, restaurantId) {
  let existing;
  const memo = new Map();
  return async (key) => {
    if (memo.has(key)) return memo.get(key);
    existing ??= await must(c.from("ingredients").select("id, name").eq("restaurant_id", restaurantId), "ingredients");
    let id;
    if (CUSTOM[key]) {
      const d = CUSTOM[key];
      id = existing.find((g) => g.name.toLowerCase() === d.hy.toLowerCase())?.id;
      id ??= await call(c, "save_ingredient", {
        p_restaurant_id: restaurantId, p_ingredient_id: null, p_names: { hy: d.hy, ru: d.ru, en: d.en },
        p_unit: d.unit, p_cost_per_unit: 0, p_kcal_per_100g: d.kcal, p_is_active: true,
      });
    } else {
      id = await call(c, "add_catalog_ingredient", { p_restaurant_id: restaurantId, p_key: key, p_cost_per_unit: 0 });
    }
    memo.set(key, id);
    return id;
  };
}

async function applyIngredients(c, book, itemId, lines) {
  for (const [key, qty, o = {}] of lines) {
    await call(c, "set_item_ingredient", {
      p_item_id: itemId,
      p_ingredient_id: await book(key),
      p_quantity: qty,
      p_is_key: !!o.key,
      ...(o.sub ? { p_substitute_ingredient_id: await book(o.sub), p_price_delta: o.delta ?? 0 } : {}),
    });
  }
}

// Proposals from section names; applies only the types we agree with (`want`: itemId -> type).
async function applyTypes(c, locationId, want, label) {
  const proposals = await call(c, "suggest_item_types", { p_location_id: locationId });
  const proposed = new Map(proposals.map((p) => [p.item_id, p.suggested_type]));
  let applied = 0;
  const disagreed = [];
  for (const [itemId, type] of want) {
    if (!type) continue;
    const p = proposed.get(itemId);
    if (p && p !== type) disagreed.push(`${p}->${type}`);
    await call(c, "set_item_type", { p_item_id: itemId, p_type: type });
    applied++;
  }
  log(`${label}: types set on ${applied}; proposal differed (overridden) on ${disagreed.length}`);
}

async function guestCheck(location, itemId) {
  const anon = client();
  const { data, error } = await anon.schema("api").rpc("public_suggestions", { p_location_id: location, p_item_id: itemId, p_cart_item_ids: [] });
  return error ? `error ${error.message}` : data.suggestions;
}

// ---------------------------------------------------------------------------
// A. The showcase café
// ---------------------------------------------------------------------------
const CREDS = process.env.SHOWCASE_CREDENTIALS_OUT || join(tmpdir(), "showcase-credentials.txt");
function readCreds() {
  const out = {};
  if (existsSync(CREDS))
    for (const line of readFileSync(CREDS, "utf8").split("\n")) {
      const m = /^([^:]+):\s*(.*)$/.exec(line);
      if (m) out[m[1].trim()] = m[2].trim();
    }
  return out;
}
function writeCreds(v) {
  const L = (k, x) => `${k}: ${x ?? ""}`;
  writeFileSync(
    CREDS,
    [
      L("Owner email", v.ownerEmail), L("Owner password", v.ownerPassword),
      L("Waiter login", v.waiterUser), L("Waiter password", v.waiterPassword),
      L("Kitchen login", v.kitchenUser), L("Kitchen password", v.kitchenPassword),
      L("Guest table 1", v.tablePath), L("Kitchen URL", v.kitchenPath), "",
    ].join("\n"),
    { mode: 0o600 },
  );
}

async function signInOrUp(email, password) {
  const c = client();
  let r = await c.auth.signInWithPassword({ email, password });
  if (!r.error) return c;
  if (!/invalid login|invalid_credentials/i.test(r.error.message)) throw new Error(`sign-in: ${r.error.message}`);
  // No such owner yet: the one sign-up (the dev Auth rate-limits these per IP).
  const up = await c.auth.signUp({ email, password, options: { data: { display_name: "Pativ Demo" } } });
  if (up.error) throw new Error(`sign-up: ${up.error.message}`);
  if (!up.data.session) throw new Error("sign-up gave no session (email confirmation is on?)");
  log("signed up", email);
  return c;
}

async function showcase() {
  const saved = readCreds();
  const email = process.env.SHOWCASE_DEMO_EMAIL || saved["Owner email"] || "demo-pativ@example.com";
  const password = process.env.SHOWCASE_DEMO_PASSWORD || saved["Owner password"] || secret(15);
  const creds = {
    ownerEmail: email, ownerPassword: password,
    waiterPassword: saved["Waiter password"] || secret(12), kitchenPassword: saved["Kitchen password"] || secret(12),
  };
  writeCreds(creds); // before anything can fail: a generated password must not be lost
  const c = await signInOrUp(email, password);

  // Café, location, staff logins
  let r = await myRestaurant(c, "pativ-demo");
  if (!r) {
    const id = await call(c, "create_restaurant", { p_name: "Pativ Demo", p_slug: "pativ-demo", p_location_name: "Pativ Demo", p_display_name: "Pativ Demo" });
    r = { id };
    log("café created");
  }
  const rid = r.id;
  const loc = await locationOf(c, rid);
  const logins = await call(c, "list_staff_logins", { p_location_id: loc });
  for (const l of logins) {
    if (l.role === "waiter") { creds.waiterUser = l.username; await call(c, "set_staff_password", { p_member_id: l.member_id, p_password: creds.waiterPassword }); }
    if (l.role === "kitchen") { creds.kitchenUser = l.username; await call(c, "set_staff_password", { p_member_id: l.member_id, p_password: creds.kitchenPassword }); creds.stationId = l.station_id; }
  }
  writeCreds(creds);

  const hasKcal = await hasFn(c, "item_kcal", { p_item_id: ZERO });
  log(hasKcal ? "calories migration present" : "PENDING CI: calories / Chef's pick migration (20261123320000) not on the project yet");

  // Brand
  await call(c, "set_brand", { p_restaurant_id: rid, p_brand: BRAND });

  // Tables in two areas
  const areaRows = await must(c.from("areas").select("id, name").eq("location_id", loc), "areas");
  const area = {};
  for (const [i, [k, name]] of [["hall", "Դահլիճ"], ["terrace", "Տերաս"]].entries()) {
    area[k] = areaRows.find((a) => a.name === name)?.id
      ?? (await must(c.from("areas").insert({ restaurant_id: rid, location_id: loc, name, sort: i }).select("id").single(), "area")).id;
  }
  const haveTables = await must(c.from("tables").select("id, label").eq("location_id", loc), "tables");
  const TABLES = [["1", 2, "hall"], ["2", 2, "hall"], ["3", 4, "hall"], ["4", 4, "hall"], ["5", 4, "terrace"], ["6", 6, "terrace"]];
  const tableIds = {};
  for (const [i, [label, seats, a]] of TABLES.entries()) {
    tableIds[label] = haveTables.find((t) => t.label === label)?.id
      ?? (await must(c.from("tables").insert({ restaurant_id: rid, location_id: loc, label, seats, area_id: area[a], sort: i + 1 }).select("id").single(), "table")).id;
  }
  const token = await call(c, "table_qr_token", { p_table_id: tableIds["1"] });
  creds.tablePath = `/t/${token}`;
  creds.kitchenPath = `/kitchen/${creds.stationId}`;
  writeCreds(creds);

  // Menu: sections, dishes
  await call(c, "ensure_menu", { p_restaurant_id: rid });
  const prep = (await must(c.from("prep_areas").select("id").eq("restaurant_id", rid).limit(1), "prep area"))[0].id;
  const cats = await must(c.from("categories").select("id, category_translations(locale, name)").eq("restaurant_id", rid), "categories");
  const catId = {};
  for (const k of CATEGORIES) {
    catId[k.key] = cats.find((x) => byLocale(x.category_translations).hy === k.hy)?.id
      ?? (await call(c, "save_category", { p_restaurant_id: rid, p_category_id: null, p_names: { hy: k.hy, ru: k.ru, en: k.en }, p_prep_area_id: prep }));
    if (k.window) await call(c, "set_category_window", { p_category_id: catId[k.key], p_from: k.window[0], p_to: k.window[1] });
  }
  const items = await must(c.from("items").select("id, item_translations(locale, name)").eq("restaurant_id", rid), "items");
  const itemId = {};
  for (const d of DISHES) {
    const tags = hasKcal && d.chef ? [...d.tags, "chefs_pick"] : d.tags;
    itemId[d.key] = await call(c, "save_item", {
      p_restaurant_id: rid,
      p_item: {
        id: items.find((x) => byLocale(x.item_translations).hy === d.hy[0])?.id ?? null,
        category_id: catId[d.cat], price: d.price, prep_area_id: prep, tags, allergens: d.allergens,
        // Reviewed and intentionally empty (ADR-083); the khorovats stays unreviewed so the café shows both states.
        allergens_confirmed: d.allergens.length > 0 || d.noAllergens === true,
        names: { hy: d.hy[0], ru: d.ru[0], en: d.en[0] },
        descriptions: { hy: d.hy[1], ru: d.ru[1], en: d.en[1] },
        is_active: true,
      },
    });
  }
  log(`menu: ${CATEGORIES.length} sections, ${DISHES.length} dishes`);

  // 1. Types for every dish
  await applyTypes(c, loc, DISHES.map((d) => [itemId[d.key], d.type]), "types");

  // 2 and 3. Ingredients with grams, key ingredients and substitutes
  const book = ingredientBook(c, rid);
  for (const d of DISHES) await applyIngredients(c, book, itemId[d.key], d.ing);
  if (hasKcal) await call(c, "set_ingredient_kcal", { p_ingredient_id: await book("egg"), p_kcal_per_100g: 143, p_grams_per_piece: EGG_GRAMS });
  log("ingredients and substitutes set");

  // 4. Owner pairings
  for (const [k, withs] of Object.entries(PAIRINGS))
    for (const [i, w] of withs.entries()) await call(c, "set_item_pairing", { p_item_id: itemId[k], p_suggest_item_id: itemId[w], p_sort: i });

  // 5. Promo (on), game rewards (on), alert settings stay at their defaults
  const promos = await must(c.from("promos").select("id, title").eq("location_id", loc), "promos");
  const PROMO = {
    title: { hy: "Երջանիկ ժամեր 15:00–17:00", ru: "Счастливые часы 15:00–17:00", en: "Happy hour 3–5 pm" },
    text: { hy: "Ցանկացած աղանդերի հետ երկրորդ սուրճը՝ նվեր։", ru: "Второй кофе в подарок к любому десерту.", en: "A second coffee on us with any dessert." },
  };
  const promoId = promos.find((p) => p.title?.hy === PROMO.title.hy)?.id ?? null;
  const pid = await call(c, "save_promo", { p_location_id: loc, p_promo_id: promoId, p_title: PROMO.title, p_text: PROMO.text, p_badge: "15:00–17:00", p_is_on: true });
  await call(c, "set_promo_on", { p_promo_id: pid, p_on: true });
  await call(c, "set_game_rewards", { p_location_id: loc, p_on: true, p_kind: "percent", p_level: 3, p_percent: 10 });
  log("promo on, game rewards on (level 3, 10%), Breakfast window 07:00-23:00");
  log("telegram: skipped (a link code lives 30 minutes and needs the owner's own chat)");

  // Publish, then the one-off outage round trip on the matcha latte
  await call(c, "publish_menu", { p_location_id: loc });
  const matcha = await book("matcha");
  await call(c, "set_ingredient_out", { p_location_id: loc, p_ingredient_id: matcha, p_out: true });
  const during = await call(c, "list_ingredient_outages", { p_location_id: loc });
  await call(c, "set_ingredient_out", { p_location_id: loc, p_ingredient_id: matcha, p_out: false });
  const after = await call(c, "list_ingredient_outages", { p_location_id: loc });
  log(`outage round trip: out=${JSON.stringify(during).length > 2}, restored, outages now ${Array.isArray(after) ? after.length : JSON.stringify(after)}`);

  // Guest suggestions on three dishes
  for (const k of ["khorovats", "burger", "baklava"]) {
    const s = await guestCheck(loc, itemId[k]);
    const name = (id) => DISHES.find((d) => itemId[d.key] === id)?.en[0] ?? id;
    log(`suggestions for ${k}:`, Array.isArray(s) ? s.map((x) => `${name(x.item_id)} (${x.reason})`) : s);
  }
  if (hasKcal) {
    const withKcal = [];
    for (const d of DISHES) { const k = await call(c, "item_kcal", { p_item_id: itemId[d.key] }); if (k?.kcal) withKcal.push(d.key); }
    log(`kcal numbers on ${withKcal.length} dishes`);
  }
  log("showcase done; logins in", CREDS);
}

// ---------------------------------------------------------------------------
// B. Blanca: additive only (types, ingredients, pairings, an OFF promo, OFF rewards)
// ---------------------------------------------------------------------------
const BLANCA_SECTION_TYPES = {
  // for sections the name-based proposal leaves empty
  Sorbets: "dessert", Gelato: "dessert", Bonbons: "dessert",
  "Anise liqueurs and amaro": "alcohol", Vermouth: "alcohol", Gin: "alcohol", "Mezcal and tequila": "alcohol",
  Rum: "alcohol", "Pisco, calvados, armagnac and cognac": "alcohol",
};
// [section (en), dish (en), ingredient lines]
const BLANCA_DISHES = [
  ["Coffee", "Cappuccino", [["espresso", 30], ["milk", 150, { key: true, sub: "oat_milk", delta: 300 }]]],
  ["Main courses", "Salmon steak with green beans",
    [["salmon", 180, { key: true, sub: "trout", delta: -500 }], ["green_beans", 100], ["olive_oil", 10], ["lemon", 15]]],
  ["Desserts", "Mille-feuille with forest berries",
    [["forest_berries", 60, { key: true, sub: "raspberry", delta: 0 }], ["flour", 50], ["butter", 40], ["cream", 60], ["sugar", 20]]],
  ["Salads", "Burrata with tomatoes and basil sorbet", [["burrata", 100, { key: true }], ["tomato", 150], ["olive_oil", 10]]],
  // calories only
  ["Salads", "Caesar salad with chicken", [["salad_leaves", 80], ["chicken_breast", 100], ["hard_cheese", 20], ["bread", 20], ["mayonnaise", 25]]],
  ["Pizza", "Margherita", [["flour", 120], ["mozzarella", 100], ["tomato_paste", 40], ["olive_oil", 10]]],
  ["Sides", "Mashed potatoes", [["potato", 250], ["butter", 20], ["milk", 60]]],
  ["Sides", "Grilled vegetables", [["eggplant", 80], ["zucchini", 80], ["bell_pepper", 60], ["olive_oil", 10]]],
];
// owner pairings: [section, dish] -> [[section, dish], ...]
const BLANCA_PAIRINGS = [
  [["Main courses", "Classic burger"], [["Sides", "Mashed potatoes"], ["Fresh juices and lemonades", "Tropical lemonade"]]],
  [["Main courses", "Salmon steak with green beans"], [["Sides", "Grilled vegetables"], ["White wine", "Pata Negra Rueda"]]],
  [["Desserts", "Chocolate fondant with Baileys gelato"], [["Coffee", "Espresso"]]],
  [["Breakfast", "Eggs Benedict"], [["Coffee", "Flat white"], ["Fresh juices and lemonades", "Orange juice"]]],
  [["Pizza", "Margherita"], [["Soft drinks", "Coca-Cola / Fanta / Sprite"]]],
];

async function blanca() {
  const email = process.env.BLANCA_DEMO_EMAIL, password = process.env.BLANCA_DEMO_PASSWORD;
  if (!email || !password) throw new Error("BLANCA_DEMO_EMAIL and BLANCA_DEMO_PASSWORD are required for the blanca part");
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`blanca sign-in: ${error.message}`);
  const r = await myRestaurant(c, "blanca");
  if (!r) throw new Error("no café with slug blanca for this owner");
  const rid = r.id, loc = await locationOf(c, rid);
  const hasKcal = await hasFn(c, "item_kcal", { p_item_id: ZERO });

  const cats = await must(c.from("categories").select("id, category_translations(locale, name)").eq("restaurant_id", rid), "categories");
  const secName = new Map(cats.map((x) => [x.id, byLocale(x.category_translations).en]));
  const items = await must(c.from("items").select("id, category_id, item_type, item_translations(locale, name)").eq("restaurant_id", rid), "items");
  const find = (section, dish) => {
    const m = items.find((i) => secName.get(i.category_id) === section && byLocale(i.item_translations).en === dish);
    if (!m) throw new Error(`blanca: no dish "${dish}" in "${section}"`);
    return m.id;
  };

  // Types: the proposal for the untyped, plus our own for the sections it cannot read
  const proposals = await call(c, "suggest_item_types", { p_location_id: loc });
  let n = 0;
  for (const p of proposals) { await call(c, "set_item_type", { p_item_id: p.item_id, p_type: p.suggested_type }); n++; }
  const still = items.filter((i) => !i.item_type && !proposals.some((p) => p.item_id === i.id));
  const untyped = [];
  for (const i of still) {
    const t = BLANCA_SECTION_TYPES[secName.get(i.category_id)];
    if (t) { await call(c, "set_item_type", { p_item_id: i.id, p_type: t }); n++; }
    else untyped.push(byLocale(i.item_translations).en);
  }
  log(`blanca types: ${n} set (${proposals.length} from proposals); left untyped: ${untyped.length ? untyped.join(", ") : "none"}`);

  // Ingredients
  const book = ingredientBook(c, rid);
  for (const [sec, dish, lines] of BLANCA_DISHES) await applyIngredients(c, book, find(sec, dish), lines);
  log(`blanca ingredients on ${BLANCA_DISHES.length} dishes`);

  // Pairings
  for (const [[s, d], withs] of BLANCA_PAIRINGS)
    for (const [i, [s2, d2]] of withs.entries()) await call(c, "set_item_pairing", { p_item_id: find(s, d), p_suggest_item_id: find(s2, d2), p_sort: i });

  // A promo that is created but OFF; rewards configured but OFF
  const PROMO = {
    title: { hy: "Աղանդեր և սուրճ մեկ գնով", ru: "Десерт и кофе по специальной цене", en: "Dessert and coffee together" },
    text: { hy: "Ցանկացած աղանդեր և սուրճ՝ 3500 ֏։", ru: "Любой десерт и кофе за 3500 ֏.", en: "Any dessert with a coffee for 3500 AMD." },
  };
  const promos = await must(c.from("promos").select("id, title, is_on").eq("location_id", loc), "promos");
  const existing = promos.find((p) => p.title?.hy === PROMO.title.hy);
  if (!existing) await call(c, "save_promo", { p_location_id: loc, p_promo_id: null, p_title: PROMO.title, p_text: PROMO.text, p_badge: "3500 ֏", p_is_on: false });
  await call(c, "set_game_rewards", { p_location_id: loc, p_on: false, p_kind: "percent", p_level: 3, p_percent: 10 });

  await call(c, "publish_menu", { p_location_id: loc });
  const out = await call(c, "list_ingredient_outages", { p_location_id: loc });
  log(`blanca published; ingredient outages: ${Array.isArray(out) ? out.filter((o) => o.is_out ?? true).length : "n/a"}; calories ${hasKcal ? "available" : "PENDING CI"}`);
}

const parts = process.argv.slice(2);
const all = parts.length === 0;
if (all || parts.includes("showcase")) await showcase();
if (all || parts.includes("blanca")) await blanca();
