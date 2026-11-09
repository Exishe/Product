import { expect, test } from "./fixtures";
import { createFreshCafe } from "./helpers";
import { newClient } from "./kitchen-helpers";

// The photo import with the fake reader (AI_PROVIDER=fake): upload, fix the
// price the reader doubted, review, and publish. Without review, the menu
// stays unpublished.

async function importApplied(): Promise<boolean> {
  const probe = await newClient()
    .schema("api")
    .rpc("start_menu_import", { p_restaurant_id: "00000000-0000-0000-0000-000000000000" });
  return probe.error?.code !== "PGRST202";
}

async function uploadPaperMenu(page: import("@playwright/test").Page) {
  await page.goto("/admin/menu/import");
  await page.getByTestId("menu-photos").setInputFiles(["tests/fixtures/menus/armenian-cafe.jpg"]);
  await expect(page.getByText("Ընտրված է 1 լուսանկար")).toBeVisible();
  await page.getByRole("button", { name: "Կարդալ ճաշացանկը" }).click();
  await expect(page).toHaveURL(/\/admin\/menu\/import\/[0-9a-f-]{36}$/, { timeout: 60_000 });
  await expect(page.getByTestId("import-dish")).toHaveCount(3);
}

test("an owner turns a photo of the paper menu into a published menu", async ({ page }) => {
  test.skip(!(await importApplied()), "needs migration 20261109190000_menu_import.sql on the cloud project");
  await createFreshCafe(page);
  await uploadPaperMenu(page);

  // The Caesar salad's printed price disagreed with the reading: it's flagged.
  const caesar = page.getByTestId("import-dish").filter({ has: page.locator('input[value="Կեսարի աղցան"]') });
  await expect(caesar.getByText("Ստուգեք այս ուտեստը․ վստահ չենք, որ ճիշտ ենք կարդացել։")).toBeVisible();
  await caesar.getByLabel("Գին, ֏").fill("2 700");
  await expect(caesar.getByLabel("Գին, ֏")).toHaveValue("2700");

  await page.getByRole("button", { name: "Նշել ամբողջը ստուգված" }).click();
  await expect(page.getByText("Ամեն ինչ ստուգված է")).toBeVisible();
  await page.getByRole("button", { name: "Հրապարակել ճաշացանկը" }).click();
  await expect(page.getByRole("heading", { name: "Ճաշացանկը հրապարակված է" })).toBeVisible();

  await page.getByRole("link", { name: "Բացել խմբագրիչը" }).click();
  await expect(page.getByTestId("dish-row").filter({ hasText: "Կեսարի աղցան" })).toContainText("2 700 ֏");
});

test("an import added without review keeps the menu unpublished", async ({ page }) => {
  test.skip(!(await importApplied()), "needs migration 20261109190000_menu_import.sql on the cloud project");
  await createFreshCafe(page);
  await uploadPaperMenu(page);

  await page.getByRole("button", { name: "Ավելացնել ճաշացանկին" }).click();
  await expect(page.getByRole("heading", { name: "Ճաշացանկին ավելացվեց 3 ուտեստ" })).toBeVisible();
  await page.getByRole("link", { name: "Բացել խմբագրիչը" }).click();
  await page.getByRole("button", { name: "Հրապարակել" }).click();
  await expect(
    page.getByText("Հրապարակելուց առաջ ստուգեք «Ստուգեք» նշված ուտեստների թարգմանությունները։"),
  ).toBeVisible();
});
