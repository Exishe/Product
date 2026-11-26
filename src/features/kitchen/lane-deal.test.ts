import { describe, expect, it } from "vitest";
import { dealTickets, laneColumns, stacks } from "./lane-deal";

const ticket = (id: string, lines = 1) => ({
  id,
  kind: "order" as const,
  orderNote: null,
  orderAllergy: false,
  lines: Array.from({ length: lines }, (_, i) => ({
    id: `${id}-${i}`,
    quantity: 1,
    orderedQuantity: 1,
    name: "Tolma",
    nameLocale: "hy" as const,
    note: null,
    modifiers: [],
    allergy: false,
  })),
});

describe("lane deal", () => {
  it("fits as many 20 rem stacks as the lane holds, at least one", () => {
    expect(laneColumns(300, 16)).toBe(1);
    expect(laneColumns(656, 16)).toBe(2);
    expect(laneColumns(655, 16)).toBe(1);
    expect(laneColumns(991, 16)).toBe(2);
    expect(laneColumns(992, 16)).toBe(3);
  });

  it("deals oldest first into the shortest stack", () => {
    const list = [ticket("a", 6), ticket("b", 1), ticket("c", 1), ticket("d", 1)];
    const deal = dealTickets(null, list, 2);
    expect(stacks(deal, list).map((s) => s.map((t) => t.id))).toEqual([["a"], ["b", "c", "d"]]);
  });

  it("keeps every ticket in its stack when another leaves, and returns the same deal when nothing moved", () => {
    const list = [ticket("a"), ticket("b"), ticket("c"), ticket("d")];
    const first = dealTickets(null, list, 2);
    expect(dealTickets(first, list, 2)).toBe(first);
    const after = dealTickets(first, list.slice(1), 2);
    for (const t of list.slice(1)) expect(after.at.get(t.id)).toBe(first.at.get(t.id));
  });

  it("deals again when the number of stacks changes", () => {
    const list = [ticket("a"), ticket("b"), ticket("c")];
    const two = dealTickets(null, list, 2);
    const three = dealTickets(two, list, 3);
    expect(new Set(three.at.values())).toEqual(new Set([0, 1, 2]));
  });
});
