import { expect, test } from "./fixtures";
import { createTestCafe } from "./guest-menu-fixture";

// "Goes well with" on the guest menu (ADR-077 data, ADR-080 screen). Needs
// migration 20261123270000_recommendations on the dev project; until CI has
// applied it this test skips.
const ZERO = "00000000-0000-0000-0000-000000000000";

test("adding a dish shows owner-chosen ideas, one tap adds, no thanks hides, and it asks once", async ({ page }) => {
  test.setTimeout(180_000);
  const cafe = await createTestCafe();
  const api = cafe.owner.schema("api");
  const probe = await api.rpc("set_item_pairing" as never, { p_item_id: ZERO, p_suggest_item_id: ZERO, p_sort: 0 } as never);
  test.skip(probe.error?.code === "PGRST202", "needs migration 20261123270000_recommendations on the dev project");

  const tolma = cafe.items.tolma!;
  const borani = cafe.items.borani!;
  const syrniki = cafe.items.syrniki!;
  for (const [i, other] of [borani, syrniki].entries()) {
    const { error } = await api.rpc("set_item_pairing" as never, { p_item_id: tolma, p_suggest_item_id: other, p_sort: i } as never);
    expect(error).toBeNull();
  }

  const events: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/rpc/record_guest_events")) events.push(req.postData() ?? "");
  });
  await page.goto(`/en/m/${cafe.slug}/main?t=${encodeURIComponent(cafe.tables["1"]!.token)}`);
  const add = () =>
    page.getByTestId("dish").filter({ hasText: "Tolma" }).getByRole("button", { name: "Add Tolma" }).click();
  await add();

  const strip = page.getByTestId("suggestions");
  await expect(strip).toBeVisible();
  // One idea at a time, as one row above the cart bar.
  const cards = strip.getByTestId("suggestion");
  await expect(cards).toHaveCount(1);
  await expect(cards.first().getByTestId("suggestion-reason")).toHaveText("Goes well with Tolma");
  // 44 px targets
  for (const sel of ["suggestion-add", "suggestion-dismiss"]) {
    const box = await cards.first().getByTestId(sel).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(43.5);
    expect(box!.width).toBeGreaterThanOrEqual(43.5);
  }
  await page.screenshot({ path: test.info().outputPath("suggestions.png") });

  // One tap adds the dish to the cart (cart bar counts 2) and the next idea takes its place.
  await expect(cards.first()).toContainText("Բորանի");
  await cards.first().getByTestId("suggestion-add").click();
  await expect(page.getByRole("button", { name: /View order/ })).toContainText("2 items");
  await expect(cards).toHaveCount(1);
  await expect(strip).not.toContainText("Բորանի");

  // "No thanks" hides the other one and it does not come back.
  await cards.first().getByTestId("suggestion-dismiss").click();
  await expect(strip).toBeHidden();

  // The same dish again asks nothing new.
  await add();
  await page.waitForTimeout(1_000);
  await expect(page.getByTestId("suggestions")).toHaveCount(0);

  // Shown and accepted were tracked; the accepted add is marked.
  await expect.poll(() => events.join(""), { timeout: 15_000 }).toContain("suggestion_accepted");
  const sent = events.join("");
  expect(sent).toContain("suggestion_shown");
  expect(sent).toContain('"via":"suggest"');
});

test("an unusable answer shows nothing and ordering carries on", async ({ page }) => {
  test.setTimeout(120_000);
  const cafe = await createTestCafe();
  await page.route("**/rpc/public_suggestions", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "\"not what we expect\"" }));
  await page.goto(`/en/m/${cafe.slug}/main?t=${encodeURIComponent(cafe.tables["1"]!.token)}`);
  await page.getByTestId("dish").filter({ hasText: "Tolma" }).getByRole("button", { name: "Add Tolma" }).click();
  await expect(page.getByRole("button", { name: /View order/ })).toContainText("1 item");
  await page.waitForTimeout(1_000);
  await expect(page.getByTestId("suggestions")).toHaveCount(0);
});

for (const theme of ["wine", "soft"]) {
  test(`the strip fits a 390 px phone in the ${theme} theme`, async ({ page }) => {
    test.setTimeout(150_000);
    const cafe = await createTestCafe();
    const api = cafe.owner.schema("api");
    const probe = await api.rpc("set_item_pairing" as never, { p_item_id: "00000000-0000-0000-0000-000000000000", p_suggest_item_id: "00000000-0000-0000-0000-000000000000", p_sort: 0 } as never);
    test.skip(probe.error?.code === "PGRST202", "needs migration 20261123270000_recommendations on the dev project");
    for (const [i, other] of [cafe.items.borani!, cafe.items.syrniki!, cafe.items.coffee!].entries()) {
      await api.rpc("set_item_pairing" as never, { p_item_id: cafe.items.tolma!, p_suggest_item_id: other, p_sort: i } as never);
    }
    await api.rpc("set_guest_appearance" as never, { p_restaurant_id: cafe.restaurantId, p_theme: theme, p_brand_color: null, p_logo_path: null } as never);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/en/m/${cafe.slug}/main?t=${encodeURIComponent(cafe.tables["1"]!.token)}`);
    await page.getByTestId("dish").filter({ hasText: "Tolma" }).getByRole("button", { name: "Add Tolma" }).click();
    await expect(page.getByTestId("suggestions")).toBeVisible();
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.screenshot({ path: test.info().outputPath(`suggestions-390-${theme}.png`) });
    await page.screenshot({ path: `/tmp/claude-0/-home-user-Product/707986f3-f7bb-583a-bb93-27d05c735ec3/scratchpad/sugg-${theme}.png` });
  });
}
