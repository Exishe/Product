import { expect, test } from "./fixtures";
import { signUpInBrowser, unique } from "./helpers";
import { signInAsRunOwner } from "./run-owner";

// The sign-up test creates a real account on the dev project; addresses start
// with e2e- so they can be cleaned up. It is the only test that signs up
// through the form (ADR-064): every other café belongs to the run's one owner.

test("a new owner signs up, creates a café and lands on its admin", async ({ page }) => {
  // Room for the slow dev database and for one more try after an Auth rate limit.
  test.setTimeout(180_000);
  const id = unique();
  await signUpInBrowser(page, "Արամ", `e2e-${id}@pativ.test`);
  await page.getByLabel("Սրճարանի անունը").fill(`Թեստ սրճարան ${id}`);
  await expect(page.getByLabel("Էջի հասցեն")).toHaveValue(`test-srcharan-${id}`);
  await page.getByRole("button", { name: "Ստեղծել" }).click();
  await expect(page).toHaveURL(/\/admin$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Թեստ սրճարան ${id}`);
  await expect(page.getByText("Բարի գալուստ, Արամ")).toBeVisible();
});

test("a taken page address shows the message in Armenian", async ({ page }) => {
  // Any signed-in person can open "create your café"; the sign-up form itself is the test above.
  await signInAsRunOwner(page.context(), null);
  await page.goto("/admin/new");
  await page.getByLabel("Սրճարանի անունը").fill("Դեմո");
  await page.getByLabel("Էջի հասցեն").fill("demo-cafe");
  await page.getByRole("button", { name: "Ստեղծել" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Այս հասցեն արդեն զբաղված է։ Փորձեք մեկ ուրիշը։" })).toBeVisible();
});
