import { expect, type Page } from "@playwright/test";
import { runOwner, signInAsRunOwner } from "./run-owner";

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

export type FreshCafe = { id: string; restaurantId: string; slug: string; name: string };

// A brand-new café, so tests never touch the demo café's menu. It belongs to
// the run's one owner (run-owner.ts): no sign-up here, and the page ends on
// the new café's admin, as it did after the sign-up form.
export async function createFreshCafe(page: Page): Promise<FreshCafe> {
  const id = unique();
  const owner = await runOwner();
  const name = `Թեստ ${id}`;
  const slug = `e2e-${id}`;
  const { data: restaurantId, error } = await owner.client
    .schema("api")
    .rpc("create_restaurant", { p_name: name, p_slug: slug, p_location_name: name, p_display_name: "Թեստ" });
  if (error || !restaurantId) throw new Error(`create_restaurant: ${error?.message ?? "no id"}`);
  await signInAsRunOwner(page.context(), restaurantId);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  return { id, restaurantId, slug, name };
}

// The sign-up form, for the tests whose subject it is. The dev database can be
// slow, so the wait is long; and when Auth refuses for the moment (too many
// sign-ups from this address) the form is filled in and sent once more after a pause.
export async function signUpInBrowser(
  page: Page,
  name: string,
  email: string,
  password = "e2e-password-123",
): Promise<void> {
  const send = async () => {
    await page.getByLabel("Ձեր անունը").fill(name);
    await page.getByLabel("Էլ․ փոստ").fill(email);
    await page.getByLabel("Գաղտնաբառ").fill(password);
    await page.getByRole("button", { name: "Գրանցվել" }).click();
  };
  await page.goto("/signup");
  await send();
  const refused = page.locator("form").getByRole("alert");
  // Whichever comes first; the other wait ends quietly.
  const outcome = await Promise.race([
    page.waitForURL(/\/admin\/new$/, { timeout: 30_000 }).then(
      () => "arrived" as const,
      () => "neither" as const,
    ),
    refused.waitFor({ timeout: 30_000 }).then(
      () => "refused" as const,
      () => "neither" as const,
    ),
  ]);
  if (outcome === "refused") {
    await page.waitForTimeout(65_000);
    await send();
  }
  await expect(page).toHaveURL(/\/admin\/new$/, { timeout: 30_000 });
}
