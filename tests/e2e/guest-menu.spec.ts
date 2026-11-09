import type { Locator, Page } from "@playwright/test";
import { formatAmd } from "../../src/lib/format/money";
import { expect, test } from "./fixtures";
import { demoTable, type TestCafe } from "./guest-helpers";
import { createTestCafe, LONG_HY, LONG_RU } from "./guest-menu-fixture";
import { ownerEmail, ownerPassword } from "./helpers";

const dish = (page: Page, name: string): Locator => page.getByTestId("dish").filter({ hasText: name });
const visibleDishNames = (page: Page) =>
  page.getByTestId("dish").evaluateAll((els) => els.map((e) => e.getAttribute("data-dish-id")).sort());
const noHorizontalScroll = async (page: Page) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);

test.describe("guest menu at the demo café", () => {
  test.skip(!ownerEmail || !ownerPassword, "needs E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD from .env.local");

  test("search finds khorovats in Armenian, Russian and Latin letters", async ({ page }) => {
    const { token } = await demoTable("9");
    await page.goto(`/hy/m/demo-cafe/main?t=${token}`);
    const search = page.getByRole("searchbox", { name: "Որոնել ճաշացանկում" });

    const results: (string | null)[][] = [];
    for (const q of ["խորոված", "хоровац", "khorovats"]) {
      await search.fill(q);
      await expect(dish(page, "Հավի խորոված")).toBeVisible();
      await expect(dish(page, "Տոլմա")).toHaveCount(0);
      results.push(await visibleDishNames(page));
    }
    expect(results[0]!.length).toBeGreaterThanOrEqual(4);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);

    await search.fill("պիցցա");
    await expect(page.getByText("Այդպիսի ուտեստ չգտանք։ Փորձեք այլ բառ։")).toBeVisible();
    await search.fill("");
    await expect(page.getByTestId("dish")).toHaveCount(41);
    await noHorizontalScroll(page);
  });

  test("tabs, the dish sheet's option rules, the cart and its totals; switching language keeps the table", async ({ page }) => {
    const { token } = await demoTable("9");
    await page.goto(`/hy/m/demo-cafe/main?t=${token}`);
    await expect(page.getByTestId("table-chip")).toHaveText("Սեղան 9");

    // Sticky tabs jump to a section and follow the scroll.
    const tabs = page.getByRole("navigation", { name: "Ճաշացանկի բաժիններ" });
    await tabs.getByRole("link", { name: "Սուրճ և թեյ" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Սուրճ և թեյ" })).toBeInViewport();
    await expect(tabs.getByRole("link", { name: "Սուրճ և թեյ" })).toHaveAttribute("aria-current", "true");

    // Cappuccino: size is required with 250 ml preselected; milk is optional, one at most.
    await dish(page, "Կապուչինո").getByRole("button", { name: "Ավելացնել՝ Կապուչինո" }).click();
    const sheet = page.getByRole("dialog", { name: "Կապուչինո" });
    const add = sheet.getByRole("button", { name: /^Ավելացնել\s+\d/ });
    await expect(sheet.getByRole("radio", { name: "250 մլ" })).toBeChecked();
    await expect(add).toContainText(formatAmd(1300, "hy"));
    await sheet.getByRole("radio", { name: "350 մլ" }).check();
    await expect(add).toContainText(formatAmd(1600, "hy"));
    await sheet.getByRole("checkbox", { name: "Վարսակի կաթ" }).check();
    await expect(add).toContainText(formatAmd(1900, "hy"));
    await sheet.getByRole("checkbox", { name: "Առանց լակտոզի կաթ" }).check();
    await expect(sheet.getByRole("checkbox", { name: "Վարսակի կաթ" })).not.toBeChecked();
    await expect(add).toContainText(formatAmd(1800, "hy"));
    await sheet.getByRole("checkbox", { name: "Առանց լակտոզի կաթ" }).uncheck();
    await sheet.getByRole("button", { name: "Ավելացնել քանակը" }).click();
    await expect(add).toContainText(formatAmd(3200, "hy"));
    await add.click();
    await expect(sheet).toBeHidden();

    // A simple dish goes straight in with one tap.
    await dish(page, "Տոլմա").getByRole("button", { name: "Ավելացնել՝ Տոլմա" }).click();
    const bar = page.getByRole("button", { name: /Դիտել պատվերը/ });
    await expect(bar).toContainText("3 ուտեստ");
    expect(await bar.locator(".num").textContent()).toBe(formatAmd(6400, "hy"));

    await bar.click();
    await expect(page).toHaveURL(/#cart$/);
    const cart = page.getByTestId("cart");
    await expect(cart.getByRole("heading", { name: "Ձեր պատվերը" })).toBeVisible();
    await expect(cart.getByTestId("cart-line")).toHaveCount(2);
    await expect(cart.getByTestId("cart-line").first()).toContainText("350 մլ");
    expect(await cart.getByTestId("cart-total").textContent()).toBe("6 400 ֏");
    await cart.getByRole("button", { name: "Ավելացնել քանակը՝ Տոլմա" }).click();
    expect(await cart.getByTestId("cart-total").textContent()).toBe(formatAmd(9600, "hy"));
    await noHorizontalScroll(page);

    // The phone's back button returns to the menu.
    await page.goBack();
    await expect(page.getByRole("searchbox")).toBeVisible();

    // Another language: same table, same cart, prices in that language's format.
    await page.getByRole("link", { name: "Eng" }).click();
    await expect(page).toHaveURL(new RegExp(`/en/m/demo-cafe/main\\?t=${token}$`));
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByTestId("table-chip")).toHaveText("Table 9");
    const enBar = page.getByRole("button", { name: /View order/ });
    await expect(enBar).toContainText("4 items");
    expect(await enBar.locator(".num").textContent()).toBe("AMD 9,600");
  });
});

test.describe("guest menu edge cases at a fresh café", () => {
  let cafe: TestCafe;
  test.beforeAll(async () => {
    test.setTimeout(120_000);
    cafe = await createTestCafe();
  });

  test("a 70-character name wraps without sideways scrolling (Review focus 3)", async ({ page }) => {
    expect(LONG_RU.length).toBeGreaterThanOrEqual(70);
    for (const [locale, name] of [
      ["ru", LONG_RU],
      ["hy", LONG_HY],
    ] as const) {
      await page.goto(`/${locale}/m/${cafe.slug}/main?t=${cafe.tables["1"]!.token}`);
      const row = dish(page, name);
      await expect(row).toBeVisible();
      await noHorizontalScroll(page);
      const box = (await row.boundingBox())!;
      const viewport = page.viewportSize()!;
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      // The price stays on screen and on one line.
      const price = row.locator(".num").first();
      expect(await price.textContent()).toBe(formatAmd(12450, locale));
      const priceBox = (await price.boundingBox())!;
      expect(priceBox.x + priceBox.width).toBeLessThanOrEqual(viewport.width);
      expect(priceBox.height).toBeLessThan(40);
      await row.getByRole("button", { name: new RegExp(name.slice(0, 20)) }).first().click();
      await noHorizontalScroll(page);
      await page.keyboard.press("Escape");
    }
  });

  test("missing translations fall back to Armenian, then Russian, marked with lang (Review focus 5)", async ({ page }) => {
    await page.goto(`/en/m/${cafe.slug}/main?t=${cafe.tables["1"]!.token}`);
    await expect(dish(page, "Tolma").getByText("Tolma", { exact: true })).not.toHaveAttribute("lang");
    await expect(dish(page, "Բորանի").getByText("Բորանի", { exact: true })).toHaveAttribute("lang", "hy");
    await expect(dish(page, "Сырники со сметаной").getByText("Сырники со сметаной", { exact: true })).toHaveAttribute("lang", "ru");
    // The café name is Armenian on an English page.
    await expect(page.getByRole("heading", { level: 1 })).toHaveAttribute("lang", "hy");

    await page.goto(`/hy/m/${cafe.slug}/main?t=${cafe.tables["1"]!.token}`);
    await expect(dish(page, "Сырники со сметаной").getByText("Сырники со сметаной", { exact: true })).toHaveAttribute("lang", "ru");
    await expect(dish(page, "Բորանի").getByText("Բորանի", { exact: true })).not.toHaveAttribute("lang");
  });

  test("a sold-out dish is greyed out and can't be ordered; option limits hold", async ({ page }) => {
    await page.goto(`/en/m/${cafe.slug}/main?t=${cafe.tables["1"]!.token}`);
    const trout = dish(page, "Sevan trout");
    await expect(trout).toContainText("Not today");
    await expect(trout.getByRole("button", { name: /Sevan trout/ })).toBeDisabled();
    await expect(trout.getByRole("button", { name: "Add Sevan trout" })).toHaveCount(0);
    await expect(dish(page, "Tolma")).toContainText("300 g");
    await expect(dish(page, "Tolma")).toContainText("popular");

    await dish(page, "Armenian coffee").getByRole("button", { name: "Add Armenian coffee" }).click();
    const sheet = page.getByRole("dialog", { name: "Armenian coffee" });
    await expect(sheet.getByRole("radio", { name: "Medium" })).toBeChecked();
    await expect(sheet.getByText("Optional, up to 2")).toBeVisible();
    await sheet.getByRole("checkbox", { name: "Milk" }).check();
    await sheet.getByRole("checkbox", { name: "Cinnamon" }).check();
    await expect(sheet.getByRole("checkbox", { name: "Honey" })).toBeDisabled();
    await expect(sheet.getByRole("button", { name: /^Add/ })).toContainText("AMD 1,000");
    await sheet.getByLabel("Note for the kitchen").fill("x".repeat(170));
    await expect(sheet.getByText("170/200")).toBeVisible();
    await sheet.getByRole("button", { name: "Close" }).click();
    await expect(sheet).toBeHidden();
  });

  test("without a valid table the menu still shows, without ordering, and says why", async ({ page }) => {
    await page.goto(`/hy/m/${cafe.slug}/main`);
    await expect(page.getByText("Հեռախոսից պատվիրելու համար սկանավորեք սեղանի QR կոդը։")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Ավելացնել՝/ })).toHaveCount(0);
    await expect(page.getByTestId("table-chip")).toHaveCount(0);

    // A valid sticker of another café is not a table here.
    const other = await demoTable("9").catch(() => null);
    if (other) {
      await page.goto(`/hy/m/${cafe.slug}/main?t=${other.token}`);
      await expect(page.getByText("Այս QR կոդն այլևս չի գործում։ Խնդրեք մատուցողին օգնել։")).toBeVisible();
      await expect(page.getByRole("button", { name: /^Ավելացնել՝/ })).toHaveCount(0);
      await expect(page.getByTestId("table-chip")).toHaveCount(0);
    }
  });
});

test.describe("guest menu when the café switches ordering off", () => {
  test("the menu shows a calm notice and the cart explains that the waiter takes orders", async ({ page }) => {
    test.setTimeout(120_000);
    const cafe = await createTestCafe();
    const url = `/ru/m/${cafe.slug}/main?t=${cafe.tables["2"]!.token}`;
    await page.goto(url);
    await dish(page, "Толма").getByRole("button", { name: "Добавить: Толма" }).click();
    await expect(page.getByRole("button", { name: /Посмотреть заказ/ })).toContainText("1 блюдо");

    const off = await cafe.owner.from("locations").update({ qr_ordering_enabled: false }).eq("id", cafe.locationId).select("id");
    expect(off.error).toBeNull();
    await page.reload();
    await expect(page.getByText("Сейчас заказы принимает официант.")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Добавить:/ })).toHaveCount(0);
    await page.getByRole("button", { name: /Посмотреть заказ/ }).click();
    await expect(page.getByTestId("cart").getByText("Сейчас заказы принимает официант.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Отправить на кухню" })).toHaveCount(0);
  });
});

test("the guest menu downloads little JavaScript of its own", async ({ page, browser }) => {
  const scripts = async (p: Page, url: string) => {
    const seen = new Map<string, number>();
    p.on("response", async (res) => {
      if (res.request().resourceType() !== "script") return;
      const sizes = await res.request().sizes();
      seen.set(new URL(res.url()).pathname, sizes.responseBodySize);
    });
    await p.goto(url, { waitUntil: "networkidle" });
    return seen;
  };
  const landing = await scripts(await browser.newPage(), "/hy");
  const menu = await scripts(page, "/hy/m/demo-cafe/main");
  const own = [...menu].filter(([path]) => !landing.has(path));
  const ownKb = own.reduce((s, [, b]) => s + b, 0) / 1024;
  const totalKb = [...menu.values()].reduce((s, b) => s + b, 0) / 1024;
  console.log(`guest menu JS: ${totalKb.toFixed(1)} KB in total, ${ownKb.toFixed(1)} KB beyond the framework`);
  expect(own.every(([path]) => !path.includes("supabase"))).toBe(true);
  expect(ownKb).toBeLessThan(25);
});
