import { expect, test } from "./fixtures";
import { createFreshCafe } from "./helpers";

const qrUrls = async (page: import("@playwright/test").Page) =>
  page.getByTestId("qr-card").evaluateAll((cards) =>
    Object.fromEntries(cards.map((c) => [c.getAttribute("data-table-label"), c.getAttribute("data-qr-url")])),
  );

test("an owner adds 12 tables, prints them on 3 A4 sheets, and reprints table 5", async ({ page }) => {
  test.setTimeout(180_000);
  await createFreshCafe(page);
  await page.goto("/admin/tables");
  await expect(page.getByRole("heading", { level: 1, name: "Սեղաններ և QR կոդեր" })).toBeVisible();
  await expect(page.getByText("Սեղաններ դեռ չկան։ Ավելացրեք առաջինը։")).toBeVisible();

  for (let n = 1; n <= 12; n++) {
    // The number field suggests the next free number.
    await expect(page.getByLabel("Համարը")).toHaveValue(String(n));
    await page.getByRole("button", { name: "Ավելացնել սեղան" }).click();
    await expect(page.getByRole("status").filter({ hasText: `Ավելացվեց սեղան ${n}։` })).toBeVisible();
  }
  await expect(page.getByTestId("table-row")).toHaveCount(12);

  // A taken number is refused in the owner's language.
  await page.getByLabel("Համարը").fill("5");
  await page.getByRole("button", { name: "Ավելացնել սեղան" }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveText("Այդ համարով սեղան արդեն կա։");

  // Rename: table 12 becomes «Բար», 2 seats → 6.
  const row = (label: string) => page.locator(`[data-testid="table-row"][data-table-label="${label}"]`);
  const row12 = row("12");
  await row12.getByRole("button", { name: "Փոխել" }).click();
  await row12.getByLabel("Համարը").fill("Բար");
  await row12.getByLabel("Տեղերի քանակը").fill("6");
  await row12.getByRole("button", { name: "Պահել" }).click();
  await expect(row("Բար")).toContainText("Սեղան Բար");
  await expect(row("Բար")).toContainText("6 տեղ");

  await page.getByRole("link", { name: "Տպել բոլոր QR կոդերը" }).click();
  await expect(page).toHaveURL(/\/admin\/tables\/print$/);
  await expect(page.getByTestId("qr-sheet")).toHaveCount(3);
  await expect(page.getByTestId("qr-card")).toHaveCount(12);
  const card5 = page.locator('[data-testid="qr-card"][data-table-label="5"]');
  await expect(card5.getByRole("img", { name: "Սեղան 5" })).toBeVisible();
  await expect(card5.getByText("Սկանավորեք՝ պատվիրելու համար")).toBeVisible();
  await expect(card5.getByText("Сканируйте, чтобы заказать")).toHaveAttribute("lang", "ru");
  await expect(card5.getByText("Scan to order")).toHaveAttribute("lang", "en");
  const before = await qrUrls(page);
  expect(before["5"]).toMatch(/\/t\/[A-Za-z0-9_-]{46}$/);
  expect(new Set(Object.values(before)).size).toBe(12);

  await page.goto("/admin/tables");
  const row5 = row("5");
  await row5.getByRole("button", { name: "Վերատպել QR" }).click();
  await expect(row5.getByRole("alert")).toContainText("Այս սեղանի հին QR կոդը կդադարի աշխատել։");
  await row5.getByRole("button", { name: "Այո, վերատպել" }).click();
  await expect(row5.getByRole("status")).toHaveText("Նոր QR կոդը պատրաստ է, հինն այլևս չի աշխատում։ Տպեք և փակցրեք նորը։");

  await row5.getByRole("link", { name: "Տպել" }).click();
  await expect(page.getByTestId("qr-card")).toHaveCount(1);
  const after = await qrUrls(page);
  expect(after["5"]).toMatch(/\/t\/[A-Za-z0-9_-]{46}$/);
  expect(after["5"]).not.toBe(before["5"]);

  // The other tables keep their codes.
  await page.goto("/admin/tables/print");
  const all = await qrUrls(page);
  expect(all["4"]).toBe(before["4"]);
  expect(all["5"]).toBe(after["5"]);
});

test("the print view fits the screen without sideways scrolling", async ({ page }) => {
  await createFreshCafe(page);
  await page.goto("/admin/tables");
  await page.getByRole("button", { name: "Ավելացնել սեղան" }).click();
  await expect(page.getByTestId("table-row")).toHaveCount(1);
  await page.goto("/admin/tables/print");
  await expect(page.getByTestId("qr-card")).toHaveCount(1);
  // The menu of a brand-new café isn't published yet: printing warns about it.
  await expect(page.getByRole("status")).toHaveText(
    "Ճաշացանկը դեռ հրապարակված չէ։ Մինչ այդ հյուրերը QR կոդով ճաշացանկ չեն տեսնի։",
  );
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
