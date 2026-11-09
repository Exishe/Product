import { expect, test } from "./fixtures";
import { createCafeWithMenu, demoTable, forgeToken, tamperToken } from "./guest-helpers";
import { ownerEmail, ownerPassword } from "./helpers";

// Review focus 2: an old, tampered or forged sticker gets a friendly "ask your
// waiter" page with HTTP 404 in the visitor's language, never a 500 and never
// another café's menu.
const refused = {
  hy: { accept: "hy-AM,hy;q=0.9", title: "Այս QR կոդն այլևս չի գործում։", body: "Խնդրեք մատուցողին օգնել։" },
  ru: { accept: "ru-RU,ru;q=0.9,en;q=0.8", title: "Этот QR-код больше не работает.", body: "Попросите официанта помочь." },
  en: { accept: "en-GB,en;q=0.9", title: "This QR code no longer works.", body: "Ask your waiter for help." },
} as const;

test.describe("the table QR entry", () => {
  test.skip(!ownerEmail || !ownerPassword, "needs E2E_OWNER_EMAIL and E2E_OWNER_PASSWORD from .env.local");

  test("a valid sticker leads to the café's menu in the guest's language and keeps the token", async ({ request }) => {
    const { token } = await demoTable("9");
    const cases: [string, string][] = [
      ["ru-RU,ru;q=0.9,en;q=0.8", "ru"],
      ["en-US,en;q=0.9", "en"],
      ["hy-AM", "hy"],
      ["en;q=0.3,ru;q=0.7", "ru"],
      ["de-DE,fr;q=0.8", "hy"], // not offered: the café's default
    ];
    for (const [accept, locale] of cases) {
      const res = await request.get(`/t/${token}`, { headers: { "accept-language": accept }, maxRedirects: 0 });
      expect(res.status(), accept).toBe(307);
      expect(res.headers()["location"], accept).toMatch(new RegExp(`^(https?://[^/]+)?/${locale}/m/demo-cafe/main\\?t=${token}$`));
    }
  });

  test("old, tampered, forged and malformed stickers all get the friendly 404 page", async ({ request, browser }) => {
    const cafe = await createCafeWithMenu({
      categories: [{ key: "hot", names: { hy: "Տաք ուտեստներ" } }],
      dishes: [{ key: "tolma", category: "hot", names: { hy: "Տոլմա" }, price: 3200 }],
      tables: ["1", "2"],
    });
    const demo = await demoTable("9");

    // The owner reprints table 1: its old sticker stops working, the new one works.
    const old = cafe.tables["1"]!.token;
    const reprinted = await cafe.owner.from("tables").update({ qr_version: 2 }).eq("id", cafe.tables["1"]!.id).select("id");
    expect(reprinted.error).toBeNull();
    const fresh = await cafe.owner.schema("api").rpc("table_qr_token", { p_table_id: cafe.tables["1"]!.id });
    const ok = await request.get(`/t/${fresh.data}`, { maxRedirects: 0 });
    expect(ok.status()).toBe(307);
    expect(ok.headers()["location"]).toContain(`/m/${cafe.slug}/main?t=`);

    const tokens = {
      "old sticker": old,
      "tampered signature": tamperToken(demo.token),
      "another café's table inside a signed token": forgeToken(demo.token, cafe.tables["2"]!.id),
      malformed: "not-a-token",
      "one character short": demo.token.slice(1),
      "not base64url": `${demo.token.slice(0, 45)}=`,
    };
    for (const [what, token] of Object.entries(tokens)) {
      for (const [locale, text] of Object.entries(refused)) {
        const res = await request.get(`/t/${encodeURIComponent(token)}`, { headers: { "accept-language": text.accept }, maxRedirects: 0 });
        expect(res.status(), `${what} (${locale})`).toBe(404);
        const html = await res.text();
        expect(html, `${what} (${locale})`).toContain(`<html lang="${locale}"`);
        expect(html, `${what} (${locale})`).toContain(text.title);
        expect(html).not.toContain("demo-cafe");
        expect(html).not.toContain(cafe.slug);
      }
    }

    // In a Russian phone browser the page reads well and nothing else goes wrong.
    const context = await browser.newContext({ locale: "ru-RU" });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => {
      if (m.type() === "error" && !m.text().includes("status of 404")) errors.push(m.text());
    });
    const res = await page.goto(`/t/${tokens["tampered signature"]}`);
    expect(res?.status()).toBe(404);
    await expect(page.locator("html")).toHaveAttribute("lang", "ru");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(refused.ru.title);
    await expect(page.getByText(refused.ru.body)).toBeVisible();
    expect(errors).toEqual([]);
    await context.close();
  });
});
