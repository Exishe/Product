import type { Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { demoTable } from "./guest-helpers";
import { ownerEmail, ownerPassword } from "./helpers";

// Round 2 of the guest menu: the slim bar keeps the café's name whole, a
// long menu is two taps from any section, the − / + buttons stand out from
// the card, and a desktop has an order rail instead of the phone's bar.

const dish = (page: Page, name: string): Locator => page.getByTestId("dish").filter({ hasText: name });

// WCAG contrast of two CSS colours as the browser resolves them (color-mix included).
async function contrast(page: Page, a: string, b: string): Promise<number> {
  return page.evaluate(
    ([x, y]) => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const lum = (color: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, bl] = [...ctx.getImageData(0, 0, 1, 1).data].map((v) => {
          const c = v / 255;
          return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
      };
      const [l1, l2] = [lum(x!), lum(y!)].sort((p, q) => q - p);
      return (l1! + 0.05) / (l2! + 0.05);
    },
    [a, b],
  );
}

// A round − / +: its ring against the card it sits on, its glyph against its own fill.
async function expectClearStep(page: Page, button: Locator, card: Locator) {
  // Its laid-out size: a card tilting under the pointer scales what is painted.
  const size = await button.evaluate((el: HTMLElement) => Math.min(el.offsetWidth, el.offsetHeight));
  expect(size).toBeGreaterThanOrEqual(44);
  const style = await button.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      ring: s.borderTopColor,
      width: parseFloat(s.borderTopWidth),
      fill: s.backgroundColor,
      glyph: s.color,
    };
  });
  const behind = await card.evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(style.width).toBeGreaterThanOrEqual(1);
  expect(await contrast(page, style.ring, behind)).toBeGreaterThanOrEqual(3);
  expect(await contrast(page, style.glyph, style.fill)).toBeGreaterThanOrEqual(4.5);
}

const scrollDown = async (page: Page, y: number) => {
  await page.evaluate((top) => window.scrollTo(0, top), y);
  await expect(page.getByTestId("slim-bar")).toHaveAttribute("data-shown", "true");
};

test.describe("guest menu: browsing and ordering at the demo café", () => {
  test.skip(!ownerEmail || !ownerPassword, "needs E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD from .env.local");

  test("the slim bar shows the café's full name, never cut, and stays 64 px high", async ({ page }) => {
    const { token } = await demoTable("9");
    for (const locale of ["hy", "ru", "en"]) {
      await page.goto(`/${locale}/m/demo-cafe/main?t=${token}`);
      await scrollDown(page, 700);
      const bar = page.getByTestId("slim-bar");
      const name = bar.getByText("Դեմո սրճարան");
      await expect(name).toBeInViewport();
      const fit = await name.evaluate((el) => {
        const s = getComputedStyle(el);
        return { ellipsis: s.textOverflow, clamp: s.webkitLineClamp, overflow: s.overflow };
      });
      expect(fit).toEqual({ ellipsis: "clip", clamp: "none", overflow: "visible" });
      // Every line of the name is inside the bar.
      const [box, outer] = [(await name.boundingBox())!, (await bar.boundingBox())!];
      expect(outer.height).toBeLessThanOrEqual(64.5);
      expect(box.y).toBeGreaterThanOrEqual(outer.y);
      expect(box.y + box.height).toBeLessThanOrEqual(outer.y + outer.height);
    }
  });

  test("any section is two taps away through the section groups", async ({ page }) => {
    const { token } = await demoTable("9");
    await page.goto(`/hy/m/demo-cafe/main?t=${token}`);
    await scrollDown(page, 900);
    // Tap one: the group's button stays with the sticky bar.
    const drinks = page.getByTestId("group-drinks");
    await expect(drinks).toBeInViewport();
    await drinks.click();
    const panel = page.getByTestId("section-panel");
    await expect(panel.getByRole("link")).toHaveCount(2);
    // Tap two.
    await panel.getByRole("link", { name: /Ըմպելիքներ/ }).click();
    await expect(panel).toBeHidden();
    await expect(page.getByRole("heading", { level: 2, name: "Ըմպելիքներ" })).toBeInViewport();
    // The group the page is in is marked.
    await expect(drinks).toHaveCSS("font-weight", "600");
  });

  test("a section's name finds the whole section, under its title", async ({ page }) => {
    const { token } = await demoTable("9");
    await page.goto(`/en/m/demo-cafe/main?t=${token}`);
    const search = page.getByRole("searchbox", { name: "Search the menu" });
    for (const q of ["Drinks", "Напитки", "Ըմպելիքներ"]) {
      await search.fill(q);
      await expect(page.locator("main h2")).toHaveAccessibleName("Drinks");
      await expect(page.getByTestId("dish")).toHaveCount(5);
    }
  });

  test("the cart's and the featured card's − / + stand out from the card", async ({ page }) => {
    const { token } = await demoTable("9");
    await page.goto(`/hy/m/demo-cafe/main?t=${token}`);
    const featured = page.locator('[data-testid="dish"][data-featured]').first();
    await featured.scrollIntoViewIfNeeded();
    await expectClearStep(
      page,
      featured.getByRole("button", { name: "Ավելացնել քանակը" }),
      featured.locator("article"),
    );

    await dish(page, "Տոլմա").getByRole("button", { name: "Ավելացնել՝ Տոլմա" }).click();
    const wide = page.viewportSize()!.width >= 1024;
    if (wide) {
      // A desktop: the rail has the same buttons, and no bar floats over the dishes.
      const rail = page.getByTestId("order-rail");
      await expectClearStep(page, rail.getByRole("button", { name: "Ավելացնել քանակը՝ Տոլմա" }), rail);
    }
    await page.getByRole("button", { name: /Դիտել պատվերը/ }).click();
    const cart = page.getByTestId("cart");
    await expectClearStep(
      page,
      cart.getByRole("button", { name: "Ավելացնել քանակը՝ Տոլմա" }),
      cart.locator("ul").first(),
    );
    await expectClearStep(
      page,
      cart.getByRole("button", { name: "Հեռացնել՝ Տոլմա" }),
      cart.locator("ul").first(),
    );

    // The order view's header is one short bar; the first line starts high on the screen.
    expect((await page.locator("header").boundingBox())!.height).toBeLessThanOrEqual(120);
    expect((await cart.getByTestId("cart-line").first().boundingBox())!.y).toBeLessThan(300);
    await cart.getByRole("button", { name: "Հեռացնել՝ Տոլմա" }).click();
    await expect(page.getByRole("searchbox")).toBeVisible();
  });

  test("a desktop has an order rail with the send button and no bottom bar", async ({ page }) => {
    test.skip(page.viewportSize()!.width < 1024, "desktop layout");
    const { token } = await demoTable("9");
    await page.goto(`/en/m/demo-cafe/main?t=${token}`);
    await expect(page.getByTestId("guest-dock")).toBeHidden();
    expect((await page.locator("header").boundingBox())!.height).toBeLessThanOrEqual(180);

    const rail = page.getByTestId("order-rail");
    await expect(rail.getByText("Add dishes and they appear here.")).toBeVisible();
    await expect(rail.getByRole("button", { name: "Call the waiter" })).toBeVisible();
    await dish(page, "Tolma").getByRole("button", { name: "Add Tolma" }).click();
    await dish(page, "Harissa").getByRole("button", { name: "Add Harissa" }).click();
    await expect(rail.getByTestId("rail-line")).toHaveCount(2);
    await expect(rail.getByTestId("rail-total")).toHaveText("AMD 6,000");
    await expect(rail.getByRole("button", { name: "Send to the kitchen" })).toBeEnabled();
    await rail.getByRole("button", { name: "Increase Tolma" }).click();
    await expect(rail.getByTestId("rail-total")).toHaveText("AMD 9,200");

    // Nothing lies over a dish's add button or its price.
    const covered = await page.getByTestId("dish").evaluateAll((rows) =>
      rows.flatMap((row) => {
        const targets = [
          row.querySelector(":scope button[aria-label]:last-of-type"),
          row.querySelector(".num"),
        ];
        return targets.flatMap((el) => {
          if (!el) return [];
          const r = el.getBoundingClientRect();
          if (r.top < 140 || r.bottom > window.innerHeight || r.width === 0) return [];
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return top && (el.contains(top) || top.contains(el)) ? [] : [row.getAttribute("data-dish-id")];
        });
      }),
    );
    expect(covered).toEqual([]);

    await rail.getByRole("button", { name: "Remove Harissa" }).click();
    await rail.getByRole("button", { name: "Decrease Tolma" }).click();
    await rail.getByRole("button", { name: "Remove Tolma" }).click();
    await expect(rail.getByText("Add dishes and they appear here.")).toBeVisible();
  });
});

// Blanca by Melonpan: the dev project's pilot café with a full brand (a
// wordmark, covers, 38 sections and a wine list). Skipped where it is not there.
test.describe("guest menu at a café with a brand and a long menu", () => {
  const open = async (page: Page, locale: string) => {
    const res = await page.goto(`/${locale}/m/blanca/main`);
    test.skip(res?.status() !== 200, "the Blanca demo café is not in this project");
  };

  test("the slim bar shows the wordmark, 64 px high, nothing cut", async ({ page }) => {
    for (const locale of ["hy", "ru", "en"]) {
      await open(page, locale);
      await scrollDown(page, 700);
      const bar = page.getByTestId("slim-bar");
      const mark = bar.getByRole("img", { name: "Blanca by Melonpan" });
      await expect(mark).toBeInViewport();
      expect(await mark.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
      expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(64.5);
      const cut = await bar.evaluate((el) =>
        [...el.querySelectorAll("*")].some((n) => getComputedStyle(n).textOverflow === "ellipsis"),
      );
      expect(cut).toBe(false);
    }
  });

  test("white wine by the glass is two taps from the top; a wine is found in three scripts", async ({
    page,
  }) => {
    await open(page, "hy");
    await page.getByTestId("group-wine").click();
    const panel = page.getByTestId("section-panel");
    await expect(panel.getByRole("link", { name: /Սպիտակ գինի/ })).toBeVisible();
    await expect(panel.getByRole("link", { name: /Պիցցա/ })).toHaveCount(0);
    await panel.getByRole("link", { name: /Գինի բաժակով/ }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Գինի բաժակով" })).toBeInViewport();

    const search = page.getByRole("searchbox", { name: "Որոնել ճաշացանկում" });
    for (const q of ["Sancerre", "Сансер", "սանսեր"]) {
      await search.fill(q);
      const wine = dish(page, "J. de Villebois Sancerre");
      await expect(wine).toBeVisible();
      // Its section is named above it, and its region and grape read like a wine card.
      await expect(page.locator("main h2")).toHaveAccessibleName("Սպիտակ գինի");
      await expect(wine).toContainText("Loire Valley, France");
      await expect(wine).toContainText("Sauvignon Blanc");
    }
    // Sizes with their prices on one line.
    await search.fill("yuzu");
    const sizes = dish(page, "Յուզու ցիտրուս լիմոնադ").getByTestId("sizes");
    await expect(sizes).toContainText("1 600 ֏");
    await expect(sizes).toContainText("3 600 ֏");
  });

  test("a section with a cover photo has no featured card under it", async ({ page }) => {
    await open(page, "en");
    const first = page.locator("section").first();
    await expect(first.locator("img").first()).toBeVisible();
    await expect(first.locator('[data-testid="dish"][data-featured]')).toHaveCount(0);
    // The cover keeps the plate in view: never wider than 2.4:1.
    const cover = (await first.locator("img").first().boundingBox())!;
    expect(cover.width / cover.height).toBeLessThanOrEqual(2.4);
  });
});
