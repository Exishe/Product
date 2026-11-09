import { expect, test } from "./fixtures";

const brand = { hy: "Պատիվ", ru: "Pativ", en: "Pativ" } as const;

for (const locale of ["hy", "ru", "en"] as const) {
  test(`/${locale} sets the page language and shows the brand`, async ({ page }) => {
    const response = await page.goto(`/${locale}`);
    expect(response?.status()).toBe(200);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toHaveText(brand[locale]);
    // Names use the condensed serif; Armenian glyphs come from Noto Serif Armenian.
    await expect(heading).toHaveCSS("font-family", /Noto Serif Armenian/);
    await expect(page.locator("body")).toHaveCSS("font-family", /Google Sans/);
  });
}

// The root follows the browser's language among hy, ru and en, else Armenian (i18n.md).
// Chromium derives Accept-Language from the context locale.
for (const [browserLocale, expected] of [
  ["hy-AM", "/hy"],
  ["ru-RU", "/ru"],
  ["en-US", "/en"],
  ["de-DE", "/hy"],
] as const) {
  test(`the root redirects ${browserLocale} visitors to ${expected}`, async ({ browser }) => {
    const context = await browser.newContext({ locale: browserLocale });
    const page = await context.newPage();
    await page.goto("/");
    expect(new URL(page.url()).pathname).toBe(expected);
    await context.close();
  });
}

test("an unknown locale is a 404", async ({ page, consoleErrors }) => {
  const response = await page.goto("/de");
  expect(response?.status()).toBe(404);
  // The browser reports the 404 document itself as a console error; that one is expected.
  consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !e.includes("404")));
});

test("the health endpoint answers for uptime checks", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
  expect(response.headers()["cache-control"]).toContain("no-store");
});
