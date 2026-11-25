import { describe, expect, it } from "vitest";
import {
  groupByCategory,
  hasCustomRules,
  isItemType,
  ITEM_TYPES,
  matrixRows,
  nameIn,
  searchDishes,
  type Category,
  type Dish,
} from "./model";

const n = (hy: string, ru = "", en = "") => ({ hy, ru, en });
const dishes: Dish[] = [
  { id: "1", categoryId: "a", names: n("Տոլմա", "Толма", "Tolma"), type: "main" },
  { id: "2", categoryId: "b", names: n("Կոլա", "Кола", "Cola"), type: null },
  { id: "3", categoryId: "a", names: n("Խորոված", "Хоровац", "Khorovats"), type: null },
];
const cats: Category[] = [
  { id: "a", names: n("Տաք") },
  { id: "b", names: n("Ըմպելիքներ") },
  { id: "c", names: n("Դատարկ") },
];

describe("kinds", () => {
  it("has the eleven kinds and recognises them", () => {
    expect(ITEM_TYPES).toHaveLength(11);
    expect(isItemType("main")).toBe(true);
    expect(isItemType("pizza")).toBe(false);
    expect(isItemType(null)).toBe(false);
  });
});

describe("nameIn", () => {
  it("falls back to Armenian, then to a dash", () => {
    expect(nameIn(n("Տոլմա", "Толма"), "ru")).toBe("Толма");
    expect(nameIn(n("Տոլմա"), "en")).toBe("Տոլմա");
    expect(nameIn(n(""), "en")).toBe("…");
  });
});

describe("groupByCategory", () => {
  it("keeps the section order and drops empty sections", () => {
    const g = groupByCategory(dishes, cats);
    expect(g.map((x) => x.category.id)).toEqual(["a", "b"]);
    expect(g[0]!.dishes.map((d) => d.id)).toEqual(["1", "3"]);
  });

  it("leaves out dishes of a section that isn't listed, so the first listed dish is from a shown section", () => {
    const g = groupByCategory([{ ...dishes[1]!, id: "9", categoryId: "off" }, ...dishes], cats);
    expect(g.flatMap((x) => x.dishes.map((d) => d.id))).toEqual(["1", "3", "2"]);
    expect(g[0]?.dishes[0]?.id).toBe("1");
  });
});

describe("searchDishes", () => {
  it("matches any language, ignores case, and skips excluded dishes", () => {
    expect(searchDishes(dishes, "COLA", new Set()).map((d) => d.id)).toEqual(["2"]);
    expect(searchDishes(dishes, "толма", new Set()).map((d) => d.id)).toEqual(["1"]);
    expect(searchDishes(dishes, "", new Set(["1"])).map((d) => d.id)).toEqual(["2", "3"]);
    expect(searchDishes(dishes, "zzz", new Set())).toEqual([]);
  });
  it("limits the list", () => {
    expect(searchDishes(dishes, "", new Set(), 2)).toHaveLength(2);
  });
});

describe("matrixRows", () => {
  const flat = [
    { from_type: "main", to_type: "side", allowed: true, is_custom: false },
    { from_type: "main", to_type: "sauce", allowed: false, is_custom: true },
  ];
  it("makes 11 rows of 11 cells in a fixed order", () => {
    const rows = matrixRows(flat);
    expect(rows).toHaveLength(11);
    expect(rows.every((r) => r.cells.length === 11)).toBe(true);
    expect(rows[0]!.from).toBe("coffee_tea");
  });
  it("reads allowed and changed pairs, and treats missing pairs as not allowed", () => {
    const main = matrixRows(flat).find((r) => r.from === "main")!;
    expect(main.cells.find((c) => c.to === "side")).toMatchObject({ allowed: true, custom: false });
    expect(main.cells.find((c) => c.to === "sauce")).toMatchObject({ allowed: false, custom: true });
    expect(main.cells.find((c) => c.to === "dessert")).toMatchObject({ allowed: false, custom: false });
  });
  it("knows when the café changed anything", () => {
    expect(hasCustomRules(matrixRows(flat))).toBe(true);
    expect(hasCustomRules(matrixRows([]))).toBe(false);
  });
});
