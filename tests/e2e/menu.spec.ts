import { expect, test } from "./fixtures";
import { createFreshCafe } from "./helpers";

test("an owner builds a menu by hand: a section, dishes in three languages, sizes, order", async ({ page }) => {
  await createFreshCafe(page);
  await page.goto("/admin/menu");
  await expect(page.getByRole("heading", { name: "Ճաշացանկը դեռ դատարկ է" })).toBeVisible();

  await page.getByRole("button", { name: "Լրացնել ձեռքով" }).click();
  await page.getByLabel("Անունը հայերեն").fill("Տաք ուտեստներ");
  await page.getByLabel("Անունը ռուսերեն").fill("Горячие блюда");
  await page.getByRole("button", { name: "Պահել" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Տաք ուտեստներ" })).toBeVisible();

  // A dish with three names and a price typed with a space
  await page.getByRole("button", { name: "+ Ավելացնել ուտեստ" }).click();
  await page.getByLabel("Անունը հայերեն").fill("Տոլմա");
  await page.getByLabel("Անունը ռուսերեն").fill("Толма");
  await page.getByLabel("Անունը անգլերեն").fill("Tolma");
  await page.getByLabel("Գինը, ֏").fill("1500.5");
  await page.getByRole("button", { name: "Պահել" }).click();
  await expect(page.getByText("Գրեք գինը ամբողջ դրամով, օրինակ՝ 2 500։")).toBeVisible();
  await page.getByLabel("Գինը, ֏").fill("3 200");
  await page.getByRole("button", { name: "Պահել" }).click();
  await expect(page.getByText("Պահված է")).toBeVisible();
  await expect(page.getByTestId("dish-row").filter({ hasText: "Տոլմա" })).toContainText("3 200 ֏");

  // A second dish, moved above the first
  await page.getByRole("button", { name: "+ Ավելացնել ուտեստ" }).click();
  await page.getByLabel("Անունը հայերեն").fill("Խաշլամա");
  await page.getByLabel("Գինը, ֏").fill("4500");
  await page.getByRole("button", { name: "Պահել" }).click();
  await expect(page.getByTestId("dish-row")).toHaveCount(2);
  await page.getByRole("listitem").filter({ hasText: "Խաշլամա" }).getByRole("button", { name: "Տեղափոխել վեր" }).click();
  await expect(page.getByTestId("dish-row").first()).toContainText("Խաշլամա");

  // An option group for sizes, attached to the tolma
  await page.goto("/admin/menu/options");
  await page.getByRole("button", { name: "+ Ավելացնել խումբ" }).click();
  await page.getByLabel("Խմբի անունը հայերեն").fill("Չափ");
  await page.getByLabel("Տարբերակ 1: Անունը հայերեն").fill("Փոքր");
  await page.getByRole("button", { name: "+ Ավելացնել տարբերակ" }).click();
  await page.getByLabel("Տարբերակ 2: Անունը հայերեն").fill("Մեծ");
  await page.getByLabel("Տարբերակ 2: Հավելավճար, ֏").fill("500");
  await page.getByRole("button", { name: "Պահել" }).click();
  await expect(page.getByText("Պահված է")).toBeVisible();

  await page.goto("/admin/menu");
  await page.getByTestId("dish-row").filter({ hasText: "Տոլմա" }).click();
  await page.getByLabel("Չափ").check();
  await page.getByRole("button", { name: "Պահել" }).click();
  await expect(page.getByText("Պահված է")).toBeVisible();
  await page.reload();
  await page.getByTestId("dish-row").filter({ hasText: "Տոլմա" }).click();
  await expect(page.getByLabel("Չափ")).toBeChecked();
});
