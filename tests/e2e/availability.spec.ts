import { expect, test } from "./fixtures";
import { createFreshCafe } from "./helpers";
import { createTestCafe } from "./guest-menu-fixture";

// Availability controls (ADR-068): the owner pauses ordering and closes the
// kitchen from /admin, and an open guest menu notices within a few seconds
// without a reload. Needs migration 20261123120000_availability_controls on
// the dev project; until CI has applied it these tests skip.
const ZERO = "00000000-0000-0000-0000-000000000000";

async function migrated(rpc: () => PromiseLike<{ error: { code?: string } | null }>): Promise<boolean> {
  return (await rpc()).error?.code !== "PGRST202";
}

test("the owner pauses ordering and closes the kitchen from the admin home", async ({ page }) => {
  test.setTimeout(180_000);
  await createFreshCafe(page);
  await page.goto("/admin");
  const section = page.getByTestId("home-ordering");
  test.skip((await section.count()) === 0, "needs migration 20261123120000_availability_controls on the dev project");

  const pause = section.getByTestId("control-pause");
  await expect(pause).toContainText("Հյուրերը կարող են պատվիրել");
  await pause.getByRole("button", { name: "Կանգնեցված" }).click();
  await pause.getByRole("button", { name: "20 րոպե" }).click();
  await expect(pause.getByRole("status")).toContainText("Պատվերները կանգնեցված են մինչև");
  await page.reload();
  await expect(page.getByTestId("control-pause").getByRole("status")).toContainText("մինչև");
  await page.getByTestId("control-pause").getByRole("button", { name: "Ընդունվում են" }).click();
  await expect(page.getByTestId("control-pause").getByRole("status")).toContainText("Հյուրերը կարող են պատվիրել");

  // Without minutes it holds until resumed.
  await page.getByTestId("control-pause").getByRole("button", { name: "Կանգնեցված" }).click();
  await page.getByRole("button", { name: "Մինչև նորից միացնեմ" }).click();
  await expect(page.getByTestId("control-pause").getByRole("status")).toContainText("մինչև նորից միացնեք");
  await page.getByTestId("control-pause").getByRole("button", { name: "Ընդունվում են" }).click();

  const kitchen = page.getByTestId("control-kitchen");
  await kitchen.getByRole("button", { name: "Փակել այսօր" }).click();
  await kitchen.getByRole("button", { name: "Այո, փակել" }).click();
  await expect(kitchen.getByRole("status")).toContainText("Խոհանոցն այսօրվա համար փակ է");
  await kitchen.getByRole("button", { name: "Բացել խոհանոցը" }).click();
  await expect(kitchen.getByRole("status")).toContainText("Խոհանոցը պատվեր է ընդունում");
});

test.describe("an open guest menu follows the café's controls", () => {
  test("pause, resume and closing show up within seconds, without a reload", async ({ page }) => {
    test.setTimeout(180_000);
    const cafe = await createTestCafe();
    const api = cafe.owner.schema("api");
    test.skip(
      !(await migrated(() => api.rpc("set_ordering_pause", { p_location_id: ZERO, p_paused: false }))),
      "needs migration 20261123120000_availability_controls on the dev project",
    );
    await page.goto(`/en/m/${cafe.slug}/main?t=${cafe.tables["2"]!.token}`);
    await expect(page.getByRole("button", { name: /^Add / }).first()).toBeVisible();

    expect((await api.rpc("set_ordering_pause", { p_location_id: cafe.locationId, p_paused: true, p_minutes: 20 })).error).toBeNull();
    await expect(page.getByText(/Ordering is paused for a few minutes\. It resumes at/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /^Add / })).toHaveCount(0);

    expect((await api.rpc("set_ordering_pause", { p_location_id: cafe.locationId, p_paused: false })).error).toBeNull();
    await expect(page.getByRole("button", { name: /^Add / }).first()).toBeVisible({ timeout: 30_000 });

    expect((await api.rpc("set_kitchen_closed_today", { p_location_id: cafe.locationId, p_closed: true })).error).toBeNull();
    await expect(page.getByText("The kitchen is closed for today.")).toBeVisible({ timeout: 30_000 });
    expect((await api.rpc("set_kitchen_closed_today", { p_location_id: cafe.locationId, p_closed: false })).error).toBeNull();
    await expect(page.getByText("The kitchen is closed for today.")).toHaveCount(0, { timeout: 30_000 });
  });
});
