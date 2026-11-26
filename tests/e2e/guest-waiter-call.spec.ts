import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import type { TestCafe } from "./guest-helpers";
import { createTestCafe } from "./guest-menu-fixture";

// "Never lose a request silently" for the waiter call: with no answer the guest
// sees "not sent", the request survives a reload, goes through by itself when
// the connection returns, and the database ends up with exactly one open call.
let cafe: TestCafe;
const SETUP_MS = 60_000;
// The cut connection is logged by the browser; that is the point of the test.
const dropCutNoise = (errors: string[]) =>
  errors.splice(
    0,
    errors.length,
    ...errors.filter((e) => !/ERR_INTERNET_DISCONNECTED|Failed to load chunk/.test(e)),
  );
const SENT_MS = 30_000; // the retry interval is 10 s, plus a slow dev database

test.describe("calling the waiter without a connection", () => {
  test.use({ locale: "hy-AM" });
  test.beforeEach(() => test.setTimeout(60_000)); // remote writes on the free dev database
  test.beforeAll(async () => {
    test.setTimeout(SETUP_MS);
    cafe = await createTestCafe(["1", "2"]);
  });

  const blockApi = (page: Page) =>
    page.route(/\/(rest|auth)\/v1\//, (route) => route.abort("internetdisconnected"));
  const unblockApi = (page: Page) => page.unroute(/\/(rest|auth)\/v1\//);
  const openCalls = async (tableId: string) => {
    const { data } = await cafe.owner
      .from("service_requests")
      .select("id")
      .eq("table_id", tableId)
      .eq("kind", "call_waiter")
      .neq("status", "resolved");
    return data ?? [];
  };

  async function pressCall(page: Page) {
    await page
      .locator('[data-testid="call-waiter-nav"], [data-testid="call-waiter-rail"]')
      .filter({ visible: true })
      .first()
      .click();
    // The Waiter item opens two choices; calling the waiter is the first.
    await page.getByTestId("call-waiter").getByRole("button", { name: "Կանչել մատուցողին" }).click();
  }

  test("kept across a reload, sent when the connection returns, one open request", async ({
    page,
    context,
    consoleErrors,
  }) => {
    const table = { id: cafe.tables["1"]!.id, token: cafe.tables["1"]!.token };
    await page.goto(`/t/${table.token}`);
    await expect(page).toHaveURL(/\/m\/.*\?t=/);
    await expect(page.getByTestId("dish").first()).toBeVisible();

    await page.waitForLoadState("networkidle"); // the sending code is fetched
    await context.setOffline(true);
    await blockApi(page);
    await pressCall(page);
    const unsent = page.getByTestId("call-unsent");
    await expect(unsent).toBeVisible();
    await expect(unsent).toHaveText(/Դեռ չի ուղարկվել/);
    await expect(page.getByText("Մատուցողը կանչված է")).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("not-sent.png") });

    // The page is back online (only the API stays unreachable), then reloaded.
    await context.setOffline(false);
    await page.reload();
    await expect(page.getByTestId("call-unsent")).toBeVisible();
    expect(await openCalls(table.id)).toHaveLength(0);

    await unblockApi(page);
    await expect(page.getByText("Մատուցողը կանչված է")).toBeVisible({ timeout: SENT_MS });
    await expect(page.getByTestId("call-unsent")).toHaveCount(0);
    expect(await openCalls(table.id)).toHaveLength(1);
    await page.reload();
    await expect(page.getByTestId("call-unsent")).toHaveCount(0);
    dropCutNoise(consoleErrors);
  });

  test("the Try again button sends it at once", async ({ page, consoleErrors }) => {
    const table = { id: cafe.tables["2"]!.id, token: cafe.tables["2"]!.token };
    await page.goto(`/t/${table.token}`);
    await expect(page).toHaveURL(/\/m\/.*\?t=/);
    await expect(page.getByTestId("dish").first()).toBeVisible();

    await page.waitForLoadState("networkidle");
    await blockApi(page);
    await pressCall(page);
    await expect(page.getByTestId("call-unsent")).toBeVisible();
    await unblockApi(page);
    await page.getByRole("button", { name: "Փորձել նորից" }).click();
    await expect(page.getByText("Մատուցողը կանչված է")).toBeVisible({ timeout: SENT_MS });
    expect(await openCalls(table.id)).toHaveLength(1);
    dropCutNoise(consoleErrors);
  });
});
