import { describe, expect, it } from "vitest";
import { normalizeForSearch } from "@/lib/format/search";
import { buildGuestMenu, localized, type PublicMenu } from "./view-model";

const item = (
  over: Partial<PublicMenu["menu"]["items"][string]> = {},
): PublicMenu["menu"]["items"][string] => ({
  name: { hy: "Տոլմա", ru: "Толма", en: "Tolma" },
  description: null,
  price: 3200,
  portion: null,
  tags: [],
  groups: [],
  ...over,
});

const menu = (
  items: PublicMenu["menu"]["items"],
  categories: { id: string; item_ids: string[] }[],
): PublicMenu => ({
  restaurant: { name: "Դեմո սրճարան" },
  location: { id: "loc-1", name: "Main", locales: ["hy", "ru", "en"], ordering: true },
  menu: {
    menus: [
      {
        id: "m1",
        name: { hy: "Ճաշացանկ" },
        categories: categories.map((c) => ({ ...c, name: { hy: `Բաժին ${c.id}`, en: `Section ${c.id}` } })),
      },
    ],
    items,
  },
  sold_out: [],
  kitchen_busy: null,
});

describe("localized", () => {
  it("uses the requested language when it is there", () => {
    expect(localized({ hy: "Տոլմա", ru: "Толма", en: "Tolma" }, "en")).toEqual({ text: "Tolma", lang: "en" });
  });

  it("falls back to Armenian, then Russian, then English, saying which language it shows", () => {
    expect(localized({ hy: "Բորանի", ru: "Борани" }, "en")).toEqual({ text: "Բորանի", lang: "hy" });
    expect(localized({ ru: "Сырники", en: "Syrniki" }, "hy")).toEqual({ text: "Сырники", lang: "ru" });
    expect(localized({ en: "Brownie" }, "ru")).toEqual({ text: "Brownie", lang: "en" });
  });

  it("treats blank text as missing and gives null when nothing is left", () => {
    expect(localized({ en: "  ", hy: "Թան" }, "en")).toEqual({ text: "Թան", lang: "hy" });
    expect(localized({ en: "" }, "en")).toBeNull();
    expect(localized(null, "hy")).toBeNull();
  });
});

describe("buildGuestMenu", () => {
  it("keeps the published order of sections and dishes and drops empty sections", () => {
    const m = menu({ a: item(), b: item({ name: { hy: "Թան" } }) }, [
      { id: "1", item_ids: ["b", "a"] },
      { id: "2", item_ids: [] },
      { id: "3", item_ids: ["missing"] },
    ]);
    const view = buildGuestMenu(m, "hy");
    expect(view.categories.map((c) => c.id)).toEqual(["1"]);
    expect(view.categories[0]!.items.map((i) => i.id)).toEqual(["b", "a"]);
    expect(view.categories[0]!.name).toEqual({ text: "Բաժին 1", lang: "hy" });
  });

  it("marks sold-out dishes and passes the kitchen-busy notice and ordering switch", () => {
    const m = {
      ...menu({ a: item(), b: item() }, [{ id: "1", item_ids: ["a", "b"] }]),
      sold_out: ["b"],
      kitchen_busy: { until: "2026-11-09T20:00:00Z", expected_wait_minutes: 30 },
    };
    m.location.ordering = false;
    const view = buildGuestMenu(m, "ru");
    expect(view.categories[0]!.items.map((i) => i.soldOut)).toEqual([false, true]);
    expect(view.kitchenBusy).toEqual({ minutes: 30 });
    expect(view.ordering).toBe(false);
    expect(view.locationId).toBe("loc-1");
  });

  it("localizes descriptions, options and option groups with the same fallback", () => {
    const m = menu(
      {
        c: item({
          name: { hy: "Կապուչինո", en: "Cappuccino" },
          description: { ru: "Эспрессо и молоко" },
          portion: { amount: 250, unit: "ml" },
          tags: ["popular", "made-up"],
          groups: [
            {
              id: "g",
              min: 1,
              max: 1,
              name: { hy: "Չափ", en: "Size" },
              modifiers: [
                { id: "s", price_delta: 0, is_default: true, name: { hy: "Փոքր" } },
                { id: "l", price_delta: 300, is_default: false, name: { hy: "Մեծ", en: "Large" } },
              ],
            },
          ],
        }),
      },
      [{ id: "1", item_ids: ["c"] }],
    );
    const dish = buildGuestMenu(m, "en").categories[0]!.items[0]!;
    expect(dish.name).toEqual({ text: "Cappuccino", lang: "en" });
    expect(dish.description).toEqual({ text: "Эспрессо и молоко", lang: "ru" });
    expect(dish.portion).toEqual({ amount: 250, unit: "ml" });
    expect(dish.tags).toEqual(["popular"]);
    expect(dish.groups[0]!.name).toEqual({ text: "Size", lang: "en" });
    expect(
      dish.groups[0]!.modifiers.map((x) => [x.id, x.name.text, x.name.lang, x.delta, x.isDefault]),
    ).toEqual([
      ["s", "Փոքր", "hy", 0, true],
      ["l", "Large", "en", 300, false],
    ]);
  });

  it("indexes every language's name so «խորոված», «хоровац» and khorovats all find it", () => {
    const m = menu(
      { k: item({ name: { hy: "Հավի խորոված", ru: "Хоровац из курицы", en: "Chicken khorovats" } }) },
      [{ id: "1", item_ids: ["k"] }],
    );
    const dish = buildGuestMenu(m, "hy").categories[0]!.items[0]!;
    for (const q of ["խորոված", "хоровац", "khorovats", "KHOROVATS", "курицы"]) {
      expect(dish.search.includes(normalizeForSearch(q)), q).toBe(true);
    }
    expect(dish.search.includes(normalizeForSearch("tolma"))).toBe(false);
  });

  it("reads the café's look, and wears Evening until the database says otherwise", () => {
    const before = buildGuestMenu(menu({}, []), "hy");
    expect([before.theme, before.brandColor, before.logo]).toEqual(["evening", null, null]);
    const m = menu({}, []);
    m.restaurant = { name: "Café", guest_theme: "wine", brand_color: "#c2185b", logo: "r1/logo/1.webp" };
    const after = buildGuestMenu(m, "hy");
    expect([after.theme, after.brandColor, after.logo]).toEqual(["wine", "#c2185b", "r1/logo/1.webp"]);
  });

  it("reads the wordmark from the brand and a cover per section (ADR-058)", () => {
    const k = {
      name: { hy: "Խորոված" },
      description: null,
      price: 100,
      portion: null,
      tags: null,
      groups: null,
    };
    const m = menu({ k }, [
      { id: "1", item_ids: ["k"] },
      { id: "2", item_ids: ["k"] },
    ]);
    expect(buildGuestMenu(m, "hy").wordmark).toBeNull();
    expect(buildGuestMenu(m, "hy").categories.map((c) => c.cover)).toEqual([null, null]);
    m.restaurant = { name: "Café", brand: { wordmark: "r1/brand/1.webp" } };
    m.covers = { "2": "r1/covers/2/1.webp" };
    const after = buildGuestMenu(m, "hy");
    expect(after.wordmark).toBe("r1/brand/1.webp");
    // One picture only: the slim bar shows it too, whatever the backgrounds.
    expect(after.wordmarkBar).toBe("r1/brand/1.webp");
    expect(buildGuestMenu(m, "hy", { header: true, page: true }).wordmark).toBe("r1/brand/1.webp");
    // Two pictures (ADR-065): the light-ink one on a dark band, the dark-ink one on a light page.
    m.restaurant = { name: "Café", brand: { wordmark: "r1/brand/1.webp", wordmark_dark: "r1/brand/2.webp" } };
    const blanca = buildGuestMenu(m, "hy", { header: true, page: false });
    expect([blanca.wordmark, blanca.wordmarkBar]).toEqual(["r1/brand/2.webp", "r1/brand/1.webp"]);
    const plain = buildGuestMenu(m, "hy");
    expect([plain.wordmark, plain.wordmarkBar]).toEqual(["r1/brand/1.webp", "r1/brand/1.webp"]);
    m.restaurant = { name: "Café", brand: { wordmark_dark: "r1/brand/2.webp" } };
    expect(buildGuestMenu(m, "hy").wordmark).toBe("r1/brand/2.webp");
    expect(after.categories.map((c) => c.cover)).toEqual([null, "r1/covers/2/1.webp"]);
  });

  it("keeps the EU allergen codes and diet tags it knows, in a fixed order", () => {
    const m = menu(
      {
        a: item({ allergens: ["milk", "gluten", "made-up"], tags: ["lactose_free", "vegetarian", "keto"] }),
        b: item(),
      },
      [{ id: "1", item_ids: ["a", "b"] }],
    );
    const built = buildGuestMenu(m, "en");
    const [a, b] = built.categories[0]!.items;
    expect(a!.allergens).toEqual(["gluten", "milk"]);
    expect(a!.tags).toEqual(["vegetarian", "lactose_free"]);
    expect(b!.allergens).toEqual([]);
    expect(built.hasAllergens).toBe(true);
  });

  it("offers no allergy filter when no dish lists allergens", () => {
    const m = menu({ a: item({ allergens: [] }), b: item({ allergens: null }) }, [
      { id: "1", item_ids: ["a", "b"] },
    ]);
    expect(buildGuestMenu(m, "hy").hasAllergens).toBe(false);
  });
});
