import type { Page } from "@playwright/test";
import { expect, test as base } from "./fixtures";
import type { TestCafe } from "./guest-helpers";
import { ownerEmail, ownerPassword } from "./helpers";
import {
  createWaiterCafe,
  guestOrder,
  guestRequest,
  hasBillPreference,
  hasFunction,
  kitchenReady,
  kitchenServe,
  orderStatus,
  pairWaiterDevice,
  panel,
  SCREENSHOTS,
  seatGuest,
  tableButton,
  tickets,
  type WaiterDevice,
} from "./waiter-helpers";

// Waiter app, milestone 7 (plan.md Tasks 7.1–7.3). Each worker makes its own
// café and pairs one waiter tablet; the tests' `page` is that tablet. Guests
// order through the same api functions as the guest pages.

type Migrations = { calls: boolean; guard: boolean; billPreference: boolean };

const test = base.extend<object, { cafe: TestCafe; device: WaiterDevice; migrations: Migrations }>({
  cafe: [async ({}, provide) => provide(await createWaiterCafe()), { scope: "worker" }],
  device: [
    async ({ browser, cafe }, provide, info) => provide(await pairWaiterDevice(browser, cafe, info.project.use.baseURL)),
    { scope: "worker" },
  ],
  migrations: [
    async ({ cafe }, provide) =>
      provide({
        calls: (await hasFunction(cafe.owner, "guest_service_request")) && (await hasFunction(cafe.owner, "resolve_service_request")),
        guard: await hasFunction(cafe.owner, "seat_waiting_guests"),
        billPreference: await hasBillPreference(cafe.owner),
      }),
    { scope: "worker" },
  ],
  storageState: async ({ device }, provide) => provide(device.storageState),
});

const OFFLINE_NOISE = /ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|WebSocket connection to .* failed|Failed to fetch/;

const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `${SCREENSHOTS}/${project}-${name}.png`, fullPage: false });

async function openTable(page: Page, label: string) {
  await tableButton(page, label).click();
  await expect(panel(page).getByRole("heading", { name: `Սեղան ${label}`, exact: true })).toBeVisible();
}

test.describe("waiter app", () => {
  test.skip(!ownerEmail || !ownerPassword, "needs .env.local for the dev project");
  test.skip(({ isMobile }) => isMobile, "the waiter app is for tablets and larger");

  test("7.1 table states follow real orders", async ({ page, cafe }, info) => {
    await page.goto("/waiter");
    await expect(page.locator("html")).toHaveAttribute("lang", "hy");
    await expect(tableButton(page, "1")).toHaveAttribute("data-state", "free");
    await expect(tableButton(page, "1")).toHaveAccessibleName("Սեղան 1 Ազատ");

    // Seated: a guest scanned the sticker.
    const guest = await seatGuest(cafe, "1");
    await expect(tableButton(page, "1")).toHaveAttribute("data-state", "busy");

    // A small order goes straight to the kitchen: still busy, the panel shows it.
    const small = await guestOrder(cafe, guest, [{ dish: "coffee", quantity: 1 }]);
    await openTable(page, "1");
    await expect(panel(page).locator(`[data-order-id="${small}"]`)).toContainText("Խոհանոցում նոր է");

    // A large one waits for the waiter: «Նոր պատվեր», and closing is blocked.
    const large = await guestOrder(cafe, guest, [{ dish: "tolma", quantity: 2 }]);
    await expect(tableButton(page, "1")).toHaveAttribute("data-state", "new");
    await expect(page.getByTestId("need")).toHaveText("Սպասում են՝ 1 սեղան");
    await expect(panel(page).getByText("Նախ ընդունեք կամ մերժեք նոր պատվերը։")).toBeVisible();
    await expect(panel(page).getByRole("button", { name: "Փակել սեղանը" })).toBeDisabled();
    await shot(page, "71-new-order", info.project.name);

    // Accepted, then ready in the kitchen: «Պատրաստ է» in tarragon.
    await panel(page).locator(`[data-order-id="${large}"]`).getByRole("button", { name: "Ընդունել" }).click();
    await expect(tableButton(page, "1")).toHaveAttribute("data-state", "busy");
    await kitchenReady(cafe, small);
    await expect(tableButton(page, "1")).toHaveAttribute("data-state", "ready");
    await expect(tableButton(page, "1")).toHaveCSS("background-color", "rgb(29, 106, 67)");
    await shot(page, "71-ready", info.project.name);
  });

  test("7.1 a call turns the table red and one tap resolves it", async ({ page, cafe, migrations }, info) => {
    test.skip(!migrations.calls, "needs migrations 20261109190300_guest_service_requests and 20261109204500_waiter_app on the dev project");
    const guest = await seatGuest(cafe, "2");
    await guestOrder(cafe, guest, [{ dish: "coffee", quantity: 1 }]);
    await page.goto("/waiter");
    await expect(tableButton(page, "2")).toHaveAttribute("data-state", "busy");

    const call = await guestRequest(guest, "call_waiter");
    await expect(tableButton(page, "2")).toHaveAttribute("data-state", "call");
    await expect(tableButton(page, "2")).toHaveCSS("border-color", "rgb(176, 33, 58)");
    await openTable(page, "2");
    await shot(page, "71-call", info.project.name);
    await panel(page).getByRole("button", { name: "Գնում եմ" }).click();
    await expect(tableButton(page, "2")).toHaveAttribute("data-state", "busy");
    await expect
      .poll(async () => (await cafe.owner.from("service_requests").select("status").eq("id", call).single()).data?.status)
      .toBe("resolved");

    // Asking for the bill: «Հաշիվ» in ink.
    await guestRequest(guest, "bring_bill");
    await expect(tableButton(page, "2")).toHaveAttribute("data-state", "bill");
    await expect(panel(page).getByText("Հաշիվ են խնդրում")).toBeVisible();
  });

  test("7.1 a bill asked for by card shows «Հաշիվ՝ քարտով» and the settle sheet preselects the guest's choice", async ({ page, cafe, migrations }, info) => {
    test.skip(!migrations.calls || !migrations.billPreference, "needs migration 20261110120000_bill_payment_preference on the dev project");
    const guest = await seatGuest(cafe, "4");
    await guestOrder(cafe, guest, [{ dish: "coffee", quantity: 1 }]);
    await page.goto("/waiter");
    await guestRequest(guest, "bring_bill", "card");
    await expect(tableButton(page, "4")).toHaveAttribute("data-state", "bill");
    await expect(tableButton(page, "4")).toContainText("Հաշիվ՝ քարտով");
    await openTable(page, "4");
    await expect(panel(page).getByTestId("bill-alert")).toHaveText("Հաշիվ՝ քարտով");

    // The guest changes their mind: the same request now says cash.
    await guestRequest(guest, "bring_bill", "cash");
    await expect(panel(page).getByTestId("bill-alert")).toHaveText("Հաշիվ՝ կանխիկ");

    await panel(page).getByRole("button", { name: "Փակել սեղանը" }).click();
    const sheet = page.getByRole("dialog", { name: "Սեղան 4" });
    await expect(sheet.getByRole("button", { name: "Կանխիկ" })).toHaveAttribute("aria-pressed", "true");
    await sheet.getByRole("button", { name: "Քարտով" }).click();
    await expect(sheet.getByRole("button", { name: "Քարտով" })).toHaveAttribute("aria-pressed", "true");
    await shot(page, "71-bill-preference", info.project.name);
  });

  test("7.2 a large QR order waits for acceptance and reaches the kitchen after «Ընդունել»", async ({ page, cafe }, info) => {
    const guest = await seatGuest(cafe, "3");
    const order = await guestOrder(cafe, guest, [{ dish: "khashlama", quantity: 2 }]);
    expect((await orderStatus(cafe, order))?.status).toBe("placed");
    expect(await tickets(cafe, order)).toHaveLength(0);

    await page.goto("/waiter");
    await openTable(page, "3");
    const card = panel(page).locator(`[data-order-id="${order}"]`);
    await expect(card).toContainText("Սպասում է հաստատման");
    // A long Armenian name wraps inside the panel, no horizontal scroll.
    const overflow = await panel(page).evaluate((el) => el.scrollWidth - el.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await shot(page, "72-pending", info.project.name);

    await card.getByRole("button", { name: "Ընդունել" }).click();
    await expect(page.getByTestId("toast").first()).toContainText("ուղարկվեց խոհանոց");
    await expect.poll(async () => (await tickets(cafe, order)).length).toBe(1);
    await expect(card).toContainText("Խոհանոցում նոր է");

    // Ready in the kitchen → «Մատուցված է» on the waiter's card.
    await kitchenReady(cafe, order);
    await card.getByRole("button", { name: "Մատուցված է" }).click();
    await expect.poll(async () => (await orderStatus(cafe, order))?.kitchen_status).toBe("served");

    // Cancelling a served line asks for a manager.
    await card.getByRole("button", { name: /^Չեղարկել՝/ }).click();
    const sheet = page.getByRole("dialog", { name: "Չեղարկել ուտեստը" });
    await expect(sheet.getByRole("alert")).toHaveText("Մատուցված ուտեստը կարող է չեղարկել միայն մենեջերը։ Կանչեք մենեջերին։");
    await expect(sheet.getByRole("button", { name: "Չեղարկել", exact: true })).toHaveCount(0);
    await shot(page, "72-manager-only", info.project.name);
    await sheet.getByRole("button", { name: "Հետ" }).click();
  });

  test("7.2 the order pad sends a waiter order, with options, through the outbox", async ({ page, cafe }, info) => {
    await page.goto("/waiter");
    await openTable(page, "4");
    await panel(page).getByRole("button", { name: "Ընդունել պատվեր" }).click();
    const pad = page.getByRole("dialog", { name: "Նոր պատվեր՝ սեղան 4" });
    await pad.getByRole("button", { name: "Ավելացնել՝ Տոլմա" }).click();
    await pad.getByRole("button", { name: "Ավելացնել քանակը՝ Տոլմա" }).click();
    await pad.getByRole("searchbox", { name: "Որոնել ճաշացանկում" }).fill("tey");
    await pad.getByRole("button", { name: "Ավելացնել՝ Թեյ" }).click();
    await pad.getByRole("button", { name: /Կանաչ/ }).click();
    await pad.getByRole("button", { name: "Ավելացնել", exact: true }).click();
    await expect(pad.getByTestId("pad-cart")).toContainText("Կանաչ");
    await shot(page, "72-pad", info.project.name);
    await pad.getByRole("button", { name: "Ուղարկել խոհանոց" }).click();
    await expect(pad).toBeHidden();

    await expect(tableButton(page, "4")).toHaveAttribute("data-state", "busy");
    await expect(panel(page).getByTestId("table-total")).toHaveText("7 100 ֏");
    const placed = async () =>
      (await cafe.owner.from("orders").select("id, source, status, total").eq("table_id", cafe.tables["4"]?.id ?? "").maybeSingle()).data;
    await expect.poll(placed).toMatchObject({ source: "waiter", status: "accepted", total: 7100 });
    expect(await tickets(cafe, (await placed())?.id ?? "")).toHaveLength(1);
    await expect(panel(page).getByTestId("unsent")).toHaveCount(0);
    await expect(panel(page).getByTestId("order").first()).toContainText("Պատվեր ");
  });

  test("7.3 full loop: ordered, accepted, ready, served, settled by card, table free, the old guest can't order", async ({ page, cafe }, info) => {
    const guest = await seatGuest(cafe, "5");
    const order = await guestOrder(cafe, guest, [
      { dish: "tolma", quantity: 1 },
      { dish: "khashlama", quantity: 1 },
    ]);
    await page.goto("/waiter");
    await openTable(page, "5");
    await panel(page).getByRole("button", { name: "Ընդունել" }).click();
    await expect.poll(async () => (await tickets(cafe, order)).length).toBe(1);
    await kitchenReady(cafe, order);
    await expect(tableButton(page, "5")).toHaveAttribute("data-state", "ready");
    await panel(page).getByRole("button", { name: "Մատուցված է" }).click();
    await expect(tableButton(page, "5")).toHaveAttribute("data-state", "busy");
    await expect(panel(page).getByTestId("table-total")).toHaveText("7 700 ֏");

    await panel(page).getByRole("button", { name: "Փակել սեղանը" }).click();
    const sheet = page.getByRole("dialog", { name: "Սեղան 5" });
    // Split must add up exactly.
    await sheet.getByRole("button", { name: "Երկուսով" }).click();
    await sheet.getByLabel("Կանխիկ").fill("5000");
    await sheet.getByLabel("Քարտով").fill("2800");
    await expect(sheet.getByTestId("mismatch")).toHaveText("Գումարը պետք է լինի 7 700 ֏, հիմա՝ 7 800 ֏");
    await expect(sheet.getByRole("button", { name: "Հաստատել վճարումը" })).toBeDisabled();
    await shot(page, "73-mismatch", info.project.name);
    await sheet.getByRole("button", { name: "Քարտով" }).click();
    await sheet.getByRole("button", { name: "Հաստատել վճարումը" }).click();
    await expect(page.getByTestId("toast").first()).toContainText("Սեղան 5՝ փակված է։");

    await expect(tableButton(page, "5")).toHaveAttribute("data-state", "free");
    expect((await orderStatus(cafe, order))?.paid_at).not.toBeNull();
    const { data: payments } = await cafe.owner.from("payments").select("method, amount").eq("location_id", cafe.locationId).eq("amount", 7700);
    expect(payments).toEqual([{ method: "card_terminal", amount: 7700 }]);
    await expect(guestOrder(cafe, guest, [{ dish: "coffee", quantity: 1 }])).rejects.toThrow(/guest_session_invalid/);
    await shot(page, "73-free", info.project.name);
  });

  test("7.3 a new guest at a table that looks finished makes the waiter close the old bill first", async ({ page, cafe, migrations }, info) => {
    test.skip(!migrations.guard || !migrations.calls, "needs migration 20261109204500_waiter_app (and 20261109190300) on the dev project");
    const first = await seatGuest(cafe, "6");
    const old = await guestOrder(cafe, first, [{ dish: "tolma", quantity: 1 }]);
    await kitchenServe(cafe, old);
    await guestRequest(first, "bring_bill");

    const next = await seatGuest(cafe, "6");
    const fresh = await guestOrder(cafe, next, [{ dish: "coffee", quantity: 1 }]);
    expect(await tickets(cafe, fresh)).toHaveLength(0);

    await page.goto("/waiter");
    await expect(tableButton(page, "6")).toHaveAttribute("data-state", "new");
    await openTable(page, "6");
    const party = panel(page).getByTestId("waiting-party");
    await expect(party).toContainText("Սեղան 6․ նոր հյուրե՞ր");
    await expect(party.getByRole("button", { name: "Ընդունել" })).toBeDisabled();
    await shot(page, "73-new-guests", info.project.name);

    await party.getByRole("button", { name: "Փակել հին հաշիվը" }).click();
    const sheet = page.getByRole("dialog", { name: "Սեղան 6" });
    await expect(sheet.getByText("Հին հաշիվը")).toBeVisible();
    await sheet.getByRole("button", { name: "Կանխիկ" }).click();
    await sheet.getByRole("button", { name: "Հաստատել վճարումը" }).click();

    // The new party now has the table; their coffee waits for «Ընդունել».
    await expect(panel(page).getByTestId("waiting-party")).toHaveCount(0);
    await panel(page).locator(`[data-order-id="${fresh}"]`).getByRole("button", { name: "Ընդունել" }).click();
    await expect.poll(async () => (await tickets(cafe, fresh)).length).toBe(1);
  });

  test("offline: taps queue, closing waits for the connection, the queue replays", async ({ page, cafe, context, consoleErrors }, info) => {
    const guest = await seatGuest(cafe, "7");
    const order = await guestOrder(cafe, guest, [{ dish: "tolma", quantity: 2 }]);
    await page.goto("/waiter");
    await openTable(page, "7");
    await context.setOffline(true);
    await panel(page).getByRole("button", { name: "Ընդունել" }).click();
    await expect(panel(page).getByTestId("unsent")).toBeVisible();
    await expect(page.getByTestId("connection")).toContainText(/Միանում է|Կապ չկա/);
    expect((await orderStatus(cafe, order))?.status).toBe("placed");
    await shot(page, "offline-queued", info.project.name);
    await context.setOffline(false);
    await expect.poll(async () => (await orderStatus(cafe, order))?.status, { timeout: 15_000 }).toBe("accepted");
    await expect(panel(page).getByTestId("unsent")).toHaveCount(0);
    consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !OFFLINE_NOISE.test(e)));
  });

  test("two devices on one order: the loser sees «Արդեն փոխվել է» and the truth (Review focus 4)", async ({ page, cafe, context, consoleErrors }) => {
    const guest = await seatGuest(cafe, "8");
    const order = await guestOrder(cafe, guest, [{ dish: "tolma", quantity: 2 }]);
    await page.goto("/waiter");
    await openTable(page, "8");
    await context.setOffline(true);
    await panel(page).getByRole("button", { name: "Ընդունել" }).click();
    // Meanwhile the owner rejects it from another device.
    const { error } = await cafe.owner.schema("api").rpc("reject_order", { p_order_id: order, p_reason: "test" });
    expect(error).toBeNull();
    await context.setOffline(false);
    await expect(page.getByTestId("toast").filter({ hasText: "Արդեն փոխվել է" })).toBeVisible({ timeout: 15_000 });
    await expect(panel(page).locator(`[data-order-id="${order}"]`)).toHaveAttribute("data-status", "rejected");
    expect((await orderStatus(cafe, order))?.status).toBe("rejected");
    // The refused replay logs a 400 on purpose.
    consoleErrors.splice(0, consoleErrors.length, ...consoleErrors.filter((e) => !/400/.test(e) && !OFFLINE_NOISE.test(e)));
  });
});
