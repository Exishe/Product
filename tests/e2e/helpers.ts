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
