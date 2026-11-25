import { expect, test } from "./fixtures";
import { createCafeWithMenu } from "./guest-helpers";
import { loadCafe, pairKitchenDevice, revokeDevice, startShift } from "./kitchen-helpers";
import { pairWaiterDevice, panel, tableButton } from "./waiter-helpers";

// "Can't make" (ADR-081): the guest orders ribs, the kitchen cannot make them
// and presses one button; the guest's order page says so kindly and offers
// similar dishes (nothing is ordered by itself); the waiter sees the alert on
// the table until they tap "Told the guest". Needs migration
// 20261123310000_cant_make on the dev project: it reaches the project when CI
// applies it after the push, so until then this test skips.
const SHOTS = "/tmp/claude-0/-home-user-Product/707986f3-f7bb-583a-bb93-27d05c735ec3/scratchpad/cantmake";

test.describe("can't make", () => {
  test.skip(({ isMobile }) => isMobile, "one desktop run covers the flow");

  test("the kitchen presses it, the guest gets alternatives, the waiter is told", async ({ page, browser }, info) => {
    test.setTimeout(300_000);
    const cafe = await createCafeWithMenu({
      categories: [{ key: "grill", names: { hy: "Խորոված", ru: "Гриль", en: "Grill" } }],
      dishes: [
        { key: "ribs", category: "grill", names: { hy: "Խոզի կողիկներ", ru: "Свиные рёбрышки", en: "Pork ribs" }, price: 4200 },
        { key: "kebab", category: "grill", names: { hy: "Քյաբաբ", ru: "Кебаб", en: "Kebab" }, price: 3100 },
        { key: "chicken", category: "grill", names: { hy: "Հավի խորոված", ru: "Курица гриль", en: "Chicken grill" }, price: 3300 },
        { key: "lamb", category: "grill", names: { hy: "Գառան խորոված", ru: "Баранина гриль", en: "Lamb grill" }, price: 4800 },
      ],
      tables: ["1"],
    });
    const probe = await (cafe.owner as unknown as {
      from: (t: string) => { select: (c: string) => { limit: (n: number) => PromiseLike<{ error: unknown }> } };
    })
      .from("order_items")
      .select("cant_make_at")
      .limit(1);
    test.skip(probe.error !== null, "needs migration 20261123310000_cant_make on the dev project (CI applies it after the push)");

    // The guest orders the ribs from their phone.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/en/m/${cafe.slug}/main?t=${cafe.tables["1"]!.token}`);
    await page.getByRole("button", { name: "Add Pork ribs" }).click();
    await page.getByRole("button", { name: /View order/ }).click();
    await page.getByRole("button", { name: "Send to the kitchen" }).click();
    await expect(page).toHaveURL(/\/order/, { timeout: 30_000 });
    await expect(page.getByTestId("cant-make")).toHaveCount(0);

    // The kitchen: Can't make, with a confirm step.
    const kitchenCafe = await loadCafe(cafe.owner, cafe.slug);
    const kitchen = await pairKitchenDevice(browser, cafe.owner, kitchenCafe, { width: 1280, height: 800 });
    const waiter = await pairWaiterDevice(browser, cafe, info.project.use.baseURL);
    const waiterContext = await browser.newContext({ storageState: waiter.storageState, baseURL: info.project.use.baseURL, viewport: { width: 1024, height: 768 } });
    try {
      const board = kitchen.page;
      await startShift(board);
      const line = board.getByTestId("ticket-line").filter({ hasText: "Խոզի կողիկներ" });
      await expect(line).toBeVisible({ timeout: 30_000 });
      await line.getByTestId("cant-make").click();
      await expect(board.getByTestId("cant-make-confirm")).toContainText("Խոզի կողիկներ");
      await board.screenshot({ path: `${SHOTS}/kitchen-confirm.png` });
      await board.getByTestId("cant-make-yes").click();
      // The ribs were the only dish, so the whole order is cancelled (ADR-081) and the ticket leaves the board.
      await expect(board.getByTestId("ticket-line").filter({ hasText: "Խոզի կողիկներ" })).toHaveCount(0, { timeout: 30_000 });
      await board.screenshot({ path: `${SHOTS}/kitchen-done.png` });

      // The guest's page tells them, kindly, with up to 3 similar dishes.
      const note = page.getByTestId("cant-make");
      await expect(note).toBeVisible({ timeout: 40_000 });
      await expect(note).toContainText("Sorry, this dish isn't available right now. Our chef suggests:");
      await expect(page.getByText(/out of stock/i)).toHaveCount(0);
      const alts = note.getByTestId("cant-make-alt");
      await expect(alts).toHaveCount(3);
      await expect(note).not.toContainText("Pork ribs");
      await page.screenshot({ path: `${SHOTS}/guest-390.png`, fullPage: true });

      // The bill: the cancelled dish is off the total.
      const { data: order } = await cafe.owner.from("orders").select("id, total, status").eq("location_id", cafe.locationId).single();
      expect(order?.total).toBe(0);

      // One tap puts a dish in the cart and opens the menu with the cart showing; nothing is ordered.
      await alts.first().getByRole("button").click();
      await expect(page).toHaveURL(new RegExp(`/m/${cafe.slug}/main`), { timeout: 30_000 });
      // The menu opens with the cart already showing the chosen dish, waiting for the guest to send it.
      await expect(page.getByRole("heading", { name: "Your order" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Send to the kitchen" })).toBeVisible();
      const { count } = await cafe.owner.from("orders").select("id", { count: "exact", head: true }).eq("location_id", cafe.locationId);
      expect(count).toBe(1);

      // The waiter sees it on the table until they tap "Told the guest".
      const wp = await waiterContext.newPage();
      await wp.goto("/waiter");
      await tableButton(wp, "1").click();
      const alert = panel(wp).getByTestId("cant-make-alert");
      await expect(alert).toContainText("Խոզի կողիկներ");
      await wp.screenshot({ path: `${SHOTS}/waiter.png` });
      await alert.getByTestId("cant-make-ack").click();
      await expect(panel(wp).getByTestId("cant-make-alert")).toHaveCount(0);
    } finally {
      await waiterContext.close();
      await kitchen.context.close();
      await revokeDevice(cafe.owner, kitchen.memberId);
      await revokeDevice(cafe.owner, waiter.memberId);
    }
  });
});
