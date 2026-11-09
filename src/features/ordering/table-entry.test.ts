import { describe, expect, it, vi } from "vitest";
import { resolveTableEntry, type ResolvedTable } from "./table-entry";

const TOKEN = "AQGuePtNlnNHwoXHmzgwgdTiAAAAAQvxsaCic8v-p48pBQ";
const demo: ResolvedTable = {
  restaurant_slug: "demo-cafe",
  restaurant_name: "Դեմո սրճարան",
  location_slug: "main",
  location_id: "86b7272c-0be0-4a7b-9e13-1ff42141e27c",
  table_id: "0f3e2a9c-6d1b-4f7e-9a51-2b8c7d4e5f60",
  table_label: "5",
  guest_locales: ["hy", "ru", "en"],
  default_locale: "hy",
};

describe("resolveTableEntry", () => {
  it("never asks the database about a malformed token", async () => {
    const resolve = vi.fn();
    for (const bad of ["", "short", `${TOKEN}A`, `${TOKEN.slice(0, 45)}=`, "../../admin", `${TOKEN.slice(0, 45)}%`]) {
      const entry = await resolveTableEntry(bad, { acceptLanguage: "ru" }, resolve);
      expect(entry).toEqual({ kind: "invalid" });
    }
    expect(resolve).not.toHaveBeenCalled();
  });

  it("sends a good token to the café's menu in the guest's language, keeping the token", async () => {
    const resolve = vi.fn().mockResolvedValue(demo);
    const entry = await resolveTableEntry(TOKEN, { acceptLanguage: "ru-RU,ru;q=0.9" }, resolve);
    expect(resolve).toHaveBeenCalledWith(TOKEN);
    expect(entry).toEqual({ kind: "menu", href: `/ru/m/demo-cafe/main?t=${TOKEN}` });
  });

  it("uses the café's default language when the browser's isn't offered", async () => {
    const resolve = vi.fn().mockResolvedValue({ ...demo, guest_locales: ["hy", "ru"], default_locale: "ru" });
    const entry = await resolveTableEntry(TOKEN, { acceptLanguage: "en-US,de" }, resolve);
    expect(entry).toEqual({ kind: "menu", href: `/ru/m/demo-cafe/main?t=${TOKEN}` });
  });

  it("treats an old, forged or unknown token as invalid", async () => {
    const resolve = vi.fn().mockResolvedValue(null);
    expect(await resolveTableEntry(TOKEN, { acceptLanguage: "en" }, resolve)).toEqual({ kind: "invalid" });
  });

  it("never builds a link from unexpected slugs", async () => {
    const resolve = vi.fn().mockResolvedValue({ ...demo, restaurant_slug: "//evil.example" });
    expect(await resolveTableEntry(TOKEN, { acceptLanguage: "en" }, resolve)).toEqual({ kind: "invalid" });
  });
});
