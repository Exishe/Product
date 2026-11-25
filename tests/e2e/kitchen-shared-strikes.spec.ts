import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { createCafeWithMenu } from "./guest-helpers";
import { ownerEmail, ownerPassword } from "./helpers";
import {
  allowConsoleErrors,
  column,
  loadCafe,
  OFFLINE_NOISE,
  pairKitchenDevice,
  placeOrder,
  revokeDevice,
  serveOrders,
  simpleItems,
  slip,
  startShift,
  ticketStatus,
  trackConsole,
  type Api,
} from "./kitchen-helpers";
import { runOwner } from "./run-owner";

// Struck lines on a ticket in Cooking are shared (ADR-086): two kitchen screens
// of one café agree after a strike, after an undo and after a reload; a strike
// made while one screen is offline is sent when it is back; striking the last
// line sends the ticket to Ready on both. Needs migration
// 20261124110000_kitchen_line_strike on the dev project; until CI has applied it
// these tests skip. Desktop only.

const DISHES = ["Տոլմա", "Բորանի", "Խորոված"];

test.describe("shared struck lines", () => {
  test.skip(!ownerEmail || !ownerPassword, "needs E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD from .env.local");
  test.describe.configure({ mode: "default" });

  // Two kitchen screens (two paired devices of one café) open on the same
  // station, with one order of three dishes already cooking.
  async function twoScreens(browser: Browser, info: { project: { name: string } }) {
    test.skip(info.project.name !== "desktop", "desktop only");
    const probe = await (await runOwner()).client.from("kitchen_ticket_items").select("struck_at").limit(1);
    test.skip(probe.error !== null, "needs migration 20261124110000_kitchen_line_strike on the dev project");

    const cafe = await createCafeWithMenu({
      categories: [{ key: "hot", names: { hy: "Տաք ուտեստներ", ru: "Горячие блюда", en: "Hot dishes" } }],
      dishes: DISHES.map((name, i) => ({ key: `d${i}`, category: "hot", names: { hy: name }, price: 1500 + i * 100 })),
      tables: ["1"],
    });
    const api: Api = cafe.owner;
    const kitchen = await loadCafe(api, cafe.slug);
    const order = await placeOrder(
      api,
      kitchen,
      "1",
      simpleItems(kitchen)
        .slice(0, 3)
        .map((item) => ({ item, quantity: 1 })),
    );
    const viewport = { width: 1280, height: 800 };
    const a = await pairKitchenDevice(browser, api, kitchen, viewport);
    const b = await pairKitchenDevice(browser, api, kitchen, viewport);
    const errors: string[] = [];
    for (const d of [a, b]) {
      trackConsole(d.page, errors);
      await d.page.goto(`/kitchen/${kitchen.kitchenStationId}`);
      await startShift(d.page); // dismisses the shift greeting
    }

    // Screen A starts cooking; screen B sees it move.
    await slip(a.page, order.ticketId).getByRole("button", { name: "Սկսել" }).click();
    for (const d of [a, b]) {
      await expect(column(d.page, "cooking").locator(`[data-ticket-id="${order.ticketId}"]`)).toBeVisible({
        timeout: 20_000,
      });
    }

    // The toggle button of one dish on a screen (a line is a button in Cooking).
    const line = (page: Page, dish: string) =>
      slip(page, order.ticketId).getByTestId("ticket-line").filter({ hasText: dish }).locator("button[aria-pressed]");
    const struckInDb = async () => {
      const { data } = await api
        .from("kitchen_ticket_items")
        .select("struck_at")
        .eq("ticket_id", order.ticketId)
        .not("struck_at", "is", null);
      return (data ?? []).length;
    };
    const cleanUp = async () => {
      await a.context.close();
      await b.context.close();
      await serveOrders(api, [order.orderId]);
      await revokeDevice(api, a.memberId);
      await revokeDevice(api, b.memberId);
    };
    return { api, order, a, b, line, struckInDb, errors, cleanUp };
  }

  test("two screens agree after a strike, an undo and a reload; the last strike sends the ticket to Ready on both", async ({
    browser,
  }, info) => {
    test.setTimeout(240_000);
    const s = await twoScreens(browser, info);
    try {
      const [tolma, borani, khorovats] = DISHES as [string, string, string];

      // A strikes the first dish: B shows it too, without a reload.
      await s.line(s.a.page, tolma).click();
      await expect(s.line(s.a.page, tolma)).toHaveAttribute("aria-pressed", "true");
      await expect(s.line(s.b.page, tolma)).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
      await expect(s.line(s.b.page, borani)).toHaveAttribute("aria-pressed", "false");
      await expect.poll(s.struckInDb).toBe(1);

      // B strikes the second: A shows both.
      await s.line(s.b.page, borani).click();
      await expect(s.line(s.a.page, borani)).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
      await expect(s.line(s.a.page, tolma)).toHaveAttribute("aria-pressed", "true");
      await expect.poll(s.struckInDb).toBe(2);

      // A takes the first back: B follows.
      await s.line(s.a.page, tolma).click();
      await expect(s.line(s.b.page, tolma)).toHaveAttribute("aria-pressed", "false", { timeout: 20_000 });
      await expect(s.line(s.b.page, borani)).toHaveAttribute("aria-pressed", "true");
      await expect.poll(s.struckInDb).toBe(1);

      // A reload keeps the strikes: they come from the server now, not from the tab.
      await s.b.page.reload();
      await startShift(s.b.page);
      await expect(s.line(s.b.page, borani)).toHaveAttribute("aria-pressed", "true");
      await expect(s.line(s.b.page, tolma)).toHaveAttribute("aria-pressed", "false");
      await expect(s.line(s.b.page, khorovats)).toHaveAttribute("aria-pressed", "false");

      // The remaining two on B: the ticket goes to Ready on both screens and forgets its strikes.
      await s.line(s.b.page, tolma).click();
      await s.line(s.b.page, khorovats).click();
      for (const d of [s.a, s.b]) {
        await expect(column(d.page, "ready").locator(`[data-ticket-id="${s.order.ticketId}"]`)).toBeVisible({
          timeout: 20_000,
        });
      }
      await expect.poll(async () => (await ticketStatus(s.api, s.order.ticketId))?.status).toBe("ready");
      await expect.poll(s.struckInDb).toBe(0);
      expect(s.errors).toEqual([]);
    } finally {
      await s.cleanUp();
    }
  });

  test("a strike made offline stays on that screen, then reaches the other one when the network is back", async ({
    browser,
  }, info) => {
    test.setTimeout(240_000);
    const s = await twoScreens(browser, info);
    try {
      const [tolma, borani] = DISHES as [string, string, string];

      await s.b.context.setOffline(true);
      await s.line(s.b.page, tolma).click();
      await expect(s.line(s.b.page, tolma)).toHaveAttribute("aria-pressed", "true"); // kept on this screen
      await s.b.page.waitForTimeout(1_500);
      await expect(s.line(s.a.page, tolma)).toHaveAttribute("aria-pressed", "false");
      expect(await s.struckInDb()).toBe(0);

      // Back online: the strike is sent, A shows it; B still does.
      await s.b.context.setOffline(false);
      await expect(s.line(s.a.page, tolma)).toHaveAttribute("aria-pressed", "true", { timeout: 40_000 });
      await expect.poll(s.struckInDb).toBe(1);
      await expect(s.line(s.b.page, tolma)).toHaveAttribute("aria-pressed", "true");
      await expect(s.line(s.b.page, borani)).toHaveAttribute("aria-pressed", "false");

      // And an undo made offline travels the same way.
      await s.b.context.setOffline(true);
      await s.line(s.b.page, tolma).click();
      await expect(s.line(s.b.page, tolma)).toHaveAttribute("aria-pressed", "false");
      await s.b.context.setOffline(false);
      await expect(s.line(s.a.page, tolma)).toHaveAttribute("aria-pressed", "false", { timeout: 40_000 });
      await expect.poll(s.struckInDb).toBe(0);

      allowConsoleErrors(s.errors, OFFLINE_NOISE);
      expect(s.errors).toEqual([]);
    } finally {
      await s.cleanUp();
    }
  });
});
