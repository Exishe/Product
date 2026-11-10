import type { BrowserContext, Page } from "@playwright/test";
import { test as base, expect } from "./fixtures";
import { createCafeWithMenu, type TestCafe } from "./guest-helpers";
import { ownerEmail, ownerPassword } from "./helpers";
import { allowConsoleErrors, OFFLINE_NOISE, trackConsole } from "./kitchen-helpers";
import { pairState, type StorageState } from "./screens";
import { guestOrder, seatGuest, tickets } from "./waiter-helpers";

// Task 11.1: the staff app installs, and opens offline to its last screen.
// Each worker makes its own café; devices pair through /pair as in a café.

const PAGE_CACHE = "pativ-staff-pages-v2";
const LAST_SCREEN = "/__pativ/last-staff-screen";

const test = base.extend<object, { cafe: TestCafe }>({
  cafe: [
    async ({}, provide) =>
      provide(
        await createCafeWithMenu({
          categories: [{ key: "hot", names: { hy: "Տաք ուտեստներ", ru: "Горячие блюда", en: "Hot dishes" } }],
          dishes: [
            { key: "tolma", category: "hot", names: { hy: "Տոլմա", ru: "Толма", en: "Tolma" }, price: 3200 },
            { key: "borani", category: "hot", names: { hy: "Բորանի", ru: "Борани" }, price: 2600 },
          ],
          tables: ["1", "2"],
        }),
      ),
    { scope: "worker", timeout: 120_000 },
  ],
});

// The last staff screen the service worker keeps for offline starts.
const lastScreen = (page: Page) =>
  page.evaluate(
    async ([cacheName, key]) => {
      if (!navigator.serviceWorker.controller) return null;
      const hit = await (await caches.open(cacheName as string)).match(key as string);
      return hit ? hit.text() : null;
    },
    [PAGE_CACHE, LAST_SCREEN],
  );

async function openStaff(
  browser: import("@playwright/test").Browser,
  state: StorageState,
  path: string,
  use: { baseURL?: string; viewport?: { width: number; height: number } | null },
  errors: string[],
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: use.baseURL, viewport: use.viewport ?? undefined, storageState: state });
  const page = await context.newPage();
  trackConsole(page, errors);
  await page.goto(path);
  await expect.poll(() => lastScreen(page), { timeout: 15_000 }).toBe(path);
  return { context, page };
}

test.describe("installable staff app", () => {
  test.skip(!ownerEmail || !ownerPassword, "needs .env.local for the dev project");

  test("the manifest and the service worker make the staff app installable", async ({ browser, cafe, consoleErrors }, info) => {
    const waiter = await pairState(browser, info.project.use.baseURL, cafe, "waiter");
    const { context, page } = await openStaff(browser, waiter, "/waiter", info.project.use, consoleErrors);
    try {
      await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href", "/manifest.webmanifest");
      const manifest = await (await page.request.get("/manifest.webmanifest")).json();
      expect(manifest).toMatchObject({ name: "Պատիվ", lang: "hy", start_url: "/pair?source=app", scope: "/", display: "standalone" });
      const icons = manifest.icons as { sizes: string; type: string; purpose: string }[];
      expect(icons).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sizes: "192x192", type: "image/png" }),
          expect.objectContaining({ sizes: "512x512", type: "image/png", purpose: "any" }),
          expect.objectContaining({ sizes: "512x512", type: "image/png", purpose: "maskable" }),
        ]),
      );
      for (const icon of icons) expect((await page.request.get(icon.src)).status(), icon.src).toBe(200);

      // Chromium's own install check: manifest, icons, a service worker with a fetch handler.
      const cdp = await context.newCDPSession(page);
      const { installabilityErrors } = await cdp.send("Page.getInstallabilityErrors");
      expect(installabilityErrors.map((e) => e.errorId).filter((id) => id !== "in-incognito")).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("a kitchen screen opens offline at its last state", async ({ browser, cafe, consoleErrors }, info) => {
    const before = await guestOrder(cafe, await seatGuest(cafe, "1"), [{ dish: "tolma", quantity: 1 }]);
    const kitchen = await pairState(browser, info.project.use.baseURL, cafe, "kitchen");
    const station = await cafe.owner.from("stations").select("id").eq("location_id", cafe.locationId).eq("is_default", true).single();
    const path = `/kitchen/${station.data?.id}`;
    const { context, page } = await openStaff(browser, kitchen, path, info.project.use, consoleErrors);
    try {
      const [shown] = await tickets(cafe, before);
      await expect(page.locator(`[data-ticket-id="${shown?.id}"]`)).toBeAttached();
      // A new order while the tablet is still online, then the Wi-Fi drops and
      // the tablet restarts the app: it opens on the board as last seen.
      const after = await guestOrder(cafe, await seatGuest(cafe, "2"), [{ dish: "borani", quantity: 2 }]);
      const [missed] = await tickets(cafe, after);
      await context.setOffline(true);
      await page.goto("/pair?source=app");
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(page.locator(`[data-ticket-id="${shown?.id}"]`)).toBeAttached();
      await expect(page.locator(`[data-ticket-id="${missed?.id}"]`)).toHaveCount(0);
      await expect(page.locator("html")).toHaveAttribute("lang", "hy");
      // Back online, the same screen shows the order it missed.
      await context.setOffline(false);
      await page.goto(path);
      await expect(page.locator(`[data-ticket-id="${missed?.id}"]`)).toBeAttached();
    } finally {
      allowConsoleErrors(consoleErrors, [...OFFLINE_NOISE, /ERR_INTERNET_DISCONNECTED|net::ERR_FAILED/]);
      await context.close();
    }
  });

  test("the waiter app opens offline at its last screen; a disconnected device's screen is forgotten", async ({ browser, cafe, consoleErrors }, info) => {
    const waiter = await pairState(browser, info.project.use.baseURL, cafe, "waiter");
    const { context, page } = await openStaff(browser, waiter, "/waiter", info.project.use, consoleErrors);
    try {
      await expect(page.getByTestId("table")).toHaveCount(2);
      await context.setOffline(true);
      await page.goto("/pair?source=app");
      await expect(page).toHaveURL(/\/waiter$/);
      await expect(page.getByTestId("table")).toHaveCount(2);
      await context.setOffline(false);

      // The owner disconnects the tablet: the server sends it to /pair, and
      // its old floor no longer opens offline.
      const { data: device } = await cafe.owner.from("members").select("id").eq("kind", "device").eq("role", "waiter").eq("is_active", true);
      for (const d of device ?? []) await cafe.owner.schema("api").rpc("revoke_member", { p_member_id: d.id });
      await page.goto("/waiter");
      await expect(page).toHaveURL(/\/pair/);
      await expect.poll(() => lastScreen(page)).toBeNull();
      await context.setOffline(true);
      await expect(page.goto("/pair?source=app")).rejects.toThrow(/ERR_FAILED|ERR_INTERNET_DISCONNECTED/);
    } finally {
      allowConsoleErrors(consoleErrors, [...OFFLINE_NOISE, /ERR_INTERNET_DISCONNECTED|net::ERR_FAILED/]);
      await context.close();
    }
  });
});
