import { expect, test } from "./fixtures";
import { ownerEmail, ownerPassword, signInAsDemoOwner, unique } from "./helpers";

test.describe("staff and devices at the demo café", () => {
  test.skip(!ownerEmail || !ownerPassword, "needs E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD from .env.local");

  test("a kitchen tablet pairs with a code, can't open the admin, and stops working when revoked", async ({ page, browser }) => {
    const label = `E2E խոհանոց ${unique()}`;
    await signInAsDemoOwner(page);
    await page.goto("/admin/staff");
    await page.getByLabel("Սարքի անունը").fill(label);
    await page.getByRole("button", { name: "Ստանալ կոդը" }).click();
    const code = (await page.getByTestId("pairing-code").textContent())?.trim() ?? "";
    expect(code).toMatch(/^\d{6}$/);

    const tablet = await browser.newContext();
    const device = await tablet.newPage();
    await device.goto("/pair");
    await device.getByLabel("Վեցանիշ կոդը").fill(code);
    await device.getByRole("button", { name: "Միացնել" }).click();
    await expect(device).toHaveURL(/\/kitchen\/[0-9a-f-]{36}$/);
    await expect(device.getByRole("heading", { level: 1 })).toHaveText("Խոհանոց");
    const boardUrl = device.url();

    const admin = await device.goto("/admin");
    expect(admin?.status()).toBe(403);
    await expect(device.getByRole("heading", { level: 1 })).toHaveText("Այս էջը բացելու իրավունք չունեք։");

    await page.reload();
    const row = page.getByTestId("member-row").filter({ hasText: label });
    await row.getByRole("button", { name: "Անջատել" }).click();
    await expect(row).toContainText("Անջատված է");

    await device.goto(boardUrl);
    await expect(device).toHaveURL(/\/pair\?disconnected=1$/);
    await expect(device.getByRole("status")).toHaveText("Այս սարքն անջատված է։ Միացնելու համար մուտքագրեք նոր կոդ։");
    await tablet.close();
  });

  test("an invited manager signs up from the link and joins the café", async ({ page, browser }) => {
    await signInAsDemoOwner(page);
    await page.goto("/admin/staff");
    await page.getByRole("button", { name: "Ստանալ հղումը" }).click();
    const link = await page.getByTestId("invite-link").inputValue();
    expect(link).toMatch(/\/invite\/[A-Za-z0-9_-]{32}$/);

    const other = await browser.newContext();
    const person = await other.newPage();
    await person.goto(link);
    await person.getByRole("link", { name: "Գրանցվել" }).click();
    await person.getByLabel("Ձեր անունը").fill("Մարիամ");
    await person.getByLabel("Էլ․ փոստ").fill(`e2e-${unique()}@pativ.test`);
    await person.getByLabel("Գաղտնաբառ (առնվազն 8 նիշ)").fill("e2e-password-123");
    await person.getByRole("button", { name: "Գրանցվել" }).click();
    await expect(person).toHaveURL(/\/invite\//);
    await person.getByLabel("Ձեր անունը").fill("Մարիամ");
    await person.getByRole("button", { name: "Միանալ" }).click();
    await expect(person).toHaveURL(/\/admin$/);
    await expect(person.getByRole("heading", { level: 1 })).toHaveText("Դեմո սրճարան");
    await other.close();
  });
});
