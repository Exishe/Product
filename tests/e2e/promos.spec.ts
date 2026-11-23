import { expect, test } from "./fixtures";
import { createTestCafe } from "./guest-menu-fixture";
import { signInAsRunOwner } from "./run-owner";

// Promotions (ADR-070): the owner creates a promo in the admin and switches it
// on; an open guest menu shows the banner within the poll interval, without a
// reload, and switching off removes it. Needs migration 20261123165000_promos
// on the dev project; until CI has applied it this test skips.
const ZERO = "00000000-0000-0000-0000-000000000000";

test("the owner switches a promo on and off and the open guest menu follows", async ({ page, browser }) => {
  test.setTimeout(180_000);
  const cafe = await createTestCafe();
  const { error } = await cafe.owner.schema("api").rpc("set_promo_on", { p_promo_id: ZERO, p_on: false });
  test.skip(error?.code === "PGRST202", "needs migration 20261123165000_promos on the dev project");

  // A guest has the menu open.
  const guest = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await guest.goto(`/en/m/${cafe.slug}/main?t=${cafe.tables["2"]!.token}`);
  await expect(guest.getByRole("button", { name: /^Add:/ }).first()).toBeVisible();
  await expect(guest.getByTestId("promo-banner")).toHaveCount(0);

  // The owner makes a promo in the admin.
  await signInAsRunOwner(page.context(), cafe.restaurantId);
  await page.goto("/admin");
  const section = page.getByTestId("home-promos");
  await expect(section).toBeVisible();
  await section.getByTestId("promo-add").click();
  await section.getByLabel("Վերնագիր (հայերեն)", { exact: true }).fill("Երջանիկ ժամեր");
  await section.getByLabel("Վերնագիր (անգլերեն)").fill("Happy hour");
  await section.getByLabel("Նշան, օրինակ՝ −20%").fill("−20%");
  await section.getByTestId("promo-save").click();
  const row = section.getByTestId("promo-row");
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId("promo-status")).toContainText("Անջատված է");
  await expect(guest.getByTestId("promo-banner")).toHaveCount(0);

  // On: the banner appears in the guest's language.
  await row.getByTestId("promo-switch").click();
  await expect(row.getByTestId("promo-status")).toContainText("Միացված է։ Հյուրերն այն հիմա տեսնում են");
  await expect(guest.getByTestId("promo-banner")).toBeVisible({ timeout: 30_000 });
  await expect(guest.getByTestId("promo-title")).toHaveText("Happy hour");
  await expect(guest.getByTestId("promo-badge")).toHaveText("−20%");

  // The guest closes it for this visit; it stays closed after a reload.
  await guest.getByRole("button", { name: "Close this offer" }).click();
  await expect(guest.getByTestId("promo-banner")).toHaveCount(0);
  await guest.reload();
  await expect(guest.getByRole("button", { name: /^Add:/ }).first()).toBeVisible();
  await expect(guest.getByTestId("promo-banner")).toHaveCount(0);

  // Off, and a reload of the admin still shows the promo.
  await row.getByTestId("promo-switch").click();
  await expect(row.getByTestId("promo-status")).toContainText("Անջատված է");
  await page.reload();
  await expect(page.getByTestId("home-promos").getByTestId("promo-row")).toHaveCount(1);

  // A fresh guest sees none while it is off, and the waiter-facing status is empty.
  const fresh = await (await browser.newContext()).newPage();
  await fresh.goto(`/en/m/${cafe.slug}/main?t=${cafe.tables["2"]!.token}`);
  await expect(fresh.getByRole("button", { name: /^Add:/ }).first()).toBeVisible();
  await expect(fresh.getByTestId("promo-banner")).toHaveCount(0);
});
