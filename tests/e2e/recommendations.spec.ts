import { expect, test } from "./fixtures";
import { createTestCafe } from "./guest-menu-fixture";
import { signInAsRunOwner } from "./run-owner";

// "Goes well with" owner editor (ADR-077): kinds of dish with "Suggest kinds",
// hand-made pairings, and the table of what may be suggested after what.
// Needs migration 20261123270000_recommendations on the dev project; until CI
// has applied it this test skips.
const ZERO = "00000000-0000-0000-0000-000000000000";

test("the owner sets kinds, adds a pairing and changes the table", async ({ page }) => {
  test.setTimeout(180_000);
  const cafe = await createTestCafe();
  const { error } = await cafe.owner.schema("api").rpc("set_item_type" as never, { p_item_id: ZERO, p_type: null } as never);
  test.skip(error?.code === "PGRST202", "needs migration 20261123270000_recommendations on the dev project");

  await signInAsRunOwner(page.context(), cafe.restaurantId);
  await page.goto("/admin/menu/pairings");
  const types = page.getByTestId("rec-types");
  await expect(types).toBeVisible();

  // "Suggest kinds" proposes from the section names and saves nothing until applied.
  const coffeeType = page.getByTestId(`rec-type-${cafe.items.coffee}`);
  await expect(coffeeType).toHaveValue("");
  await page.getByTestId("rec-suggest").click();
  await expect(page.getByTestId("rec-proposals")).toBeVisible();
  await expect(coffeeType).toHaveValue("");
  await page.getByTestId("rec-apply").click();
  await expect(page.getByTestId("rec-proposals")).toHaveCount(0);
  await expect(coffeeType).toHaveValue("coffee_tea");
  await page.reload();
  await expect(page.getByTestId(`rec-type-${cafe.items.coffee}`)).toHaveValue("coffee_tea");

  // One dish by hand.
  const tolmaType = page.getByTestId(`rec-type-${cafe.items.tolma}`);
  await tolmaType.selectOption("main");
  await page.reload();
  await expect(page.getByTestId(`rec-type-${cafe.items.tolma}`)).toHaveValue("main");

  // A pairing: Tolma goes with the coffee.
  const pairings = page.getByTestId("rec-pairings");
  await pairings.getByTestId("rec-dish").selectOption(cafe.items.tolma!);
  await pairings.getByTestId("rec-add-" + cafe.items.coffee).click();
  await expect(pairings.getByTestId("rec-pairs").getByRole("listitem")).toHaveCount(1);
  await page.reload();
  await page.getByTestId("rec-dish").selectOption(cafe.items.tolma!);
  await expect(page.getByTestId("rec-pairs").getByRole("listitem")).toHaveCount(1);
  await page.getByTestId("rec-pairs").getByRole("button").click();
  await expect(page.getByTestId("rec-pairs")).toHaveCount(0);

  // The table: main -> sauce is on by default; switch it off, then reset.
  await page.getByTestId("rec-after-main").click();
  const cell = page.getByTestId("rec-cell-main-sauce");
  await expect(cell).toBeChecked();
  await expect(page.getByTestId("rec-reset")).toBeDisabled();
  await cell.uncheck();
  await expect(page.getByTestId("rec-reset")).toBeEnabled();
  await page.reload();
  await page.getByTestId("rec-after-main").click();
  await expect(page.getByTestId("rec-cell-main-sauce")).not.toBeChecked();
  await page.getByTestId("rec-reset").click();
  await expect(page.getByTestId("rec-cell-main-sauce")).toBeChecked();
  await expect(page.getByTestId("rec-reset")).toBeDisabled();

  await page.screenshot({ path: test.info().outputPath("pairings.png"), fullPage: true });
});
