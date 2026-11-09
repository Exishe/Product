import { expect, test } from "./fixtures";

// Creates real accounts on the dev project; addresses start with e2e- so they
// can be cleaned up.
const unique = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

async function signUp(page: import("@playwright/test").Page, email: string) {
  await page.goto("/signup");
  await page.getByLabel("Ձեր անունը").fill("Արամ");
  await page.getByLabel("Էլ․ փոստ").fill(email);
  await page.getByLabel("Գաղտնաբառ (առնվազն 8 նիշ)").fill("e2e-password-123");
  await page.getByRole("button", { name: "Գրանցվել" }).click();
  await expect(page).toHaveURL(/\/admin\/new$/);
}

test("a new owner signs up, creates a café and lands on its admin", async ({ page }) => {
  const id = unique();
  await signUp(page, `e2e-${id}@pativ.test`);
  await page.getByLabel("Սրճարանի անունը").fill(`Թեստ սրճարան ${id}`);
  await expect(page.getByLabel("Էջի հասցեն")).toHaveValue(`test-srcharan-${id}`);
  await page.getByRole("button", { name: "Ստեղծել" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Թեստ սրճարան ${id}`);
  await expect(page.getByText("Բարի գալուստ, Արամ")).toBeVisible();
});

test("a taken page address shows the message in Armenian", async ({ page }) => {
  await signUp(page, `e2e-${unique()}@pativ.test`);
  await page.getByLabel("Սրճարանի անունը").fill("Դեմո");
  await page.getByLabel("Էջի հասցեն").fill("demo-cafe");
  await page.getByRole("button", { name: "Ստեղծել" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Այս հասցեն արդեն զբաղված է։ Փորձեք մեկ ուրիշը։" })).toBeVisible();
});
