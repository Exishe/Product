import { expect, type Page } from "@playwright/test";

export const ownerEmail = process.env.E2E_OWNER_EMAIL;
export const ownerPassword = process.env.E2E_OWNER_PASSWORD;

export async function signInAsDemoOwner(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Էլ․ փոստ").fill(ownerEmail as string);
  await page.getByLabel("Գաղտնաբառ").fill(ownerPassword as string);
  await page.getByRole("button", { name: "Մուտք գործել" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

export const unique = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// A brand-new owner and café, so tests never touch the demo café's menu.
export async function createFreshCafe(page: Page): Promise<string> {
  const id = unique();
  await page.goto("/signup");
  await page.getByLabel("Ձեր անունը").fill("Թեստ");
  await page.getByLabel("Էլ․ փոստ").fill(`e2e-${id}@pativ.test`);
  await page.getByLabel("Գաղտնաբառ (առնվազն 8 նիշ)").fill("e2e-password-123");
  await page.getByRole("button", { name: "Գրանցվել" }).click();
  await expect(page).toHaveURL(/\/admin\/new$/);
  await page.getByLabel("Սրճարանի անունը").fill(`Թեստ ${id}`);
  await page.getByRole("button", { name: "Ստեղծել" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  return id;
}
