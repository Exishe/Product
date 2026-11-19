import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { TestCafe } from "./guest-helpers";
import { createTestCafe } from "./guest-menu-fixture";

// The waiting-room games on the order status page: each game's code arrives
// only when it is started, every game draws, closes with Escape, and the
// "order ready" banner covers (and pauses) a game in play. Runs at a café
// made for this worker, so it never places orders at the demo café.
let cafe: TestCafe;
const IDS = ["runner", "fighter", "merge", "slice", "platformer"] as const;

async function placeOrder(page: Page, table: string) {
  await page.goto(`/t/${cafe.tables[table]!.token}`);
  await expect(page).toHaveURL(/\?t=/);
  await page
    .getByTestId("dish")
    .filter({ hasText: "Տոլմա" })
    .getByRole("button", { name: "Ավելացնել՝ Տոլմա" })
    .click();
  await page.getByRole("button", { name: /Դիտել պատվերը/ }).click();
  await page.getByRole("button", { name: "Ուղարկել խոհանոց" }).click();
  await expect(page).toHaveURL(/\/order\?t=/);
  await expect(page.getByTestId("games")).toBeVisible();
}

// How much of the canvas differs from its top-left pixel: a blank or
// single-colour canvas is 0.
const canvasVariety = (page: Page) =>
  page
    .getByTestId("game-layer")
    .locator("canvas")
    .evaluate((c: HTMLCanvasElement) => {
      const ctx = c.getContext("2d")!;
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      let differ = 0;
      for (let i = 0; i < data.length; i += 4 * 97) {
        if (
          Math.abs(data[i]! - data[0]!) +
            Math.abs(data[i + 1]! - data[1]!) +
            Math.abs(data[i + 2]! - data[2]!) >
          30
        )
          differ++;
      }
      return differ / (data.length / (4 * 97));
    });

test.describe("games while the order cooks", () => {
  test.use({ locale: "hy-AM" });
  test.beforeAll(async () => {
    cafe = await createTestCafe(["1", "2"]);
  });

  test("each game loads on start, draws, and closes with Escape", async ({ page }) => {
    const scripts: string[] = [];
    page.on("request", (r) => r.resourceType() === "script" && scripts.push(r.url()));
    await placeOrder(page, "1");

    const cards = page.getByTestId("games").getByRole("button");
    await expect(cards).toHaveCount(IDS.length);
    // Card pictures are the games' own frames, not emoji.
    for (const id of IDS)
      await expect(page.getByTestId(`game-${id}`).locator("img")).toHaveAttribute("src", `/games/${id}.webp`);

    for (const id of IDS) {
      await page.getByTestId(`game-${id}`).click();
      const layer = page.getByTestId("game-layer");
      await expect(layer).toBeVisible();
      await expect(layer.locator(`img[src="/games/${id}.webp"]`)).toBeVisible();
      // The order is still cooking: the header says so.
      await expect(layer.getByTestId("game-cooking")).toHaveText("Պատվերը պատրաստվում է");
      // Two lines at most, inside the 56 px header (no lone "է" spilling out).
      const cooking = (await layer.getByTestId("game-cooking").boundingBox())!;
      expect(cooking.height).toBeLessThanOrEqual(32);

      const before = scripts.length;
      await layer.getByTestId("game-start").click();
      await expect(layer.locator("canvas")).toBeVisible();
      // Starting fetched this game's chunk (it is not in the menu or status bundle).
      await expect.poll(() => scripts.length).toBeGreaterThan(before);
      await page.waitForTimeout(700);
      expect(await canvasVariety(page)).toBeGreaterThan(0.1);

      await page.keyboard.press("Escape");
      await expect(layer).toHaveCount(0);
    }
  });

  test("the ready banner covers a game in play and pauses it", async ({ page }) => {
    await placeOrder(page, "2");
    await page.getByTestId("game-merge").click();
    await page.getByTestId("game-start").click();
    const layer = page.getByTestId("game-layer");
    await expect(layer.locator("canvas")).toBeVisible();

    const { data: tickets } = await cafe.owner
      .from("kitchen_tickets")
      .select("id, status")
      .eq("kind", "order")
      .eq("status", "new");
    expect(tickets!.length).toBeGreaterThan(0);
    for (const t of tickets!) {
      for (const [from, to] of [
        ["new", "cooking"],
        ["cooking", "ready"],
      ] as const) {
        const r = await cafe.owner
          .schema("api")
          .rpc("set_ticket_status", { p_ticket_id: t.id, p_expected: from, p_next: to });
        expect(r.error).toBeNull();
      }
    }
    const banner = layer.getByRole("alertdialog");
    await expect(banner).toBeVisible({ timeout: 5_000 });
    await expect(banner.getByRole("heading")).toHaveText("Ձեր պատվերը պատրաստ է");
    // No emoji: the bell is an icon.
    await expect(banner.locator("svg")).toHaveCount(1);
    await expect(layer.getByTestId("game-cooking")).toHaveCount(0);

    await banner.getByRole("button", { name: "Շարունակել խաղը" }).click();
    await expect(banner).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(layer).toHaveCount(0);
  });
});
