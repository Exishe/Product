import { expect, test } from "./fixtures";
import { createFreshCafe } from "./helpers";

// Ingredients of a dish and the out-ingredient rule (ADR-076). The owner adds
// two ingredients from the common list, makes the egg a key ingredient with a
// replacement and a price change, and chooses what a dish without a replacement
// does. Needs migration 20261123250000_ingredients_substitutes on the dev
// project; until CI has applied it this test skips. Desktop only.
test("the owner gives a dish its ingredients, a replacement and the out rule", async ({ page }) => {
  test.skip(test.info().project.name !== "desktop", "desktop only");
  test.setTimeout(180_000);
  await createFreshCafe(page);
  await page.goto("/admin/menu");
  test.skip(
    (await page.getByTestId("out-ingredient-setting").count()) === 0,
    "needs migration 20261123250000_ingredients_substitutes on the dev project",
  );

  // A section and a dish, then the dish's editor.
  await page.getByRole("button", { name: "Լրացնել ձեռքով" }).click();
  await page.getByLabel("Անունը հայերեն").fill("Տաք ուտեստներ");
  await page.getByRole("button", { name: "Պահել" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Տաք ուտեստներ" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "+ Ավելացնել ուտեստ" }).click();
  await page.getByLabel("Անունը հայերեն").fill("Ձվածեղ");
  await page.getByLabel("Գինը, ֏").fill("1500");
  await page.getByRole("button", { name: "Պահել" }).click();
  await expect(page.getByText("Պահված է")).toBeVisible({ timeout: 15_000 });
  await page.getByTestId("dish-row").filter({ hasText: "Ձվածեղ" }).click();

  // Two ingredients from the common list (copied into the café on add).
  const panel = page.getByTestId("dish-ingredients");
  await panel.getByLabel("Գտնել բաղադրիչ").fill("Ձու");
  await panel.getByRole("button", { name: /^Ձու/ }).click();
  await expect(panel.getByRole("heading", { level: 4, name: "Ձու" })).toBeVisible({ timeout: 15_000 });
  await panel.getByLabel("Գտնել բաղադրիչ").fill("Կարագ");
  await panel.getByRole("button", { name: /^Կարագ/ }).click();
  await expect(panel.getByRole("heading", { level: 4, name: "Կարագ" })).toBeVisible({ timeout: 15_000 });

  // The egg is a key ingredient, can be replaced by butter, 300 AMD less.
  const egg = panel
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { level: 4, name: "Ձու" }) });
  await egg.getByLabel("Հիմնական բաղադրիչ").check();
  await egg.getByLabel("Կարող է փոխարինվել").selectOption({ label: "Կարագ" });
  await egg.getByLabel("Գնի փոփոխություն, դրամ").fill("-300");
  await egg.getByRole("button", { name: "Պահել", exact: true }).click();
  // The row has two status lines (the ingredient's and the calories editor's); only the one just saved shows text.
  await expect(egg.getByRole("status").filter({ hasText: "Պահված է" })).toHaveCount(1, { timeout: 15_000 });

  await page.reload();
  await page.getByTestId("dish-row").filter({ hasText: "Ձվածեղ" }).click();
  const saved = page
    .getByTestId("dish-ingredients")
    .getByRole("listitem")
    .filter({
      has: page.getByRole("heading", { level: 4, name: "Ձու" }),
    });
  await expect(saved.getByLabel("Հիմնական բաղադրիչ")).toBeChecked();
  await expect(saved.getByLabel("Կարող է փոխարինվել")).toHaveValue(/.+/);
  await expect(saved.getByLabel("Գնի փոփոխություն, դրամ")).toHaveValue("-300");

  // The out rule: show a dish without a replacement as sold out.
  const setting = page.getByTestId("out-ingredient-setting");
  await setting.getByLabel("Ցույց տալ որպես սպառված").check();
  await expect(setting.getByRole("status")).toContainText("Պահված է", { timeout: 15_000 });
  await page.reload();
  await expect(
    page.getByTestId("out-ingredient-setting").getByLabel("Ցույց տալ որպես սպառված"),
  ).toBeChecked();
});
