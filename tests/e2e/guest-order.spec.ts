import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { TestCafe } from "./guest-helpers";
import { createTestCafe } from "./guest-menu-fixture";

// Ordering opens table sessions and places orders, so it runs at a café made
// for this worker (never the demo café, whose tables real people scan). Each
// test gets its own table: a second phone at an occupied table would wait for
// the waiter instead of being accepted.
let cafe: TestCafe;
const slugPattern = (rest: string) => new RegExp(`/hy/m/${cafe.slug}/main${rest}`);

async function openMenuFromQr(page: Page, token: string) {
  await page.goto(`/t/${token}`);
  await expect(page).toHaveURL(slugPattern("\\?t="));
}

async function addAndOpenCart(page: Page, dishName: string) {
  await page.getByTestId("dish").filter({ hasText: dishName }).getByRole("button", { name: `Ավելացնել՝ ${dishName}` }).click();
  await page.getByRole("button", { name: /Դիտել պատվերը/ }).click();
  await expect(page.getByRole("heading", { name: "Ձեր պատվերը" })).toBeVisible();
}

const guestSessionOf = (page: Page, tableId: string) =>
  page.evaluate((id) => (JSON.parse(localStorage.getItem(`pativ:guest:v1:${id}`) ?? "null") as { id: string } | null)?.id ?? null, tableId);

test.describe("ordering at a fresh café", () => {
  test.use({ locale: "hy-AM" });
  test.beforeAll(async () => {
    cafe = await createTestCafe(["1", "2", "3"]);
  });

  test("a lost answer is retried with the same key: the same order, and only one (Review focus 1)", async ({ page, consoleErrors }) => {
    const table = { id: cafe.tables["1"]!.id, token: cafe.tables["1"]!.token };
    await openMenuFromQr(page, table.token);
    await addAndOpenCart(page, "Տոլմա");

    // The request reaches the database, then the phone loses signal before the answer arrives.
    const answers: string[] = [];
    let cut = false;
    await page.route("**/rest/v1/rpc/guest_place_order", async (route) => {
      const response = await route.fetch();
      answers.push((await response.json()) as string);
      if (!cut) {
        cut = true;
        await route.abort("internetdisconnected");
      } else {
        await route.fulfill({ response });
      }
    });
    await page.getByRole("button", { name: "Ուղարկել խոհանոց" }).click();
    await expect(page.getByText("Կապ չկա։ Պատվերը պահված է, կուղարկենք, երբ կապը վերականգնվի։")).toBeVisible();
    expect(answers).toHaveLength(1);
    // The cart is held as sent: it can't be changed into a different order.
    await expect(page.getByRole("button", { name: "Ավելացնել քանակը՝ Տոլմա" })).toBeDisabled();

    // Even after a reload the saved key is reused, and the retry button sends it.
    await page.reload();
    await expect(page.getByRole("button", { name: "Փորձել նորից" }).or(page.getByTestId("order").first())).toBeVisible();
    if (await page.getByRole("button", { name: "Փորձել նորից" }).isVisible()) await page.getByRole("button", { name: "Փորձել նորից" }).click();
    await expect(page).toHaveURL(slugPattern("/order\\?t="));
    expect(answers.length).toBeGreaterThanOrEqual(2);
    expect(new Set(answers).size).toBe(1);

    await expect(page.getByTestId("order")).toHaveCount(1);
    await expect(page.getByTestId("order")).toContainText("Տոլմա");

    // The café's own view: exactly one order from this guest session.
    const guestSession = await guestSessionOf(page, table.id);
    const owner = cafe.owner;
    const { data } = await owner.from("orders").select("id").eq("guest_session_id", guestSession!);
    expect(data?.map((o) => o.id)).toEqual([answers[0]]);

    // The browser logs the request we cut on purpose; nothing else may fail.
    const cutLog = consoleErrors.findIndex((e) => e.includes("ERR_INTERNET_DISCONNECTED"));
    expect(cutLog).toBeGreaterThanOrEqual(0);
    consoleErrors.splice(cutLog, 1);
  });

  test("the guest sees the kitchen's progress live, within 2 seconds, without reloading", async ({ page }, info) => {
    const table = { id: cafe.tables["2"]!.id, token: cafe.tables["2"]!.token };
    await openMenuFromQr(page, table.token);
    await addAndOpenCart(page, "Բորանի");
    await page.getByRole("button", { name: "Ուղարկել խոհանոց" }).click();
    await expect(page).toHaveURL(/\/order\?t=/);

    const order = page.getByTestId("order").first();
    await expect(order.getByRole("heading", { level: 2 })).toHaveText(/^Պատվեր \d+$/);
    await expect(order).toHaveAttribute("data-status", "accepted");
    await expect(order.getByText("Պատվերն ընդունված է, շուտով կսկսեն պատրաստել։")).toBeVisible();
    await expect(page.getByRole("button", { name: "Կանչել մատուցողին" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Խնդրել հաշիվը" })).toBeVisible();

    // The kitchen starts cooking (the owner may do the kitchen's moves).
    const owner = cafe.owner;
    const guestSession = await guestSessionOf(page, table.id);
    const { data: orders } = await owner.from("orders").select("id").eq("guest_session_id", guestSession!).order("placed_at", { ascending: false }).limit(1);
    const { data: tickets } = await owner.from("kitchen_tickets").select("id").eq("order_id", orders![0]!.id).eq("kind", "order");
    expect(tickets!.length).toBeGreaterThan(0);

    for (const [from, to, label] of [
      ["new", "cooking", "cooking"],
      ["cooking", "ready", "ready"],
    ] as const) {
      for (const ticket of tickets!) {
        const r = await owner.schema("api").rpc("set_ticket_status", { p_ticket_id: ticket.id, p_expected: from, p_next: to });
        expect(r.error).toBeNull();
      }
      const changed = Date.now();
      await expect(order).toHaveAttribute("data-status", label, { timeout: 2_000 });
      console.log(`${info.project.name}: ${label} shown ${Date.now() - changed} ms after the kitchen's change`);
    }
    await expect(order.getByText("Պատրաստ է, մատուցողը բերում է։")).toBeVisible();

    // The cart is empty again; "order more" goes back to the menu at the same table.
    await page.getByRole("link", { name: "Պատվիրել ևս" }).click();
    await expect(page).toHaveURL(slugPattern("\\?t="));
    await expect(page.getByRole("button", { name: /Դիտել պատվերը/ })).toHaveCount(0);
  });

  test("calling the waiter twice makes one open request", async ({ page }) => {
    // Needs supabase/migrations/20261109190300_guest_service_requests.sql on the dev project.
    test.fixme(true, "api.guest_service_request is applied to the dev project by the lead");
    const table = { id: cafe.tables["3"]!.id, token: cafe.tables["3"]!.token };
    await openMenuFromQr(page, table.token);
    await addAndOpenCart(page, "Տոլմա");
    await page.getByRole("button", { name: "Ուղարկել խոհանոց" }).click();
    await expect(page).toHaveURL(/\/order\?t=/);
    const call = page.getByRole("button", { name: "Կանչել մատուցողին" });
    await call.click();
    await expect(page.getByText("Մատուցողը տեղեկացված է։")).toBeVisible();
    await expect(call).toHaveAttribute("aria-pressed", "true");
    await call.click();
    const owner = cafe.owner;
    const { data } = await owner.from("service_requests").select("id").eq("table_id", table.id).eq("kind", "call_waiter").neq("status", "resolved");
    expect(data).toHaveLength(1);
    await page.getByRole("button", { name: "Խնդրել հաշիվը" }).click();
    await expect(page.getByText("Մատուցողը կբերի հաշիվը։")).toBeVisible();
  });
});

test("two phones at one table ordering the same dishes: the second waits for the waiter", async ({ browser }) => {
  // Needs supabase/migrations/20261109190200_guest_possible_duplicates.sql on the dev project.
  test.fixme(true, "the possible-duplicate rule is applied to the dev project by the lead");
  test.setTimeout(120_000);
  const cafe = await createTestCafe();
  const statuses: string[] = [];
  for (let phone = 0; phone < 2; phone++) {
    const context = await browser.newContext({ locale: "en-US" });
    const page = await context.newPage();
    await page.goto(`/en/m/${cafe.slug}/main?t=${cafe.tables["1"]!.token}`);
    const add = page.getByTestId("dish").filter({ hasText: "Tolma" }).getByRole("button", { name: "Add Tolma" });
    await add.click();
    await add.click();
    await page.getByRole("button", { name: /View order/ }).click();
    await page.getByRole("button", { name: "Send to the kitchen" }).click();
    await expect(page).toHaveURL(/\/order\?t=/);
    const order = page.getByTestId("order").first();
    await expect(order).toHaveAttribute("data-status", /accepted|received/);
    statuses.push((await order.getAttribute("data-status")) ?? "");
    if (phone === 1) await expect(order.getByText("Someone at your table already ordered the same dishes. Your waiter will confirm.")).toBeVisible();
    await context.close();
  }
  expect(statuses).toEqual(["accepted", "received"]);
});
