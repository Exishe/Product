import type { Browser, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { createFreshCafe } from "./helpers";
import { runOwner } from "./run-owner";

// Ready-made staff logins (ADR-067): the owner creates a waiter and a kitchen
// login, each signs in with a username and lands on its own screen, a
// switched-off login is refused. Needs the staff-logins migration on the dev
// project; until CI has applied it the test skips.
const ZERO = "00000000-0000-0000-0000-000000000000";

async function migrated(): Promise<boolean> {
  const owner = await runOwner();
  const res = await owner.client.schema("api").rpc("list_staff_logins", { p_location_id: ZERO });
  return res.error?.code !== "PGRST202";
}

async function signInWithUsername(browser: Browser, username: string, password: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Էլ․ փոստ կամ մուտքանուն").fill(username);
  await page.getByLabel("Գաղտնաբառ").fill(password);
  await page.getByRole("button", { name: "Մուտք գործել" }).click();
  return { context, page };
}

const createForm = (page: Page) =>
  page.locator("form").filter({ has: page.getByRole("heading", { name: "Ավելացնել մուտք" }) });

async function createLogin(page: Page, role: "waiter" | "kitchen", ending: string) {
  const form = createForm(page);
  await form.getByLabel("Ում համար").selectOption(role);
  await form.getByLabel("Մուտքանվան վերջը (ըստ ցանկության)").fill(ending);
  await form.getByRole("button", { name: "Ստեղծել մուտք" }).click();
  // The result of an earlier creation stays on screen until this one answers, so wait for this ending.
  const created = form.getByTestId("created-username");
  await expect(created).toHaveText(new RegExp(`-${ending}$`), { timeout: 20_000 });
  const username = await created.textContent();
  const password = (await form.getByTestId("staff-password").textContent())?.trim() ?? "";
  expect(password).toMatch(/^[A-HJ-NP-Za-km-z2-9]{10}$/);
  return { username: (username ?? "").trim(), password };
}

test("an owner creates a waiter and a kitchen login; each signs in by username; a switched-off login is refused", async ({
  page,
  browser,
}) => {
  test.setTimeout(240_000);
  test.skip(!(await migrated()), "needs migration 20261120140000_staff_logins on the dev project");
  const cafe = await createFreshCafe(page);
  await page.goto("/admin/staff");

  // Ready-made: a new café already has one waiter and one kitchen login.
  const list = page.getByTestId("staff-logins");
  await expect(list.getByTestId("staff-login-row")).toHaveCount(2);
  await expect(list.locator(`[data-username="${cafe.slug}-waiter"]`)).toContainText(
    "Գաղտնաբառը դեռ նշված չէ",
  );
  await expect(list.locator(`[data-username="${cafe.slug}-kitchen"]`)).toBeVisible();

  const waiter = await createLogin(page, "waiter", "sal");
  const kitchen = await createLogin(page, "kitchen", "hot");
  expect(waiter.username).toBe(`${cafe.slug}-sal`);
  expect(kitchen.username).toBe(`${cafe.slug}-hot`);
  await expect(list.getByTestId("staff-login-row")).toHaveCount(4);
  // The same ending twice is refused in the owner's language.
  const form = createForm(page);
  await form.getByLabel("Մուտքանվան վերջը (ըստ ցանկության)").fill("sal");
  await form.getByRole("button", { name: "Ստեղծել մուտք" }).click();
  await expect(form.getByRole("alert")).toContainText("արդեն զբաղված է");

  // The waiter login signs in by username and lands on the waiter app, with no way into the admin.
  const w = await signInWithUsername(browser, waiter.username, waiter.password);
  await expect(w.page).toHaveURL(/\/waiter$/, { timeout: 30_000 });
  expect((await w.page.goto("/admin"))?.status()).toBe(403);
  await w.context.close();

  // The kitchen login lands on its station.
  const k = await signInWithUsername(browser, kitchen.username, kitchen.password);
  await expect(k.page).toHaveURL(/\/kitchen\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  expect((await k.page.goto("/admin/staff"))?.status()).toBe(403);
  await k.context.close();

  // A new password set by the owner works, and the old one stops working.
  const row = (name: string) => list.locator(`[data-username="${name}"]`);
  await row(kitchen.username).getByText("Նշել նոր գաղտնաբառ").click();
  await row(kitchen.username).getByRole("button", { name: "Նշել գաղտնաբառը" }).click();
  const fresh = (await row(kitchen.username).getByTestId("staff-password").textContent())?.trim() ?? "";
  expect(fresh).toMatch(/^[A-HJ-NP-Za-km-z2-9]{10}$/);
  expect(fresh).not.toBe(kitchen.password);
  const old = await signInWithUsername(browser, kitchen.username, kitchen.password);
  await expect(old.page.getByRole("alert")).toContainText("սխալ է");
  await old.context.close();
  const again = await signInWithUsername(browser, kitchen.username, fresh);
  await expect(again.page).toHaveURL(/\/kitchen\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await again.context.close();

  // Switched off: refused at sign-in; switched on again: works.
  await row(waiter.username).getByRole("button", { name: "Անջատել" }).click();
  await expect(row(waiter.username)).toContainText("Անջատված է");
  const refused = await signInWithUsername(browser, waiter.username, waiter.password);
  await expect(refused.page.getByRole("alert")).toContainText("սխալ է");
  await expect(refused.page).toHaveURL(/\/login$/);
  await refused.context.close();
  await row(waiter.username).getByRole("button", { name: "Միացնել" }).click();
  await expect(row(waiter.username)).toContainText("Ակտիվ է");
  const back = await signInWithUsername(browser, waiter.username, waiter.password);
  await expect(back.page).toHaveURL(/\/waiter$/, { timeout: 30_000 });

  // The waiter changes their own password from the waiter screen.
  await back.page.getByTestId("change-password-open").click();
  const dialog = back.page.getByRole("dialog");
  await dialog.getByLabel("Նոր գաղտնաբառ (առնվազն 8 նիշ)").fill("Nine-Plums-42");
  await dialog.getByLabel("Կրկնեք նոր գաղտնաբառը").fill("Nine-Plums-42");
  await dialog.getByRole("button", { name: "Պահպանել" }).click();
  await expect(dialog.getByRole("status")).toHaveText("Գաղտնաբառը փոխվեց։");
  await back.context.close();
  const changed = await signInWithUsername(browser, waiter.username, "Nine-Plums-42");
  await expect(changed.page).toHaveURL(/\/waiter$/, { timeout: 30_000 });
  await changed.context.close();
});
