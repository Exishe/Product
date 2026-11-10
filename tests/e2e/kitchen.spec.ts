import type { Browser, BrowserContext, Page } from "@playwright/test";
import { test as base, expect } from "./fixtures";
import { createCafeWithMenu } from "./guest-helpers";
import { createFreshCafe, ownerEmail, ownerPassword } from "./helpers";
import {
  allowConsoleErrors,
  column,
  instrumentShift,
  loadCafe,
  moveTicket,
  newClient,
  OFFLINE_NOISE,
  pairKitchenDevice,
  percentile,
  placeOrder,
  revokeDevice,
  serveOrders,
  signedInOwner,
  simpleItems,
  slip,
  startShift,
  ticketStatus,
  trackConsole,
  type Api,
  type Cafe,
} from "./kitchen-helpers";

// Kitchen board, milestone 6 (plan.md Tasks 6.1–6.3). A kitchen tablet is
// paired once per worker and revoked at the end; orders are placed by the
// cafe owner through api.place_waiter_order and served afterwards.

// One café per worker (own owner, menu, 12 tables, 8 dishes without options).
let workerCafeOnce: ReturnType<typeof createCafeWithMenu> | undefined;
const DISHES = ["Տոլմա", "Բորանի", "Խորոված", "Լահմաջո", "Գաթա", "Լավաշ", "Խաշլամա", "Շորվա", "Սալաթ"];
function workerCafe() {
  workerCafeOnce ??= createCafeWithMenu({
    categories: [{ key: "hot", names: { hy: "Տաք ուտեստներ", ru: "Горячие блюда", en: "Hot dishes" } }],
    dishes: DISHES.map((name, i) => ({ key: `d${i}`, category: "hot", names: { hy: name }, price: 1500 + i * 100 })),
    tables: Array.from({ length: 12 }, (_, i) => String(i + 1)),
  });
  return workerCafeOnce;
}

type DeviceState = { storageState: Awaited<ReturnType<BrowserContext["storageState"]>>; memberId: string };
type Viewport = { width: number; height: number };

const test = base.extend<{ viewportSize: Viewport }, { api: Api; cafe: Cafe; device: DeviceState }>({
  viewportSize: async ({ viewport }, provide) => provide(viewport ?? { width: 1280, height: 800 }),
  api: [async ({}, provide) => provide((await workerCafe()).owner), { scope: "worker" }],
  cafe: [async ({ api }, provide) => provide(await loadCafe(api, (await workerCafe()).slug)), { scope: "worker" }],
  device: [
    async ({ browser, api, cafe }, provide) => {
      const device = await pairKitchenDevice(browser, api, cafe, { width: 1280, height: 800 });
      const storageState = await device.context.storageState();
      await device.context.close();
      await provide({ storageState, memberId: device.memberId });
      await revokeDevice(api, device.memberId);
    },
    { scope: "worker" },
  ],
});

async function openBoard(
  browser: Browser,
  device: DeviceState,
  cafe: Cafe,
  viewport: Viewport,
  errors: string[],
  options: { instrument?: boolean; clockAheadMs?: number } = {},
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ storageState: device.storageState, viewport, hasTouch: true });
  if (options.instrument) await instrumentShift(context);
  if (options.clockAheadMs) {
    const ahead = options.clockAheadMs;
    await context.route("**/api/time", (route) => route.fulfill({ json: { now: Date.now() + ahead } }));
  }
  const page = await context.newPage();
  trackConsole(page, errors);
  await page.goto(`/kitchen/${cafe.kitchenStationId}`);
  return { context, page };
}

const inColumn = (page: Page, name: "new" | "cooking" | "ready", ticketId: string) =>
  column(page, name).locator(`[data-ticket-id="${ticketId}"]`);

const css = (page: Page, selector: string, prop: string) =>
  page.locator(selector).first().evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

test.describe("kitchen board", () => {
  test.skip(!ownerEmail || !ownerPassword, "needs E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD from .env.local");
  test.skip(({ isMobile }) => isMobile, "the kitchen board is for tablets and larger");
  test.describe.configure({ mode: "default" });

  // ---------------------------------------------------------------------------
  // 6.1 Board layout and timers
  // ---------------------------------------------------------------------------
  test("a new order arrives as a paper slip of the design's sizes and moves through the columns", async ({
    browser,
    api,
    cafe,
    device,
    viewportSize,
    consoleErrors,
  }) => {
    test.setTimeout(60_000); // includes pairing the worker's tablet
    const [first, second] = simpleItems(cafe);
    const order = await placeOrder(api, cafe, "5", [
      { item: first!, quantity: 2 },
      { item: second!, quantity: 1, note: "Առանց սոխի" },
    ], "Երեխայի համար՝ առանց համեմունքի");
    const { context, page } = await openBoard(browser, device, cafe, viewportSize, consoleErrors);
    try {
      await startShift(page);
      await expect(page.getByRole("heading", { level: 2 })).toContainText(["Նոր", "Պատրաստվում է", "Պատրաստ"]);
      await expect(inColumn(page, "new", order.ticketId)).toBeVisible();
      const s = slip(page, order.ticketId);
      await expect(s.getByTestId("ticket-table")).toHaveText("5");
      await expect(s.getByTestId("ticket-timer")).toHaveText("հենց նոր");
      await expect(s).toContainText(`Պատվեր ${order.number}, Մատուցող`);
      await expect(s.getByTestId("line-qty")).toHaveText(["2", "1"]);
      await expect(s.getByTestId("line-note")).toHaveText("Առանց սոխի");
      await expect(s.getByTestId("ticket-note")).toHaveText("Երեխայի համար՝ առանց համեմունքի");

      const sel = `[data-ticket-id="${order.ticketId}"]`;
      expect(await css(page, `${sel} [data-testid=ticket-table]`, "font-size")).toBe("64px");
      expect(await css(page, `${sel} [data-testid=line-name]`, "font-size")).toBe("26px");
      expect(await css(page, `${sel} [data-testid=ticket-note]`, "background-color")).toBe("rgb(252, 232, 200)");
      const start = s.getByRole("button", { name: "Սկսել" });
      expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(72);

      await start.click();
      await expect(inColumn(page, "cooking", order.ticketId)).toBeVisible();
      await expect.poll(async () => (await ticketStatus(api, order.ticketId))?.status).toBe("cooking");
      const ready = s.getByRole("button", { name: "Պատրաստ է" });
      expect((await ready.boundingBox())!.height).toBeGreaterThanOrEqual(72);
      await ready.click();
      await expect(inColumn(page, "ready", order.ticketId)).toContainText("Սպասում է մատուցողին");
      await expect.poll(async () => (await ticketStatus(api, order.ticketId))?.status).toBe("ready");
      await s.getByRole("button", { name: "Վերադարձնել" }).click();
      await expect(inColumn(page, "cooking", order.ticketId)).toBeVisible();
      await expect.poll(async () => (await ticketStatus(api, order.ticketId))?.status).toBe("cooking");

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    } finally {
      await context.close();
      await serveOrders(api, [order.orderId]);
    }
  });

  test("a ticket turns apricot at 8 minutes and red at 12, timed by the server's clock", async ({
    browser,
    api,
    cafe,
    device,
    viewportSize,
    consoleErrors,
  }) => {
    const order = await placeOrder(api, cafe, "11", [{ item: simpleItems(cafe)[2]!, quantity: 1 }]);
    try {
      // The server says it's 8 min 10 s later than the tablet thinks.
      let board = await openBoard(browser, device, cafe, viewportSize, consoleErrors, { clockAheadMs: 8 * 60_000 + 10_000 });
      let s = slip(board.page, order.ticketId);
      await expect(s).toHaveAttribute("data-lateness", "hurry");
      await expect(s.getByTestId("ticket-age")).toHaveText("Շտապել");
      await expect(s.getByTestId("ticket-timer")).toHaveText("8 ր");
      expect(await s.evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe("rgb(242, 162, 58)");
      await board.context.close();

      board = await openBoard(browser, device, cafe, viewportSize, consoleErrors, { clockAheadMs: 12 * 60_000 + 10_000 });
      s = slip(board.page, order.ticketId);
      await expect(s).toHaveAttribute("data-lateness", "late");
      await expect(s.getByTestId("ticket-age")).toHaveText("Ուշանում է");
      await expect(s.getByTestId("ticket-timer")).toHaveText("12 ր");
      expect(await s.evaluate((el) => getComputedStyle(el).borderLeftColor)).toBe("rgb(176, 33, 58)");

      // Ready food waits for the waiter: never marked late.
      await moveTicket(api, order.ticketId, "new", "ready");
      await expect(inColumn(board.page, "ready", order.ticketId)).toHaveAttribute("data-lateness", "normal");
      await board.context.close();
    } finally {
      await serveOrders(api, [order.orderId]);
    }
  });

  test("a cancellation stays on top of New, struck through, until «Հասկացա»", async ({
    browser,
    api,
    cafe,
    device,
    viewportSize,
    consoleErrors,
  }) => {
    const [x, y] = simpleItems(cafe).slice(3);
    const order = await placeOrder(api, cafe, "9", [
      { item: x!, quantity: 2 },
      { item: y!, quantity: 1 },
    ]);
    const { context, page } = await openBoard(browser, device, cafe, viewportSize, consoleErrors);
    try {
      await startShift(page);
      await slip(page, order.ticketId).getByRole("button", { name: "Սկսել" }).click();
      await expect(inColumn(page, "cooking", order.ticketId)).toBeVisible();

      // The waiter cancels one of the two portions.
      const { data: line } = await api.from("order_items").select("id").eq("order_id", order.orderId).eq("item_id", x!.id).single();
      const cancel = await api.schema("api").rpc("cancel_order_item", { p_order_item_id: line!.id, p_quantity: 1, p_reason: "Հյուրը հրաժարվեց" });
      expect(cancel.error).toBeNull();
      const { data: voidTicket } = await api.from("kitchen_tickets").select("id").eq("voids_ticket_id", order.ticketId).single();

      const v = inColumn(page, "new", voidTicket!.id);
      await expect(v).toBeVisible();
      await expect(v).toContainText("Չեղարկվել է");
      await expect(v.getByTestId("line-qty")).toHaveText("1");
      expect(await v.getByTestId("line-name").evaluate((el) => getComputedStyle(el).textDecorationLine)).toBe("line-through");
      const kinds = await column(page, "new").getByTestId("ticket").evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")));
      expect(kinds.indexOf("order") === -1 || kinds.lastIndexOf("void") < kinds.indexOf("order")).toBe(true);

      // The cooking slip now asks for one portion, and shows that it was two.
      const cooking = inColumn(page, "cooking", order.ticketId);
      await expect(cooking.getByTestId("line-qty").first()).toHaveText("1");
      await expect(cooking.getByLabel("Եղել է 2")).toBeVisible();

      await v.getByRole("button", { name: "Հասկացա" }).click();
      await expect(v).toHaveCount(0);
      await expect.poll(async () => (await ticketStatus(api, voidTicket!.id))?.acknowledged_at).not.toBeNull();
      await page.reload();
      await expect(slip(page, voidTicket!.id)).toHaveCount(0);
    } finally {
      await context.close();
      await serveOrders(api, [order.orderId]);
    }
  });

  test("a long dish name wraps beside its quantity, in the kitchen's language; the stop list hides a dish from guests", async ({
    page,
    viewportSize,
  }) => {
    // A fresh café (never the cafe café's menu) whose kitchen reads Russian.
    const id = await createFreshCafe(page);
    const owner = await signedInOwner(`e2e-${id}@pativ.test`, "e2e-password-123");
    const { data: r } = await owner.from("restaurants").select("id, slug, locations(id)").single();
    const restaurantId = r!.id;
    const locationId = r!.locations[0]!.id;
    const { data: menu } = await owner.from("menus").insert({ restaurant_id: restaurantId, internal_name: "Main" }).select("id").single();
    await owner.from("menu_locations").insert({ restaurant_id: restaurantId, menu_id: menu!.id, location_id: locationId });
    const { data: cat } = await owner.from("categories").insert({ restaurant_id: restaurantId, menu_id: menu!.id, sort: 1 }).select("id").single();
    await owner.from("category_translations").insert([
      { restaurant_id: restaurantId, category_id: cat!.id, locale: "hy", name: "Տաք ուտեստներ" },
      { restaurant_id: restaurantId, category_id: cat!.id, locale: "ru", name: "Горячие блюда" },
    ]);
    const { data: ribs } = await owner.from("items").insert({ restaurant_id: restaurantId, category_id: cat!.id, price: 5800, sort: 1 }).select("id").single();
    const { data: tolma } = await owner.from("items").insert({ restaurant_id: restaurantId, category_id: cat!.id, price: 3200, sort: 2 }).select("id").single();
    const longRu = "Свиные рёбрышки на мангале с гранатовым соусом, печёным картофелем и свежей зеленью";
    await owner.from("item_translations").insert([
      { restaurant_id: restaurantId, item_id: ribs!.id, locale: "hy", name: "Խոզի չալաղաջ՝ նռան սոուսով, թխած կարտոֆիլով և թարմ կանաչիով" },
      { restaurant_id: restaurantId, item_id: ribs!.id, locale: "ru", name: longRu },
      { restaurant_id: restaurantId, item_id: tolma!.id, locale: "hy", name: "Տոլմա" },
    ]);
    const { data: table } = await owner.from("tables").insert({ restaurant_id: restaurantId, location_id: locationId, label: "10" }).select("id").single();
    expect((await owner.schema("api").rpc("publish_menu", { p_location_id: locationId })).error).toBeNull();
    expect((await owner.from("locations").update({ kitchen_locale: "ru" }).eq("id", locationId)).error).toBeNull();
    const longNote = "Без лука и чеснока, соус отдельно, рёбрышки хорошо прожарить: гость просил дважды";
    const placed = await owner.schema("api").rpc("place_waiter_order", {
      p_table_id: table!.id,
      p_idempotency_key: crypto.randomUUID(),
      p_lines: [
        { item_id: ribs!.id, quantity: 12, note: longNote },
        { item_id: tolma!.id, quantity: 1 },
      ],
    });
    expect(placed.error).toBeNull();
    const { data: station } = await owner.from("stations").select("id").eq("location_id", locationId).single();

    await page.goto(`/kitchen/${station!.id}`);
    await page.getByRole("button", { name: "Начать смену" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Кухня");
    await expect(page.getByRole("heading", { level: 2 })).toContainText(["Новые", "Готовятся", "Готово"]);

    const ticket = page.getByTestId("ticket").first();
    const ribsLine = ticket.getByTestId("ticket-line").first();
    await expect(ribsLine.getByTestId("line-name")).toHaveText(longRu);
    await expect(ribsLine.getByTestId("line-qty")).toHaveText("12");
    await expect(ribsLine.getByTestId("line-qty")).toBeInViewport();
    // A dish with no Russian name falls back to Armenian and says so.
    await expect(ticket.getByTestId("ticket-line").nth(1).getByTestId("line-name")).toHaveAttribute("lang", "hy");

    const box = (await ticket.boundingBox())!;
    const qty = (await ribsLine.getByTestId("line-qty").boundingBox())!;
    const name = (await ribsLine.getByTestId("line-name").boundingBox())!;
    const note = (await ribsLine.getByTestId("line-note").boundingBox())!;
    expect(name.height).toBeGreaterThan(2 * 26); // wrapped onto several lines
    expect(qty.x).toBeGreaterThanOrEqual(box.x);
    expect(qty.x + qty.width).toBeLessThanOrEqual(name.x); // beside the name, never under or over it
    expect(name.x + name.width).toBeLessThanOrEqual(box.x + box.width);
    expect(note.x + note.width).toBeLessThanOrEqual(box.x + box.width);
    expect(await ticket.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

    // Stop list: the kitchen marks the ribs sold out; guests see it at once.
    await page.getByTestId("stop-list-button").click();
    const dish = page.getByRole("switch", { name: new RegExp(longRu.slice(0, 20)) });
    await expect(dish).toHaveAttribute("aria-checked", "false");
    await dish.click();
    await expect(dish).toHaveAttribute("aria-checked", "true");
    const guest = newClient();
    const soldOut = async () =>
      ((await guest.schema("api").rpc("public_menu", { p_restaurant_slug: r!.slug, p_location_slug: "main" })).data as { sold_out: string[] })
        .sold_out;
    expect(await soldOut()).toEqual([ribs!.id]);
    await dish.click();
    await expect(dish).toHaveAttribute("aria-checked", "false");
    expect(await soldOut()).toEqual([]);
    await page.getByRole("button", { name: "Закрыть" }).click();
    expect(viewportSize.width).toBeGreaterThan(0);
  });

  // ---------------------------------------------------------------------------
  // 6.2 Live updates, sound, wake lock, first-seen, heartbeat
  // ---------------------------------------------------------------------------
  test("orders reach a paired kitchen tablet within 2 seconds (p95 of 20), with a beep", async ({
    browser,
    api,
    cafe,
    device,
    viewportSize,
    consoleErrors,
  }, testInfo) => {
    test.setTimeout(180_000);
    const { context, page } = await openBoard(browser, device, cafe, viewportSize, consoleErrors, { instrument: true });
    const orders: string[] = [];
    const tickets: string[] = [];
    try {
      await startShift(page);
      expect(await page.evaluate(() => (window as unknown as { __wakeLocks: string[] }).__wakeLocks)).toEqual(["screen"]);
      const beepsAtStart = await page.evaluate(() => (window as unknown as { __beeps: number }).__beeps);
      expect(beepsAtStart).toBe(2); // the start tap plays the double beep once
      await expect(page.getByTestId("connection")).toHaveAttribute("data-state", "online");

      // Record when each slip first appears, in the browser.
      await page.evaluate(() => {
        const w = window as unknown as { __seen: Record<string, number> };
        w.__seen = {};
        const mark = () => {
          for (const el of document.querySelectorAll("[data-ticket-id]")) {
            const id = el.getAttribute("data-ticket-id")!;
            w.__seen[id] ??= Date.now();
          }
        };
        mark();
        new MutationObserver(mark).observe(document.body, { childList: true, subtree: true });
      });

      const items = simpleItems(cafe);
      const fromCall: number[] = [];
      const fromCommit: number[] = [];
      for (let i = 0; i < 20; i++) {
        const o = await placeOrder(api, cafe, String((i % 12) + 1), [{ item: items[i % items.length]!, quantity: 1 + (i % 3) }]);
        orders.push(o.orderId);
        tickets.push(o.ticketId);
        let seen: number | undefined;
        const deadline = Date.now() + 15_000;
        while (!seen && Date.now() < deadline) {
          seen = await page.evaluate((id) => (window as unknown as { __seen: Record<string, number> }).__seen[id], o.ticketId);
          if (!seen) await page.waitForTimeout(20);
        }
        expect(seen, `order ${i + 1} never appeared`).toBeTruthy();
        fromCall.push(seen! - o.placedAt);
        fromCommit.push(seen! - o.returnedAt);
        await page.waitForTimeout(250);
      }
      const p95 = percentile(fromCall, 95);
      const summary = {
        project: testInfo.project.name,
        placedToVisibleMs: fromCall,
        p50: percentile(fromCall, 50),
        p95,
        max: Math.max(...fromCall),
        p95AfterCallReturned: percentile(fromCommit, 95),
      };
      testInfo.annotations.push({ type: "latency", description: JSON.stringify(summary) });
      console.log(`KITCHEN LATENCY ${JSON.stringify(summary)}`);

      // A beep for new slips (several may share one).
      expect(await page.evaluate(() => (window as unknown as { __beeps: number }).__beeps)).toBeGreaterThan(beepsAtStart);
      // ADR-037: the screen reported when it first drew each ticket.
      await expect
        .poll(async () => {
          const { data } = await api.from("kitchen_tickets").select("first_seen_at").in("id", tickets);
          return (data ?? []).filter((t) => t.first_seen_at).length;
        })
        .toBe(20);
      // Device heartbeat for the "screen offline" alert.
      const { data: member } = await api.from("members").select("last_seen_at").eq("id", device.memberId).single();
      expect(Date.now() - Date.parse(member!.last_seen_at!)).toBeLessThan(5 * 60_000);

      expect(p95, `p95 placed → visible was ${p95} ms`).toBeLessThan(2_000);
    } finally {
      await context.close();
      await serveOrders(api, orders);
    }
  });

  // ---------------------------------------------------------------------------
  // 6.3 Actions and the offline outbox
  // ---------------------------------------------------------------------------
  test("taps made offline wait in the outbox, the label turns red after 15 s, and each tap is replayed once", async ({
    browser,
    api,
    cafe,
    device,
    viewportSize,
    consoleErrors,
  }) => {
    test.setTimeout(120_000);
    const order = await placeOrder(api, cafe, "6", [{ item: simpleItems(cafe)[5]!, quantity: 1 }]);
    const { context, page } = await openBoard(browser, device, cafe, viewportSize, consoleErrors);
    try {
      await startShift(page);
      const conn = page.getByTestId("connection");
      await expect(conn).toHaveAttribute("data-state", "online");
      await expect(inColumn(page, "new", order.ticketId)).toBeVisible();

      await context.setOffline(true);
      const offAt = Date.now();
      await slip(page, order.ticketId).getByRole("button", { name: "Սկսել" }).click();
      await expect(inColumn(page, "cooking", order.ticketId)).toBeVisible();
      await expect(slip(page, order.ticketId).getByTestId("ticket-pending")).toHaveText("Սպասում է կապի");
      await expect(conn).toHaveAttribute("data-state", "connecting");
      await expect(conn).toHaveAttribute("data-state", "offline", { timeout: 20_000 });
      expect(Date.now() - offAt).toBeGreaterThanOrEqual(14_000);
      await expect(page.getByTestId("connection-label")).toHaveText("Կապ չկա, 1 գործողություն սպասում է");

      // Meanwhile someone else makes the same move: the replay succeeds silently.
      await moveTicket(api, order.ticketId, "new", "cooking");
      await context.setOffline(false);
      await expect(slip(page, order.ticketId).getByTestId("ticket-pending")).toHaveCount(0);
      await expect(conn).toHaveAttribute("data-state", "online");
      await expect(page.getByTestId("toast")).toHaveCount(0);

      // Offline again: the tab dies before the network comes back. The tap is
      // kept in IndexedDB and a new tab sends it, once.
      await context.setOffline(true);
      await slip(page, order.ticketId).getByRole("button", { name: "Պատրաստ է" }).click();
      await expect(slip(page, order.ticketId).getByTestId("ticket-pending")).toBeVisible();
      await page.close();
      await context.setOffline(false);
      const again = await context.newPage();
      trackConsole(again, consoleErrors);
      await again.goto(`/kitchen/${cafe.kitchenStationId}`);
      await expect.poll(async () => (await ticketStatus(api, order.ticketId))?.status).toBe("ready");
      await expect(inColumn(again, "ready", order.ticketId)).toBeVisible();

      const { data: history } = await api.from("order_status_history").select("from_status, to_status").eq("ticket_id", order.ticketId);
      expect(history!.filter((h) => h.from_status === "new" && h.to_status === "cooking")).toHaveLength(1);
      expect(history!.filter((h) => h.from_status === "cooking" && h.to_status === "ready")).toHaveLength(1);
      allowConsoleErrors(consoleErrors, OFFLINE_NOISE);
    } finally {
      await context.close();
      await serveOrders(api, [order.orderId]);
    }
  });

  test("when two screens change the same ticket, the loser says «Արդեն փոխվել է» and shows the truth", async ({
    browser,
    page,
    api,
    cafe,
    device,
    viewportSize,
    consoleErrors,
  }) => {
    test.setTimeout(90_000);
    const order = await placeOrder(api, cafe, "4", [{ item: simpleItems(cafe)[6]!, quantity: 2 }]);
    const tablet = await openBoard(browser, device, cafe, viewportSize, consoleErrors);
    try {
      // Second screen: the owner's phone on the pass (RB2).
      const owner = await workerCafe();
      await page.goto("/login");
      await page.getByLabel("Էլ․ փոստ").fill(owner.email);
      await page.getByLabel("Գաղտնաբառ").fill(owner.password);
      await page.getByRole("button", { name: "Մուտք գործել" }).click();
      await expect(page).toHaveURL(/\/admin/);
      await page.goto(`/kitchen/${cafe.kitchenStationId}`);
      await startShift(page);
      await startShift(tablet.page);
      await expect(inColumn(page, "new", order.ticketId)).toBeVisible();
      await expect(inColumn(tablet.page, "new", order.ticketId)).toBeVisible();

      // The owner's screen loses the network and keeps showing the old state.
      await page.context().setOffline(true);
      await slip(tablet.page, order.ticketId).getByRole("button", { name: "Սկսել" }).click();
      await slip(tablet.page, order.ticketId).getByRole("button", { name: "Պատրաստ է" }).click();
      await expect.poll(async () => (await ticketStatus(api, order.ticketId))?.status).toBe("ready");

      await slip(page, order.ticketId).getByRole("button", { name: "Սկսել" }).click();
      await page.context().setOffline(false);
      const toast = page.getByTestId("toast");
      await expect(toast).toContainText("Արդեն փոխվել է");
      await expect(toast).toContainText("Սեղան 4");
      await expect(inColumn(page, "ready", order.ticketId)).toBeVisible();
      await expect(slip(page, order.ticketId).getByTestId("ticket-pending")).toHaveCount(0);
      expect((await ticketStatus(api, order.ticketId))?.status).toBe("ready"); // nothing overwritten

      allowConsoleErrors(consoleErrors, [...OFFLINE_NOISE, /status of 400/]);
    } finally {
      await tablet.context.close();
      await serveOrders(api, [order.orderId]);
    }
  });

  test("a waiter cancels while the kitchen starts: the kitchen is told and the slip goes away", async ({
    browser,
    api,
    cafe,
    device,
    viewportSize,
    consoleErrors,
  }) => {
    const order = await placeOrder(api, cafe, "8", [{ item: simpleItems(cafe)[7]!, quantity: 1 }]);
    const { context, page } = await openBoard(browser, device, cafe, viewportSize, consoleErrors);
    try {
      await startShift(page);
      await expect(inColumn(page, "new", order.ticketId)).toBeVisible();
      await context.setOffline(true);
      const { data: line } = await api.from("order_items").select("id").eq("order_id", order.orderId).single();
      expect((await api.schema("api").rpc("cancel_order_item", { p_order_item_id: line!.id, p_quantity: 1, p_reason: "Հյուրը գնաց" })).error).toBeNull();
      await slip(page, order.ticketId).getByRole("button", { name: "Սկսել" }).click();
      await context.setOffline(false);
      await expect(page.getByTestId("toast")).toContainText("Արդեն փոխվել է");
      await expect(slip(page, order.ticketId)).toHaveCount(0);
      expect((await ticketStatus(api, order.ticketId))?.status).toBe("cancelled");
      allowConsoleErrors(consoleErrors, [...OFFLINE_NOISE, /status of 400/]);
    } finally {
      await context.close();
      await serveOrders(api, [order.orderId]);
    }
  });

  test("the kitchen-busy switch sets the expected wait guests see", async ({ browser, api, cafe, device, viewportSize, consoleErrors }) => {
    const probe = await api.schema("api").rpc("set_kitchen_busy", { p_location_id: cafe.locationId, p_minutes: null as unknown as number });
    test.skip(probe.error?.code === "PGRST202", "needs migration 20261109190600_kitchen_busy.sql on the cloud project");
    const guest = newClient();
    const busy = async () =>
      ((await guest.schema("api").rpc("public_menu", { p_restaurant_slug: (await workerCafe()).slug, p_location_slug: "main" })).data as {
        kitchen_busy: { expected_wait_minutes: number } | null;
      }).kitchen_busy;
    const { context, page } = await openBoard(browser, device, cafe, viewportSize, consoleErrors);
    try {
      await startShift(page);
      await page.getByTestId("busy-button").click();
      await page.getByRole("button", { name: "30 րոպե" }).click();
      await expect(page.getByTestId("busy-button")).toHaveText("Ծանրաբեռնված՝ 30 ր");
      expect((await busy())?.expected_wait_minutes).toBe(30);
      await page.getByTestId("busy-button").click();
      await page.getByRole("button", { name: "Անջատել" }).click();
      await expect(page.getByTestId("busy-button")).toHaveText("Ծանրաբեռնված");
      expect(await busy()).toBeNull();
    } finally {
      await context.close();
      await api.schema("api").rpc("set_kitchen_busy", { p_location_id: cafe.locationId, p_minutes: null as unknown as number });
    }
  });

  test("a tablet disconnected by the owner says so instead of showing an empty kitchen", async ({
    browser,
    api,
    cafe,
    viewportSize,
    consoleErrors,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "one extra pairing per run is enough");
    const spare = await pairKitchenDevice(browser, api, cafe, viewportSize);
    trackConsole(spare.page, consoleErrors);
    try {
      await startShift(spare.page);
      await revokeDevice(api, spare.memberId);
      await expect(spare.page.getByRole("alertdialog")).toContainText("Այս սարքն անջատված է։", { timeout: 20_000 });
      await expect(spare.page.getByRole("link", { name: "Մուտքագրել նոր կոդ" })).toHaveAttribute("href", "/pair");
      allowConsoleErrors(consoleErrors, [/status of 403/]);
    } finally {
      await spare.context.close();
    }
  });
});
