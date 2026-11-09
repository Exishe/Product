import { describe, expect, it } from "vitest";
import { addLine, cartSummary, MAX_QUANTITY, setQuantity, toOrderLines, type CartLine, type CartMenu } from "./cart";

const menu: CartMenu = {
  tolma: { price: 3200, soldOut: false, groups: [] },
  trout: { price: 5200, soldOut: true, groups: [] },
  cappuccino: {
    price: 1300,
    soldOut: false,
    groups: [
      { id: "size", min: 1, max: 1, modifiers: [{ id: "s250", delta: 0 }, { id: "s350", delta: 300 }] },
      { id: "milk", min: 0, max: 1, modifiers: [{ id: "oat", delta: 300 }] },
    ],
  },
};

const add = (lines: CartLine[], itemId: string, quantity = 1, modifierIds: string[] = [], note = "") =>
  addLine(lines, { itemId, modifierIds, quantity, note }, () => `line-${lines.length + 1}`);

describe("addLine", () => {
  it("merges the same dish with the same options and note", () => {
    let lines = add([], "tolma");
    lines = add(lines, "tolma", 2);
    expect(lines).toEqual([{ id: "line-1", itemId: "tolma", modifierIds: [], quantity: 3, note: "" }]);
  });

  it("keeps a different note or different options on its own line", () => {
    let lines = add([], "tolma");
    lines = add(lines, "tolma", 1, [], "  առանց սոխի ");
    lines = add(lines, "cappuccino", 1, ["s250"]);
    lines = add(lines, "cappuccino", 1, ["s350"]);
    expect(lines.map((l) => [l.itemId, l.note, l.modifierIds, l.quantity])).toEqual([
      ["tolma", "", [], 1],
      ["tolma", "առանց սոխի", [], 1],
      ["cappuccino", "", ["s250"], 1],
      ["cappuccino", "", ["s350"], 1],
    ]);
  });

  it("caps a line at the most the kitchen accepts and keeps notes to 200 characters", () => {
    let lines = add([], "tolma", 15);
    lines = add(lines, "tolma", 15);
    expect(lines[0]!.quantity).toBe(MAX_QUANTITY);
    expect(add([], "tolma", 1, [], "x".repeat(250))[0]!.note).toHaveLength(200);
  });
});

describe("setQuantity", () => {
  it("changes a line, removes it at zero, and caps it", () => {
    let lines = add(add([], "tolma"), "cappuccino", 1, ["s250"]);
    lines = setQuantity(lines, "line-1", 4);
    expect(lines[0]!.quantity).toBe(4);
    lines = setQuantity(lines, "line-1", 99);
    expect(lines[0]!.quantity).toBe(MAX_QUANTITY);
    lines = setQuantity(lines, "line-1", 0);
    expect(lines.map((l) => l.itemId)).toEqual(["cappuccino"]);
  });
});

describe("cartSummary", () => {
  it("prices lines from the current menu, counts dishes and totals", () => {
    let lines = add([], "tolma", 2);
    lines = add(lines, "cappuccino", 1, ["s350", "oat"]);
    const s = cartSummary(lines, menu);
    expect(s.lines.map((l) => [l.status, l.unitPrice, l.total])).toEqual([
      ["ok", 3200, 6400],
      ["ok", 1900, 1900],
    ]);
    expect(s.total).toBe(8300);
    expect(s.count).toBe(3);
    expect(s.blocked).toBe(false);
  });

  it("leaves sold-out and vanished dishes out of the total and blocks sending", () => {
    let lines = add([], "tolma");
    lines = add(lines, "trout");
    lines = add(lines, "gone");
    const s = cartSummary(lines, menu);
    expect(s.lines.map((l) => l.status)).toEqual(["ok", "sold_out", "unavailable"]);
    expect(s.total).toBe(3200);
    expect(s.count).toBe(1);
    expect(s.blocked).toBe(true);
  });

  it("treats options that no longer fit the dish as unavailable", () => {
    const s = cartSummary(add(add([], "cappuccino", 1, ["s999"]), "cappuccino", 1, []), menu);
    expect(s.lines.map((l) => l.status)).toEqual(["unavailable", "unavailable"]);
  });
});

describe("toOrderLines", () => {
  it("sends ids, quantities, option ids and notes only, never prices", () => {
    let lines = add([], "tolma", 2, [], "առանց սոխի");
    lines = add(lines, "cappuccino", 1, ["s250"]);
    expect(toOrderLines(lines)).toEqual([
      { item_id: "tolma", quantity: 2, modifier_ids: [], note: "առանց սոխի" },
      { item_id: "cappuccino", quantity: 1, modifier_ids: ["s250"] },
    ]);
  });
});
