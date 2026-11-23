import { expect, test } from "./fixtures";
import { createCafeWithMenu } from "./guest-helpers";
import { signInAsRunOwner } from "./run-owner";

// An owner hides a dish in the admin; after the next publish it is gone from
// the guest menu (the guest menu reads the published snapshot only).
test("a dish hidden in the admin and published disappears from the guest menu", async ({ page }) => {
  const cafe = await createCafeWithMenu({
    categories: [{ key: "hot", names: { hy: "Տաք ուտեստներ", ru: "Горячие блюда", en: "Hot dishes" } }],
    dishes: [
      { key: "tolma", category: "hot", names: { hy: "Տոլմա", ru: "Толма", en: "Tolma" }, price: 3200 },
      { key: "borani", category: "hot", names: { hy: "Բորանի", ru: "Борани", en: "Borani" }, price: 2600 },
    ],
  });
  await signInAsRunOwner(page.context(), cafe.restaurantId);

  await page.goto("/admin/menu");
  const row = page.getByRole("listitem").filter({ hasText: "Բորանի" });
  await row.getByRole("button", { name: "Ցուցադրվում է" }).click();
  await expect(row.getByRole("button", { name: "Թաքցված է" })).toBeVisible();
  await page.getByRole("button", { name: "Հրապարակել" }).click();
  await expect(page.getByText("Հրապարակված է։")).toBeVisible();

  await page.goto(`/hy/m/${cafe.slug}/main?t=${cafe.tables["1"]!.token}`);
  await expect(page.getByTestId("dish").filter({ hasText: "Տոլմա" })).toBeVisible();
  await expect(page.getByTestId("dish").filter({ hasText: "Բորանի" })).toHaveCount(0);
});

// A dish with only an Armenian name: the guest sees that name in every language.
test("a dish named only in Armenian shows that name in ru and en", async ({ page }) => {
  const cafe = await createCafeWithMenu({
    categories: [{ key: "hot", names: { hy: "Տաք ուտեստներ", ru: "Горячие блюда", en: "Hot dishes" } }],
    dishes: [{ key: "khash", category: "hot", names: { hy: "Խաշ" }, price: 4100 }],
  });

  for (const locale of ["hy", "ru", "en"] as const) {
    await page.goto(`/${locale}/m/${cafe.slug}/main?t=${cafe.tables["1"]!.token}`);
    await expect(page.getByTestId("dish").filter({ hasText: "Խաշ" })).toBeVisible();
  }
});
