import { expect, test } from "./fixtures";
import { createFreshCafe, ownerEmail, ownerPassword, signInAsDemoOwner } from "./helpers";

// Milestone 10: admin navigation, plan banner, CSV export, sales dashboard and
// platform admin. Tests that call the functions from migration
// 20261109203000_dashboard_platform skip until it is applied to the dev
// project; set E2E_M10_MIGRATION=applied once it is.
const migrationApplied = process.env.E2E_M10_MIGRATION === "applied";
const shots = process.env.E2E_SCREENSHOTS;

test.describe("admin navigation and export", () => {
  test("the sidebar links every admin section and marks the current one", async ({ page }, info) => {
    test.skip(!ownerEmail || !ownerPassword, "needs E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD from .env.local");
    await signInAsDemoOwner(page);
    const nav = page.getByRole("navigation", { name: "Ադմինի բաժիններ" });
    for (const name of [
      "Վաճառքներ",
      "Ճաշացանկ",
      "Ներմուծում լուսանկարից",
      "Սեղաններ և QR",
      "Աշխատակիցներ և սարքեր",
      "Telegram",
      "Արտահանում",
    ]) {
      await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
    }
    await nav.getByRole("link", { name: "Սեղաններ և QR" }).click();
    await expect(page).toHaveURL(/\/admin\/tables$/);
    await expect(nav.getByRole("link", { name: "Սեղաններ և QR" })).toHaveAttribute("aria-current", "page");
    await nav.getByRole("link", { name: "Ներմուծում լուսանկարից" }).click();
    await expect(page).toHaveURL(/\/admin\/menu\/import$/);
    await expect(nav.getByRole("link", { name: "Ներմուծում լուսանկարից" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.getByRole("link", { name: "Ճաշացանկ", exact: true })).not.toHaveAttribute(
      "aria-current",
      "page",
    );
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "no horizontal page scroll").toBe(0);
    if (shots) await page.screenshot({ path: `${shots}/nav-${info.project.name}.png` });
  });

  test("a new café sees its free month and exports only its own data", async ({ page }, info) => {
    await createFreshCafe(page);
    const banner = page.getByTestId("plan-banner");
    await expect(banner).toHaveAttribute("data-plan", "trial");
    await expect(banner).toContainText("մնացել է 30 օր");
    await expect(banner).toContainText("15 000 ֏");

    await page
      .getByRole("navigation", { name: "Ադմինի բաժիններ" })
      .getByRole("link", { name: "Արտահանում" })
      .click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Տվյալների արտահանում");
    if (shots) await page.screenshot({ path: `${shots}/export-${info.project.name}.png`, fullPage: true });

    const menu = await page.request.get("/admin/export/menu");
    expect(menu.status()).toBe(200);
    expect(menu.headers()["content-type"]).toContain("text/csv");
    expect(menu.headers()["content-disposition"]).toMatch(
      /attachment; filename="pativ-menu-\d{4}-\d{2}-\d{2}\.csv"/,
    );
    const menuCsv = await menu.text();
    expect(menuCsv.split("\r\n").filter(Boolean)).toEqual([
      '﻿Բաժին,Անուն (hy),Անուն (ru),Անուն (en),"Գին, AMD",Ճաշացանկում է',
    ]);

    for (const kind of ["orders", "bills"]) {
      const res = await page.request.get(`/admin/export/${kind}`);
      expect(res.status()).toBe(200);
      const lines = (await res.text()).split("\r\n").filter(Boolean);
      expect(
        lines,
        `${kind}: a new café has a header and no rows, so nothing of the demo café leaks`,
      ).toHaveLength(1);
    }
    expect((await page.request.get("/admin/export/secrets")).status()).toBe(404);
  });

  test("the demo café's menu export has its dishes", async ({ page }) => {
    test.skip(!ownerEmail || !ownerPassword, "needs E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD from .env.local");
    await signInAsDemoOwner(page);
    const csv = await (await page.request.get("/admin/export/menu")).text();
    expect(csv).toContain("Cappuccino");
    expect(csv.split("\r\n").filter(Boolean).length).toBeGreaterThanOrEqual(42);
  });

  test("a café owner can't open the platform admin", async ({ page }) => {
    await createFreshCafe(page);
    // A second tab, so the expected 403 doesn't count as a console error.
    const tab = await page.context().newPage();
    const res = await tab.goto("/platform");
    expect(res?.status()).toBe(403);
    await expect(tab.getByRole("heading", { level: 1 })).toHaveText("Այս էջը բացելու իրավունք չունեք։");
    await tab.close();
  });
});

test.describe("sales dashboard", () => {
  test.skip(
    !migrationApplied,
    "needs migration 20261109203000_dashboard_platform on the dev project (E2E_M10_MIGRATION=applied)",
  );

  test("a new café sees the first-day message", async ({ page }) => {
    await createFreshCafe(page);
    await page.goto("/admin/dashboard");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Վաճառքներ");
    await expect(page.getByTestId("dashboard-empty")).toHaveText(
      "Առաջին պատվերից հետո այստեղ կերևան վաճառքները։",
    );
  });

  test("the demo owner sees average bill first, then revenue, orders and dishes", async ({ page }, info) => {
    test.skip(!ownerEmail || !ownerPassword, "needs E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD from .env.local");
    await signInAsDemoOwner(page);
    await page.goto("/admin/dashboard?range=30d");
    await expect(page.getByRole("link", { name: "30 օր" })).toHaveAttribute("aria-current", "page");
    const empty = page.getByTestId("dashboard-empty");
    if (await empty.isVisible()) {
      await expect(empty).toHaveText("Այս օրերին պատվերներ չեն եղել։");
      return;
    }
    const kpis = page.getByTestId(/^kpi-[a-z-]+$/);
    await expect(kpis.first()).toHaveAttribute("data-testid", "kpi-avg-bill");
    await expect(page.getByTestId("kpi-avg-bill-value")).toHaveText(/^\d{1,3}( \d{3})* ֏$/);
    await expect(page.getByTestId("kpi-revenue-value")).toHaveText(/֏$/);
    await expect(page.getByTestId("best-dishes")).toBeVisible();
    await expect(page.getByTestId("weak-dishes")).toBeVisible();
    await expect(page.getByTestId("kitchen-time")).toBeVisible();
    await expect(page.getByTestId("sources")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, "no horizontal page scroll").toBe(0);
    if (shots) await page.screenshot({ path: `${shots}/dashboard-${info.project.name}.png`, fullPage: true });
  });
});

test.describe("platform admin", () => {
  const email = process.env.E2E_PLATFORM_EMAIL;
  const password = process.env.E2E_PLATFORM_PASSWORD;
  test.skip(
    !migrationApplied || !email || !password,
    "needs the migration and a platform admin (E2E_PLATFORM_EMAIL, E2E_PLATFORM_PASSWORD)",
  );

  test("lists cafés, changes a plan and sees dead letters", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Էլ․ փոստ").fill(email as string);
    await page.getByLabel("Գաղտնաբառ").fill(password as string);
    await page.getByRole("button", { name: "Մուտք գործել" }).click();
    await page.goto("/platform");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Սրճարաններ");
    const demo = page.locator('[data-testid="platform-cafe"][data-slug="demo-cafe"]');
    await expect(demo).toBeVisible();
    await demo.getByLabel("Կարգավիճակ").selectOption("active");
    await demo.getByRole("button", { name: "Պահել" }).click();
    await expect(
      page.locator('[data-testid="platform-cafe"][data-slug="demo-cafe"]').getByRole("status"),
    ).toHaveText("Պահված է։");
    await expect(page.getByTestId("dead-letters")).toBeVisible();
  });
});
