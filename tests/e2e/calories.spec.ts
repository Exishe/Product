import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { createCafeWithMenu } from "./guest-helpers";
import { createFreshCafe } from "./helpers";

// Approximate calories and the guest's "show only" chips (ADR-082). Needs
// migration 20261123320000_calories_tags on the dev project: it reaches the
// project only when CI applies it after the push, so until then both tests
// skip (the same pattern as guest-substitutes.spec.ts). Desktop only.
test.describe("calories and filters", () => {
  test.skip(({ isMobile }) => isMobile, "one desktop run covers the flow");

  test("the owner's ingredients become '≈ N kcal' in the dish sheet after Publish, and the chips narrow the list", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const cafe = await createCafeWithMenu({
      categories: [{ key: "hot", names: { hy: "Տաք ուտեստներ", en: "Hot dishes" } }],
      dishes: [
        { key: "plov", category: "hot", names: { hy: "Փլավ", en: "Plov" }, price: 2500, tags: ["vegetarian", "chefs_pick"] },
        { key: "kebab", category: "hot", names: { hy: "Քյաբաբ", en: "Kebab" }, price: 3500, tags: ["spicy"], allergens: ["nuts"] },
        { key: "soup", category: "hot", names: { hy: "Ապուր", en: "Soup" }, price: 1800, tags: ["vegan", "new"] },
        { key: "mystery", category: "hot", names: { hy: "Գաղտնի", en: "Mystery" }, price: 2000 },
      ],
      tables: ["1"],
    });
    const api = cafe.owner.schema("api");
    const ingredient = (hy: string, unit: string, kcal: number | null) =>
      api.rpc("save_ingredient", {
        p_restaurant_id: cafe.restaurantId,
        p_ingredient_id: null as unknown as string,
        p_names: { hy },
        p_unit: unit,
        p_kcal_per_100g: kcal as number,
      });
    const rice = await ingredient("Բրինձ", "g", 365);
    const probe = await api.rpc("set_ingredient_kcal", {
      p_ingredient_id: rice.data as string,
      p_kcal_per_100g: 365,
    });
    test.skip(probe.error?.code === "PGRST202", "needs migration 20261123320000_calories_tags on the dev project (CI applies it after the push)");
    expect(rice.error).toBeNull();
    expect(probe.error).toBeNull();
    const oil = await ingredient("Յուղ", "ml", 884);
    const egg = await ingredient("Ձու", "pcs", 143);
    const gum = await ingredient("Խեժ", "g", null);
    expect((await api.rpc("set_ingredient_kcal", { p_ingredient_id: egg.data as string, p_kcal_per_100g: 143, p_grams_per_piece: 55 })).error).toBeNull();
    const line = (item: string, ing: string, quantity: number) =>
      api.rpc("set_item_ingredient", { p_item_id: cafe.items[item]!, p_ingredient_id: ing, p_quantity: quantity });
    // Plov: 150 g rice + 10 ml oil = 635.9 -> 640. Kebab: 2 eggs of 55 g = 157.3 -> 160. Mystery: one without calories.
    for (const l of [
      await line("plov", rice.data as string, 150),
      await line("plov", oil.data as string, 10),
      await line("kebab", egg.data as string, 2),
      await line("mystery", rice.data as string, 100),
      await line("mystery", gum.data as string, 5),
    ])
      expect(l.error).toBeNull();

    const url = `/en/m/${cafe.slug}/main?t=${cafe.tables["1"]!.token}`;
    // Before Publish the guest menu has no numbers.
    await page.goto(url);
    await page.getByTestId("dish").filter({ hasText: "Plov" }).getByRole("button", { name: /Plov/ }).first().click();
    await expect(page.getByRole("dialog", { name: "Plov" })).toBeVisible();
    await expect(page.getByTestId("kcal")).toHaveCount(0);

    expect((await api.rpc("publish_menu", { p_location_id: cafe.locationId })).error).toBeNull();
    await page.goto(url);
    const dish = (name: string) => page.getByTestId("dish").filter({ hasText: name });
    const sheetOf = async (name: string) => {
      await dish(name).getByRole("button", { name: new RegExp(name) }).first().click();
      return page.getByRole("dialog", { name });
    };
    let sheet = await sheetOf("Plov");
    await expect(sheet.getByTestId("kcal")).toHaveText("≈ 640 kcal");
    await expect(sheet.getByTestId("allergens")).toContainText("Allergen information is provided by the venue.");
    // Nothing noisy on the list itself.
    await expect(dish("Plov")).not.toContainText("kcal");
    await page.keyboard.press("Escape");
    sheet = await sheetOf("Kebab");
    await expect(sheet.getByTestId("kcal")).toHaveText("≈ 160 kcal");
    await page.keyboard.press("Escape");
    sheet = await sheetOf("Mystery");
    await expect(sheet.getByTestId("kcal")).toHaveCount(0); // one ingredient has no calories: no partial total
    await page.keyboard.press("Escape");

    // The chips: they combine, and "Show all" resets.
    const chooser = page.getByRole("dialog", { name: "Filters" });
    await expect(async () => {
      await page.getByRole("button", { name: "Filters" }).click();
      await expect(chooser).toBeVisible({ timeout: 1_000 });
    }).toPass({ timeout: 15_000 });
    await chooser.getByRole("button", { name: "Vegetarian" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("dish")).toHaveCount(2); // plov (vegetarian) and soup (vegan counts too)
    await expect(dish("Kebab")).toHaveCount(0);
    await page.getByRole("button", { name: "Filters: 1" }).click();
    await chooser.getByRole("button", { name: "Chef's pick" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("dish")).toHaveCount(1);
    await expect(dish("Plov")).toBeVisible();
    await page.getByRole("button", { name: "Show all" }).click();
    await expect(page.getByTestId("dish")).toHaveCount(4);
    await page.getByRole("button", { name: "Filters" }).click();
    await chooser.getByRole("button", { name: "Contains nuts" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("dish")).toHaveCount(1);
    await expect(dish("Kebab")).toBeVisible();
  });

  test("the owner sees the number guests will get, and what is missing", async ({ page }) => {
    test.setTimeout(180_000);
    await createFreshCafe(page);
    await page.goto("/admin/menu");
    test.skip(
      (await page.getByTestId("out-ingredient-setting").count()) === 0,
      "needs migration 20261123250000_ingredients_substitutes on the dev project",
    );
    await page.getByRole("button", { name: "Լրացնել ձեռքով" }).click();
    await page.getByLabel("Անունը հայերեն").fill("Տաք ուտեստներ");
    await page.getByRole("button", { name: "Պահել" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Տաք ուտեստներ" })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "+ Ավելացնել ուտեստ" }).click();
    await page.getByLabel("Անունը հայերեն").fill("Փլավ");
    await page.getByLabel("Գինը, ֏").fill("2500");
    await page.getByRole("button", { name: "Պահել" }).click();
    await expect(page.getByText("Պահված է")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("dish-row").filter({ hasText: "Փլավ" }).click();

    const panel = page.getByTestId("dish-ingredients");
    await addFromList(panel, "Բրինձ");
    // The calorie fields exist only once the migration is on the dev project.
    test.skip(
      (await panel.getByLabel(/^Կալորիականություն/).count()) === 0,
      "needs migration 20261123320000_calories_tags on the dev project (CI applies it after the push)",
    );
    // 100 g of rice from the common list: 365 -> 370, ready for Publish.
    await expect(panel.getByTestId("kcal-value")).toContainText("≈ 370", { timeout: 15_000 });
    // Coffee beans have no calories in the list: no number, and the owner is told which one.
    await addFromList(panel, "Սուրճի հատիկներ");
    await expect(panel.getByTestId("kcal-summary")).toContainText("Սուրճի հատիկներ", { timeout: 15_000 });
    await expect(panel.getByTestId("kcal-value")).toHaveCount(0, { timeout: 15_000 });
    const beans = panel.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 4, name: "Սուրճի հատիկներ" }) });
    await beans.getByLabel(/^Կալորիականություն/).fill("0");
    await beans.getByRole("button", { name: "Պահել կալորիականությունը" }).click();
    await expect(beans.getByRole("status").filter({ hasText: "Պահված է" })).toBeVisible({ timeout: 15_000 });
    await expect(panel.getByTestId("kcal-value")).toContainText("≈ 370", { timeout: 15_000 });
  });
});

async function addFromList(panel: ReturnType<Page["getByTestId"]>, name: string) {
  await panel.getByLabel("Գտնել բաղադրիչ").fill(name);
  await panel.getByRole("button", { name: new RegExp(`^${name}`) }).click();
  await expect(panel.getByRole("heading", { level: 4, name })).toBeVisible({ timeout: 15_000 });
}
