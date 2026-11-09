import { expect, test } from "./fixtures";

const email = process.env.E2E_OWNER_EMAIL;
const password = process.env.E2E_OWNER_PASSWORD;

test("an unauthenticated visit to the admin goes to sign-in", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Մուտք");
});

test.describe("the demo owner", () => {
  test.skip(!email || !password, "needs E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD from .env.local");

  test("signs in and lands on the admin of the demo café", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Էլ․ փոստ").fill(email as string);
    await page.getByLabel("Գաղտնաբառ").fill(password as string);
    await page.getByRole("button", { name: "Մուտք գործել" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Դեմո սրճարան");
  });

  test("sees the error in Armenian after a wrong password", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Էլ․ փոստ").fill(email as string);
    await page.getByLabel("Գաղտնաբառ").fill("wrong-password-123");
    await page.getByRole("button", { name: "Մուտք գործել" }).click();
    // Next adds its own (empty) role="alert" route announcer, so match ours by text.
    await expect(page.getByRole("alert").filter({ hasText: "Էլ․ փոստը կամ գաղտնաբառը սխալ է։" })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });
});
