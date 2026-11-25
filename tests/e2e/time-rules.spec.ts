import { expect as baseExpect, test } from "./fixtures";
import { createTestCafe } from "./guest-menu-fixture";
import { signInAsRunOwner } from "./run-owner";
import type { Page } from "@playwright/test";

// Two owner screens for rules that already live in the database:
//  - a section's opening hours in the menu editor (ADR-068, api.set_category_window);
//  - "By time of day" on the "Goes well with" page (ADR-077, api.save_time_rule).
// Needs migrations 20261123120000_availability_controls and
// 20261123270000_recommendations on the dev project; until CI has applied them
// this test skips. Desktop only; the last part switches to a phone-sized window
// and keeps screenshots of both sizes in test-results.
const ZERO = "00000000-0000-0000-0000-000000000000";
// The dev database answers slowly while CI uses it; each wait gets longer than the default 5 s.
const expect = baseExpect.configure({ timeout: 20_000 });

type Probe = PromiseLike<{ error: { code?: string } | null }>;
const missing = async (call: Probe) => (await call).error?.code === "PGRST202";

// The page answers "not ready, try again" when the busy dev database times out a read
// (the owner sees the same notice); give it a few more tries before judging the screen.
async function openPairings(page: Page): Promise<void> {
  for (let attempt = 1; attempt <= 4; attempt++) {
    await page.goto("/admin/menu/pairings");
    if ((await page.getByTestId("rec-time").count()) > 0) return;
    await page.waitForTimeout(5_000 * attempt);
  }
}

test("the owner sets a section's hours and a rule by time of day, and finds both after a reload", async ({
  page,
}) => {
  test.skip(test.info().project.name !== "desktop", "desktop only");
  test.setTimeout(300_000);
  const cafe = await createTestCafe();
  const api = cafe.owner.schema("api");
  test.skip(
    await missing(
      api.rpc("set_category_window", { p_category_id: ZERO, p_from: null, p_to: null } as never) as unknown as Probe,
    ),
    "needs migration 20261123120000_availability_controls on the dev project",
  );
  test.skip(
    await missing(
      api.rpc("save_time_rule" as never, {
        p_location_id: ZERO,
        p_id: null,
        p_from: "08:00",
        p_to: "09:00",
        p_weekdays: null,
        p_to_type: "coffee_tea",
        p_to_item_id: null,
        p_sort: 0,
      } as never) as unknown as Probe,
    ),
    "needs migration 20261123270000_recommendations on the dev project",
  );
  await signInAsRunOwner(page.context(), cafe.restaurantId);
  const shots = (name: string) => ({ path: test.info().outputPath(name) });

  // 1. A section's hours: the first section of the café, only from 06:30 to 10:45.
  await page.goto("/admin/menu");
  await page.getByRole("button", { name: "Խմբագրել բաժինը" }).click();
  await page.getByLabel("Ցույց տալ միայն որոշ ժամերի").check();
  await page.getByLabel("Սկսած", { exact: true }).fill("06:30");
  await page.getByLabel("Մինչև", { exact: true }).fill("10:45");
  await page.screenshot(shots("menu-hours-desktop.png"));
  await page.getByRole("button", { name: "Պահել", exact: true }).click();
  await expect(page.getByTestId("category-window")).toContainText("06:30–10:45");
  await page.reload();
  await expect(page.getByTestId("category-window")).toContainText("06:30–10:45");

  // 2. Rules by time of day. A kind of dish, weekdays Monday to Friday, order 2.
  await openPairings(page);
  const section = page.getByTestId("rec-time");
  await expect(section).toBeVisible();
  await expect(section.getByTestId("time-rule")).toHaveCount(0);
  await section.getByTestId("time-rule-add").click();
  const form = section.getByTestId("time-rule-form");
  await form.getByTestId("time-rule-from").fill("07:00");
  await form.getByTestId("time-rule-to").fill("11:00");
  for (const d of [1, 2, 3, 4, 5]) await form.getByTestId(`time-rule-day-${d}`).check();
  await form.getByTestId("time-rule-kind").selectOption("coffee_tea");
  await form.getByTestId("time-rule-order").fill("2");
  await form.getByTestId("time-rule-save").click();
  await expect(section.getByTestId("time-rule")).toHaveCount(1);
  await expect(form).toHaveCount(0);

  // Nothing chosen yet: a plain message, nothing saved.
  await section.getByTestId("time-rule-add").click();
  await section.getByTestId("time-rule-save").click();
  await expect(section.getByTestId("time-rule-error")).toBeVisible();
  await expect(section.getByTestId("time-rule")).toHaveCount(1);

  // One dish, every day, a window past midnight.
  await form.getByTestId("time-rule-from").fill("22:00");
  await form.getByTestId("time-rule-to").fill("02:00");
  await form.getByTestId("time-rule-target-dish").check();
  await form.getByTestId("time-rule-dish").selectOption(cafe.items.tolma!);
  await expect(form).toContainText("կեսգիշերից անց");
  await form.getByTestId("time-rule-save").click();
  await expect(section.getByTestId("time-rule")).toHaveCount(2);
  await expect(section.getByTestId("time-rule-error")).toHaveCount(0);
  await section.screenshot(shots("time-rules-desktop.png"));

  // Both are there after a reload, in the order of their numbers.
  await openPairings(page);
  const rows = page.getByTestId("rec-time").getByTestId("time-rule");
  await expect(rows).toHaveCount(2);
  const night = rows.filter({ hasText: "22:00–02:00" });
  const morning = rows.filter({ hasText: "07:00–11:00" });
  await expect(night).toContainText("Տոլմա");
  await expect(night).toContainText("Ամեն օր");
  await expect(night).toContainText("կեսգիշերից անց");
  await expect(morning).toContainText("Սուրճ և թեյ");
  await expect(morning).toContainText("երկ–ուր");
  await expect(rows.first()).toContainText("22:00–02:00");

  // Edit the morning rule: until 12:00, no Friday.
  await morning.getByTestId("time-rule-edit").click();
  const editForm = page.getByTestId("time-rule-form");
  await expect(editForm.getByTestId("time-rule-day-1")).toBeChecked();
  await expect(editForm.getByTestId("time-rule-day-6")).not.toBeChecked();
  await editForm.getByTestId("time-rule-to").fill("12:00");
  await editForm.getByTestId("time-rule-day-5").uncheck();
  await editForm.getByTestId("time-rule-save").click();
  await expect(page.getByTestId("time-rule-form")).toHaveCount(0);
  const edited = rows.filter({ hasText: "07:00–12:00" });
  await expect(edited).toContainText("երկ–հնգ");
  await expect(rows).toHaveCount(2);

  // Delete the night rule.
  await rows.filter({ hasText: "22:00–02:00" }).getByTestId("time-rule-remove").click();
  await rows.filter({ hasText: "22:00–02:00" }).getByTestId("time-rule-remove-yes").click();
  await expect(rows).toHaveCount(1);
  await openPairings(page);
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("07:00–12:00");

  // The database holds what the page showed: ISO weekdays, the order, the kind.
  const stored = await (
    cafe.owner as unknown as {
      from(table: string): {
        select(columns: string): {
          eq(column: string, value: string): PromiseLike<{ data: unknown; error: unknown }>;
        };
      };
    }
  )
    .from("suggestion_time_rules")
    .select("from_time, to_time, weekdays, to_type, to_item_id, sort")
    .eq("location_id", cafe.locationId);
  expect(stored.error).toBeNull();
  expect(stored.data).toEqual([
    { from_time: "07:00:00", to_time: "12:00:00", weekdays: [1, 2, 3, 4], to_type: "coffee_tea", to_item_id: null, sort: 2 },
  ]);

  // 3. A phone-sized window: the same screens, then clear the section's hours ("all day").
  await page.setViewportSize({ width: 390, height: 844 });
  await openPairings(page);
  await page.getByTestId("rec-time").scrollIntoViewIfNeeded();
  await page.getByTestId("time-rule-add").click();
  await expect(page.getByTestId("time-rule-form")).toBeVisible();
  await page.getByTestId("time-rule-save").click();
  await expect(page.getByTestId("time-rule-error")).toBeVisible();
  await page.getByTestId("rec-time").screenshot(shots("time-rules-phone.png"));
  const noSideScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect.soft(noSideScroll, "no sideways scroll at 390 px").toBe(true);

  await page.goto("/admin/menu");
  await expect(page.getByTestId("category-window")).toContainText("06:30–10:45");
  await page.getByRole("button", { name: "Խմբագրել բաժինը" }).click();
  const toggle = page.getByLabel("Ցույց տալ միայն որոշ ժամերի");
  await expect(toggle).toBeChecked();
  await toggle.scrollIntoViewIfNeeded();
  await page.screenshot(shots("menu-hours-phone.png"));
  await toggle.uncheck();
  await page.getByRole("button", { name: "Պահել", exact: true }).click();
  await expect(page.getByTestId("category-window")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("category-window")).toHaveCount(0);
});
