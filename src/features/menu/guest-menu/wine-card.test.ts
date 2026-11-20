import { describe, expect, it } from "vitest";
import { normalizeForSearch } from "@/lib/format/search";
import {
  buildGuestMenu,
  originOf,
  sameNameDetails,
  sameNamed,
  sizesOf,
  type GuestGroup,
  type PublicMenu,
} from "./view-model";

type RawItem = PublicMenu["menu"]["items"][string];
const raw = (over: Partial<RawItem>): RawItem => ({
  name: { hy: "Տոլմա", ru: "Толма", en: "Tolma" },
  description: null,
  price: 3200,
  portion: null,
  tags: [],
  groups: [],
  ...over,
});
const same = (text: string) => ({ hy: text, ru: text, en: text });
const menu = (
  items: PublicMenu["menu"]["items"],
  categories: { id: string; name: RawItem["name"]; item_ids: string[] }[],
): PublicMenu => ({
  restaurant: { name: "Blanca" },
  location: { id: "loc-1", name: "Main", locales: ["hy", "ru", "en"], ordering: true },
  menu: { menus: [{ id: "m1", name: { hy: "Ճաշացանկ" }, categories }], items },
  sold_out: [],
  kitchen_busy: null,
});

const blanca = menu(
  {
    jam: raw({
      name: { hy: "Բլիթներ թթվասերով", ru: "Блины со сметаной", en: "Blini with sour cream" },
      description: { hy: "մեղրով / մուրաբայով", ru: "с мёдом / вареньем", en: "with honey / jam" },
      price: 1800,
    }),
    caviar: raw({
      name: { hy: "Բլիթներ թթվասերով", ru: "Блины со сметаной", en: "Blini with sour cream" },
      description: {
        hy: "կարմիր խավիարով ու կարագով",
        ru: "с красной икрой и маслом",
        en: "with red caviar and butter",
      },
      price: 2700,
    }),
    sancerre: raw({
      name: same("J. de Villebois Sancerre"),
      description: same("Sauvignon Blanc / Loire Valley, France"),
      price: 12000,
    }),
    carmenere: raw({
      name: same("Montes Alpha Carmenère"),
      description: same("Carmenère, Cabernet Sauvignon / Colchagua Valley, Chile"),
      price: 15400,
    }),
  },
  [
    { id: "breakfast", name: { hy: "Նախաճաշ", ru: "Завтрак", en: "Breakfast" }, item_ids: ["jam", "caviar"] },
    {
      id: "white",
      name: { hy: "Սպիտակ գինի", ru: "Белое вино", en: "White wine" },
      item_ids: ["sancerre", "carmenere"],
    },
  ],
);

describe("a wine's grape and region", () => {
  it("is read from a description written the same in every language", () => {
    expect(originOf(same("Sauvignon Blanc / Loire Valley, France"))).toEqual({
      grape: "Sauvignon Blanc",
      region: "Loire Valley, France",
    });
  });

  it("leaves a dish's translated description alone", () => {
    expect(
      originOf({ hy: "մեղրով / մուրաբայով", ru: "с мёдом / вареньем", en: "with honey / jam" }),
    ).toBeNull();
    expect(originOf({ en: "Sauvignon Blanc / Loire Valley, France" })).toBeNull();
    expect(originOf(same("still / sparkling"))).toBeNull();
    expect(originOf(null)).toBeNull();
  });

  it("is searchable by grape and region, in any script", () => {
    const built = buildGuestMenu(blanca, "hy");
    const sancerre = built.categories[1]!.items[0]!;
    expect(sancerre.origin?.region).toBe("Loire Valley, France");
    for (const q of ["sancerre", "Сансер", "սանսեր", "sauvignon", "Loire"]) {
      expect(sancerre.search, q).toContain(normalizeForSearch(q));
    }
    const carmenere = built.categories[1]!.items[1]!;
    for (const q of ["carmenere", "Carmenère", "карменер", "Chile"]) {
      expect(carmenere.search, q).toContain(normalizeForSearch(q));
    }
  });
});

describe("a section's search key", () => {
  it("holds its name in every language", () => {
    const white = buildGuestMenu(blanca, "en").categories[1]!;
    for (const q of ["white wine", "белое вино", "սպիտակ գինի", "belo"]) {
      expect(white.search, q).toContain(normalizeForSearch(q));
    }
  });
});

describe("sizesOf", () => {
  const text = (t: string) => ({ text: t, lang: "en" as const });
  const group = (over: Partial<GuestGroup>, deltas: number[]): GuestGroup => ({
    id: "g",
    min: 1,
    max: 1,
    name: text("Serving"),
    modifiers: deltas.map((delta, i) => ({
      id: `m${i}`,
      name: text(`Size ${i}`),
      delta,
      isDefault: i === 0,
    })),
    ...over,
  });

  it("lists glass and jug with their full prices", () => {
    expect(sizesOf({ price: 1600, groups: [group({}, [0, 2000])] }).map((s) => s.price)).toEqual([
      1600, 3600,
    ]);
    // Standard and mini: the smaller one costs less.
    expect(sizesOf({ price: 3400, groups: [group({}, [0, -2100])] }).map((s) => s.price)).toEqual([
      3400, 1300,
    ]);
  });

  it("is empty for a free choice, an optional extra or a long list", () => {
    expect(sizesOf({ price: 800, groups: [group({}, [0, 0, 0])] })).toEqual([]);
    expect(sizesOf({ price: 800, groups: [group({ min: 0 }, [0, 300])] })).toEqual([]);
    expect(sizesOf({ price: 800, groups: [group({}, [0, 100, 200, 300])] })).toEqual([]);
    expect(sizesOf({ price: 800, groups: [group({}, [0, 300]), group({ id: "h" }, [0, 0])] })).toEqual([]);
    expect(sizesOf({ price: 800, groups: [] })).toEqual([]);
  });
});

describe("same-named dishes", () => {
  it("are found in the menu the guest is reading", () => {
    const built = buildGuestMenu(blanca, "ru");
    expect([...sameNamed(built.categories)].sort()).toEqual(["caviar", "jam"]);
  });

  it("give the order status page their descriptions, in the page's language", () => {
    expect(sameNameDetails(blanca, "en")).toEqual({
      jam: "with honey / jam",
      caviar: "with red caviar and butter",
    });
    expect(sameNameDetails(blanca, "hy").caviar).toBe("կարմիր խավիարով ու կարագով");
  });
});
