import { expect, test } from "./fixtures";
import { createFreshCafe } from "./helpers";

// "No allergens" is a statement the owner makes (ADR-083). Needs migration
// 20261123340000_allergen_review on the dev project: it reaches the project
// only when CI applies it after the push, so until then the test skips (the
// editor hides the control when the column is missing). Desktop only.
test.describe("allergen review", () => {
  test.skip(({ isMobile }) => isMobile, "one desktop run covers the flow");

  test("the owner confirms 'none' on a dish and the guest reads it; an unreviewed dish still says ask your waiter", async ({
    page,
  }) => {
    test.setTimeout(180_000);
    const cafe = await createFreshCafe(page);
    await page.goto("/admin/menu");
    await page.getByRole("button", { name: "Լրացնել ձեռքով" }).click();
    await page.getByLabel("Անունը հայերեն").fill("Ըմպելիքներ");
    await page.getByRole("button", { name: "Պահել" }).click();

    const addDish = async (name: string, price: string) => {
      await page.getByRole("button", { name: "+ Ավելացնել ուտեստ" }).click();
      await page.getByLabel("Անունը հայերեն").fill(name);
      await page.getByLabel("Գինը, ֏").fill(price);
    };
    await addDish("Ջուր", "300");
    test.skip(
      (await page.getByTestId("allergens-none").count()) === 0,
      "needs migration 20261123340000_allergen_review on the dev project (CI applies it after the push)",
    );
    const none = page.getByTestId("allergens-none").getByRole("checkbox");
    await expect(none).not.toBeChecked();
    // A tick implies review, and the checkbox gives way to the list.
    await page.getByTestId("allergens").getByRole("button", { name: "ձու", exact: true }).click();
    await expect(none).toBeDisabled();
    await page.getByTestId("allergens").getByRole("button", { name: "ձու", exact: true }).click();
    await expect(none).toBeEnabled();
    await expect(none).not.toBeChecked();
    await none.check();
    await page.getByRole("button", { name: "Պահել" }).click();
    await expect(page.getByText("Պահված է")).toBeVisible();

    // A second dish nobody reviewed.
    await page.getByRole("button", { name: "Փակել" }).first().click().catch(() => undefined);
    await addDish("Թեյ", "500");
    await page.getByRole("button", { name: "Պահել" }).click();
    await expect(page.getByText("Պահված է")).toBeVisible();

    await page.reload();
    const rows = page.getByTestId("dish-row");
    await expect(rows).toHaveCount(2);
    await expect(page.getByTestId("allergens-unreviewed")).toHaveCount(1);
    await rows.filter({ hasText: "Ջուր" }).click();
    await expect(page.getByTestId("allergens-none").getByRole("checkbox")).toBeChecked();

    // On a tablet the editor is a sheet over the list: close it to reach the filter.
    const sheetClose = page.getByRole("dialog").getByRole("button", { name: "Փակել" }).first();
    if (await sheetClose.isVisible()) await sheetClose.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // The filter shows only what is not reviewed.
    await page.getByTestId("filter-unreviewed").click();
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("Թեյ");
    await page.getByTestId("filter-unreviewed").click();

    await page.getByRole("button", { name: "Հրապարակել" }).click();
    await expect(page.getByText("Հրապարակված է։ Հյուրերն արդեն տեսնում են նոր ճաշացանկը։")).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/en/m/${cafe.slug}/main`);
    const open = async (name: string) => {
      await page.getByTestId("dish").filter({ hasText: name }).getByRole("button").first().click();
      return page.getByRole("dialog").filter({ hasText: name });
    };
    let sheet = await open("Ջուր");
    await expect(sheet.getByTestId("allergens")).toContainText("No allergens declared by the venue.");
    await expect(sheet.getByTestId("allergens")).toContainText("Allergen information is provided by the venue.");
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/allergen-none-390.png` });
    await page.keyboard.press("Escape");
    sheet = await open("Թեյ");
    await expect(sheet.getByTestId("allergens")).toContainText("Allergens aren't listed for this dish");
    await expect(sheet.getByTestId("allergens")).not.toContainText("No allergens declared");
    if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/allergen-unknown-390.png` });
  });
});
