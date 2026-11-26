import { describe, expect, it } from "vitest";
import type { PosProduct } from "./adapters/types";
import { autoMatch, matchTables, mergeMatches, nameKey } from "./match";

const products: PosProduct[] = [
  { id: "p1", name: "Хоровац из курицы", modifiers: [{ id: "m1", groupId: "g", name: "Большой" }, { id: "m2", groupId: "g", name: "Big" }] },
  { id: "p2", name: "Tolma", modifiers: [] },
  { id: "p3", name: "Cappuccino", modifiers: [] },
  { id: "p4", name: "Капучино", modifiers: [] }, // a second product with the same sound
  { id: "p5", name: "Jermuk", modifiers: [] },
];

describe("dish matcher", () => {
  it("normalizes across scripts and spaces", () => {
    expect(nameKey("Տոլմա")).toBe(nameKey("Tolma"));
    expect(nameKey("Толма")).toBe(nameKey("tolma"));
    expect(nameKey("«Ջերմուկ»")).toBe(nameKey("Джермук"));
  });

  it("matches by any of the dish's names, and its options", () => {
    const m = autoMatch(
      [
        {
          id: "d1",
          names: ["Հավի խորոված", "Хоровац из курицы", "Chicken khorovats"],
          modifiers: [{ id: "mod-big", names: ["Մեծ", "Большой", "Big"] }],
        },
        { id: "d2", names: ["Տոլմա"], modifiers: [] },
        { id: "d3", names: ["Կապուչինո", "Капучино", "Cappuccino"], modifiers: [] },
        { id: "d4", names: ["Գաթա"], modifiers: [] },
        { id: "d5", names: ["«Ջերմուկ» հանքային ջուր", "Jermuk"], modifiers: [] },
      ],
      products,
    );
    const by = Object.fromEntries(m.map((x) => [x.itemId, x]));
    expect(by.d1).toMatchObject({ externalId: "p1", auto: true });
    expect(by.d2).toMatchObject({ externalId: "p2" });
    expect(by.d3).toBeUndefined(); // two POS products sound the same: the owner decides
    expect(by.d4).toBeUndefined();
    expect(by.d5).toMatchObject({ externalId: "p5" });
    // "Большой" and "Big" are two options: ambiguous, so the option stays open.
    expect(by.d1!.modifiers).toEqual({});
  });

  it("matches an option when only one fits", () => {
    const m = autoMatch(
      [{ id: "d1", names: ["Хоровац из курицы"], modifiers: [{ id: "mod-big", names: ["Մեծ", "Большой"] }] }],
      products,
    );
    expect(m[0]!.modifiers).toEqual({ "mod-big": { external_id: "m1", group_id: "g" } });
  });

  it("keeps the owner's saved matches over automatic ones", () => {
    const saved = [{ itemId: "d2", externalId: "p5", externalName: "Jermuk", auto: false, modifiers: {} }];
    const gone = [{ itemId: "d9", externalId: "deleted", externalName: "x", auto: false, modifiers: {} }];
    const auto = [
      { itemId: "d2", externalId: "p2", externalName: "Tolma", auto: true, modifiers: {} },
      { itemId: "d1", externalId: "p1", externalName: "Хоровац", auto: true, modifiers: {} },
    ];
    expect(mergeMatches([...saved, ...gone], auto, products).map((m) => [m.itemId, m.externalId])).toEqual([
      ["d2", "p5"],
      ["d1", "p1"],
    ]);
  });

  it("matches tables by name or number", () => {
    const pos = [
      { id: "a", name: "Table 1", number: 1, section: "Hall" },
      { id: "b", name: "Терраса 2", number: 12, section: "Terrace" },
      { id: "c", name: "VIP", number: 30, section: null },
    ];
    expect(
      matchTables(
        [
          { id: "t1", label: "1" },
          { id: "t12", label: "12" },
          { id: "vip", label: "VIP" },
          { id: "t7", label: "7" },
        ],
        pos,
      ),
    ).toEqual([
      { tableId: "t1", externalId: "a", externalName: "Table 1" },
      { tableId: "t12", externalId: "b", externalName: "Терраса 2" },
      { tableId: "vip", externalId: "c", externalName: "VIP" },
    ]);
  });
});
