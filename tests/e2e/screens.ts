import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import en from "../../messages/en.json" with { type: "json" };
import hy from "../../messages/hy.json" with { type: "json" };
import ru from "../../messages/ru.json" with { type: "json" };
import { createCafeWithMenu, newClient, type TestCafe } from "./guest-helpers";
import { unique } from "./helpers";

// Every screen of the app, reachable without cloud migrations that aren't
// applied yet, with the longest strings we can give it. Shared by the
// accessibility (a11y.spec.ts) and overflow (overflow.spec.ts) specs. One
// café per worker, built through the same api.* functions as the app.

export const SHOTS = "/tmp/claude-0/-home-user-Product/707986f3-f7bb-583a-bb93-27d05c735ec3/scratchpad/polish";

export const LOCALES = ["hy", "ru", "en"] as const;
export type Locale = (typeof LOCALES)[number];
const MESSAGES = { hy, ru, en } as const;

// A message by its dotted key, with {placeholders} filled in.
export function msg(locale: Locale, key: string, values: Record<string, string> = {}): string {
  let node: unknown = MESSAGES[locale];
  for (const part of key.split(".")) node = (node as Record<string, unknown>)[part];
  if (typeof node !== "string") throw new Error(`no message ${key}`);
  return node.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? `{${name}}`);
}

// The longest names the database allows on screens people read in a hurry.
export const LONG = {
  cafe: "Սրճարան «Հին Երևանի պատշգամբ և Սարյան փողոցի բակ»",
  owner: "Աստղիկ Մկրտչյան-Տեր-Գրիգորյան",
  dishHy: "Տնական խաշլամա գառան մսով, կարտոֆիլով, սմբուկով, լոլիկով և թարմ կանաչիով",
  dishRu: "Домашняя хашлама из молодой баранины с картофелем, баклажанами и свежей зеленью",
  dishEn: "Homemade khashlama with young lamb, potatoes, aubergine, tomatoes and fresh herbs",
  categoryHy: "Տաք ուտեստներ թոնրից և մանղալից",
  categoryRu: "Горячие блюда из тонира и мангала",
  categoryEn: "Hot dishes from the tonir and the grill",
  noteHy: "Առանց սոխի և սխտորի, խնդրում եմ, երեխայի համար է, աղը քիչ, կծու չլինի",
  table: "Պատշգամբ 12",
  device: "Խոհանոցի մեծ էկրան՝ տաք արտադրամասի պատի վրա",
};

export type Migrations = { telegram: boolean; dashboard: boolean; import: boolean; busy: boolean };

export type World = {
  cafe: TestCafe;
  stationId: string;
  owner: StorageState;
  kitchen: StorageState;
  waiter: StorageState;
  guest: StorageState;
  newcomer: StorageState;
  invite: string;
  migrations: Migrations;
};

export type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// Whether an api function exists on the dev project yet (PGRST202: not found).
async function hasFunction(name: string, args: Record<string, unknown>): Promise<boolean> {
  const res = await newClient().schema("api").rpc(name as never, args as never);
  return res.error?.code !== "PGRST202";
}

const zero = "00000000-0000-0000-0000-000000000000";

export async function probeMigrations(): Promise<Migrations> {
  const [telegram, dashboard, imports, busy] = await Promise.all([
    hasFunction("telegram_status", { p_restaurant_id: zero }),
    hasFunction("sales_dashboard", { p_restaurant_id: zero }),
    hasFunction("start_menu_import", { p_restaurant_id: zero }),
    hasFunction("set_kitchen_busy", { p_location_id: zero, p_minutes: null }),
  ]);
  return { telegram, dashboard, import: imports, busy };
}

async function signInState(browser: Browser, baseURL: string | undefined, email: string, password: string): Promise<StorageState> {
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin(\/new)?$/);
  const state = await context.storageState();
  await context.close();
  return state;
}

export async function pairState(browser: Browser, baseURL: string | undefined, cafe: TestCafe, role: "kitchen" | "waiter"): Promise<StorageState> {
  const label = role === "kitchen" ? LONG.device : `${LONG.device.slice(0, 40)} ${unique()}`;
  const { data: code, error } = await cafe.owner.schema("api").rpc("create_device_pairing", {
    p_location_id: cafe.locationId,
    p_role: role,
    p_label: label,
  });
  if (error) throw new Error(`create_device_pairing: ${error.message}`);
  const context = await browser.newContext({ baseURL });
  const page = await context.newPage();
  await page.goto("/pair");
  await page.locator('input[name="code"]').fill(code);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(role === "kitchen" ? /\/kitchen\/[0-9a-f-]{36}$/ : /\/waiter$/);
  const state = await context.storageState();
  await context.close();
  return state;
}

// A guest who scanned table 1 and sent an order with a long note, so the
// status page, the kitchen board and the waiter panel all have something.
async function guestState(browser: Browser, baseURL: string | undefined, cafe: TestCafe): Promise<StorageState> {
  const context = await browser.newContext({ baseURL, locale: "hy-AM" });
  const page = await context.newPage();
  await page.goto(`/t/${cafe.tables[LONG.table]?.token}`);
  await page.waitForURL(/\/hy\/m\//);
  const add = (name: string) => page.getByTestId("dish").filter({ hasText: name }).getByRole("button", { name: msg("hy", "guest.menu.add", { name }) });
  await add(LONG.dishHy).click();
  await add("Հայկական սուրճ").click();
  const sheet = page.getByRole("dialog");
  await sheet.locator("textarea").fill(LONG.noteHy);
  await sheet.getByRole("button", { name: new RegExp(`^${msg("hy", "guest.sheet.add")}\\s+\\d`) }).click();
  await expect(sheet).toBeHidden();
  await page.getByRole("button", { name: new RegExp(msg("hy", "guest.menu.viewOrder")) }).click();
  await page.getByRole("button", { name: msg("hy", "guest.cart.send") }).click();
  await page.waitForURL(/\/order\?t=/);
  await expect(page.getByTestId("order").first()).toBeVisible();
  const state = await context.storageState();
  await context.close();
  return state;
}

export async function buildWorld(browser: Browser, baseURL: string | undefined): Promise<World> {
  const cafe = await createCafeWithMenu({
    name: LONG.cafe,
    ownerName: LONG.owner,
    categories: [
      { key: "hot", names: { hy: LONG.categoryHy, ru: LONG.categoryRu, en: LONG.categoryEn } },
      { key: "coffee", names: { hy: "Սուրճ և թեյ", ru: "Кофе и чай", en: "Coffee and tea" } },
    ],
    dishes: [
      {
        key: "long",
        category: "hot",
        names: { hy: LONG.dishHy, ru: LONG.dishRu, en: LONG.dishEn },
        description: {
          hy: "Գառան միս՝ եփված սեփական հյութում, կարտոֆիլով և սմբուկով, մատուցվում է լավաշով",
          ru: "Баранина, тушённая в собственном соку, с картофелем и баклажанами, подаётся с лавашем",
          en: "Lamb stewed in its own juices with potatoes and aubergine, served with lavash",
        },
        price: 9_990_000,
        portion: { amount: 450, unit: "g" },
        tags: ["popular"],
      },
      { key: "tolma", category: "hot", names: { hy: "Տոլմա", ru: "Толма", en: "Tolma" }, price: 3200 },
      { key: "trout", category: "hot", names: { hy: "Սևանի իշխան", ru: "Севанская форель", en: "Sevan trout" }, price: 5200, soldOut: true },
      { key: "syrniki", category: "hot", names: { ru: "Сырники со сметаной" }, price: 1900 },
      {
        key: "coffee",
        category: "coffee",
        names: { hy: "Հայկական սուրճ", ru: "Армянский кофе", en: "Armenian coffee" },
        price: 700,
        groups: [
          {
            names: { hy: "Շաքարի քանակը", ru: "Количество сахара", en: "How much sugar" },
            min: 1,
            max: 1,
            options: [
              { names: { hy: "Առանց շաքարի", ru: "Без сахара", en: "No sugar" } },
              { names: { hy: "Միջին քաղցրությամբ", ru: "Средней сладости", en: "Medium sweet" }, isDefault: true },
            ],
          },
          {
            names: { hy: "Հավելումներ", ru: "Добавки", en: "Extras" },
            min: 0,
            max: 2,
            options: [
              { names: { hy: "Վարսակի կաթ", ru: "Овсяное молоко", en: "Oat milk" }, delta: 200 },
              { names: { hy: "Դարչին", ru: "Корица", en: "Cinnamon" }, delta: 100 },
            ],
          },
        ],
      },
    ],
    tables: [LONG.table, "1", "2", "3"],
  });
  // The long dish costs more than the default auto-accept limit; the guest's
  // order should still reach the kitchen board by itself.
  const limit = await cafe.owner.from("locations").update({ max_auto_accept_total: 99_999_999 }).eq("id", cafe.locationId);
  if (limit.error) throw new Error(`limit: ${limit.error.message}`);
  const { data: station, error } = await cafe.owner.from("stations").select("id").eq("location_id", cafe.locationId).eq("is_default", true).single();
  if (error) throw new Error(`station: ${error.message}`);
  const { data: invite, error: inviteError } = await cafe.owner
    .schema("api")
    .rpc("create_invitation", { p_restaurant_id: cafe.restaurantId, p_role: "manager" });
  if (inviteError) throw new Error(`create_invitation: ${inviteError.message}`);

  // Someone who signed up but has no café yet: /admin/new.
  const newcomerEmail = `e2e-new-${unique()}@pativ.test`;
  const signUp = await newClient().auth.signUp({ email: newcomerEmail, password: "e2e-password-123" });
  if (signUp.error) throw new Error(`sign-up: ${signUp.error.message}`);

  const [owner, kitchen, waiter, newcomer, migrations] = await Promise.all([
    signInState(browser, baseURL, cafe.email, cafe.password),
    pairState(browser, baseURL, cafe, "kitchen"),
    pairState(browser, baseURL, cafe, "waiter"),
    signInState(browser, baseURL, newcomerEmail, "e2e-password-123"),
    probeMigrations(),
  ]);
  const guest = await guestState(browser, baseURL, cafe);
  return { cafe, stationId: station.id, owner, kitchen, waiter, guest, newcomer, invite, migrations };
}

export type Who = "anon" | "guest" | "owner" | "kitchen" | "waiter" | "newcomer";

export type Screen = {
  name: string;
  who: Who;
  path: (w: World, locale: Locale) => string;
  // Brings the screen into the state worth checking (a sheet open, a shift started).
  prepare?: (page: Page, w: World, locale: Locale) => Promise<void>;
  // Why the screen can't be shown yet, if it can't.
  blocked?: (w: World) => string | null;
  // The HTTP status the screen answers with on purpose (404, 403 pages).
  status?: number;
};

const guestMenu = (w: World, l: Locale) => `/${l}/m/${w.cafe.slug}/main?t=${w.cafe.tables[LONG.table]?.token}`;
const dishName = (l: Locale) => ({ hy: "Հայկական սուրճ", ru: "Армянский кофе", en: "Armenian coffee" })[l];

export const SCREENS: Screen[] = [
  // Guest
  { name: "guest-landing", who: "anon", path: (_, l) => `/${l}` },
  { name: "guest-menu", who: "guest", path: guestMenu },
  {
    name: "guest-dish-sheet",
    who: "guest",
    path: guestMenu,
    prepare: async (page, _, l) => {
      await page.getByRole("button", { name: msg(l, "guest.menu.add", { name: dishName(l) }) }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  },
  {
    name: "guest-cart",
    who: "guest",
    path: guestMenu,
    prepare: async (page, _, l) => {
      const long = { hy: LONG.dishHy, ru: LONG.dishRu, en: LONG.dishEn }[l];
      await page.getByRole("button", { name: msg(l, "guest.menu.add", { name: long }) }).click();
      await page.getByRole("button", { name: new RegExp(msg(l, "guest.menu.viewOrder")) }).click();
      await expect(page.getByTestId("cart")).toBeVisible();
    },
  },
  {
    name: "guest-order-status",
    who: "guest",
    path: (w, l) => `/${l}/m/${w.cafe.slug}/main/order?t=${w.cafe.tables[LONG.table]?.token}`,
    prepare: async (page) => {
      await expect(page.getByTestId("order").first()).toBeVisible();
    },
  },
  { name: "guest-old-qr", who: "anon", path: () => `/t/${"A".repeat(46)}`, status: 404 },
  { name: "not-found", who: "anon", path: (_, l) => `/${l}/no-such-page`, status: 404 },

  // Sign-in
  { name: "login", who: "anon", path: () => "/login" },
  { name: "signup", who: "anon", path: () => "/signup" },
  { name: "pair", who: "anon", path: () => "/pair" },
  { name: "invite", who: "anon", path: (w) => `/invite/${w.invite}` },
  { name: "onboarding", who: "newcomer", path: () => "/admin/new" },

  // Owner admin
  { name: "admin-home", who: "owner", path: () => "/admin" },
  { name: "admin-menu", who: "owner", path: () => "/admin/menu" },
  { name: "admin-options", who: "owner", path: () => "/admin/menu/options" },
  { name: "admin-import", who: "owner", path: () => "/admin/menu/import" },
  { name: "admin-tables", who: "owner", path: () => "/admin/tables" },
  { name: "admin-tables-print", who: "owner", path: () => "/admin/tables/print" },
  { name: "admin-staff", who: "owner", path: () => "/admin/staff" },
  {
    name: "admin-telegram",
    who: "owner",
    path: () => "/admin/telegram",
    blocked: (w) => (w.migrations.telegram ? null : "needs migration 20261109200000_telegram_link on the dev project"),
  },
  {
    name: "admin-dashboard",
    who: "owner",
    path: () => "/admin/dashboard",
    blocked: (w) => (w.migrations.dashboard ? null : "needs migration 20261109203000_dashboard_platform on the dev project"),
  },
  { name: "admin-export", who: "owner", path: () => "/admin/export" },
  { name: "platform-forbidden", who: "owner", path: () => "/platform", status: 403 },

  // Staff devices
  { name: "kitchen-start", who: "kitchen", path: (w) => `/kitchen/${w.stationId}` },
  {
    name: "kitchen-board",
    who: "kitchen",
    path: (w) => `/kitchen/${w.stationId}`,
    prepare: async (page, _, l) => {
      await page.getByRole("button", { name: msg(l, "kitchen.shift.start") }).click();
      await expect(page.locator("[data-ticket-id]").first()).toBeVisible();
    },
  },
  { name: "waiter-floor", who: "waiter", path: () => "/waiter" },
  {
    name: "waiter-panel",
    who: "waiter",
    path: () => "/waiter",
    prepare: async (page) => {
      await page.locator(`[data-testid="table"][data-table="${LONG.table}"]`).click();
      await expect(page.getByTestId("panel")).toBeVisible();
    },
  },
  {
    name: "waiter-order-pad",
    who: "waiter",
    path: () => "/waiter",
    prepare: async (page, _, l) => {
      await page.locator('[data-testid="table"][data-table="3"]').click();
      await page.getByTestId("panel").getByRole("button", { name: msg(l, "waiter.panel.takeOrder") }).click();
      await expect(page.getByRole("dialog")).toBeVisible();
    },
  },
];

// A browser context for the screen's person, in the given language: guest
// pages take it from the URL and Accept-Language, staff pages from the
// member's language cookie.
export async function openScreen(
  browser: Browser,
  world: World,
  screen: Screen,
  locale: Locale,
  options: { baseURL: string | undefined; viewport: { width: number; height: number } | null; isMobile: boolean; hasTouch: boolean },
): Promise<{ context: BrowserContext; page: Page }> {
  const state = screen.who === "anon" ? undefined : world[screen.who];
  const context = await browser.newContext({
    baseURL: options.baseURL,
    viewport: options.viewport ?? undefined,
    isMobile: options.isMobile,
    hasTouch: options.hasTouch,
    locale: { hy: "hy-AM", ru: "ru-RU", en: "en-US" }[locale],
    storageState: state,
  });
  const url = new URL(options.baseURL ?? "http://localhost");
  await context.addCookies([{ name: "pativ-locale", value: locale, domain: url.hostname, path: "/" }]);
  if (screen.who === "kitchen") {
    // Kitchen text follows the location's kitchen language; the owner sets it.
    await world.cafe.owner.from("locations").update({ kitchen_locale: locale }).eq("id", world.cafe.locationId);
  }
  const page = await context.newPage();
  return { context, page };
}
