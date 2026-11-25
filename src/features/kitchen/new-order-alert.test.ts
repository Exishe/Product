import { describe, expect, it } from "vitest";
import {
  alertEntries,
  entryLabel,
  MAX_SHOWN,
  mergeAlert,
  pruneAlert,
  summarizeAlert,
  type NewOrderAlert,
} from "./new-order-alert";

const order = (
  id: string,
  number: number,
  extra: Partial<Parameters<typeof alertEntries>[0][number]> = {},
) => ({
  id,
  kind: "order" as const,
  status: "new" as const,
  number,
  table: String(number),
  allergy: false,
  ...extra,
});

describe("alertEntries", () => {
  it("keeps orders in New and leaves out cancellations and started orders", () => {
    const got = alertEntries([
      order("a", 1),
      order("v", 2, { kind: "void" }),
      order("c", 3, { status: "cooking" }),
    ]);
    expect(got.map((x) => x.id)).toEqual(["a"]);
  });

  it("carries the allergy flag, table and number", () => {
    expect(alertEntries([order("a", 12, { table: "4", allergy: true })])).toEqual([
      { id: "a", number: 12, table: "4", allergy: true },
    ]);
  });
});

describe("mergeAlert", () => {
  it("opens nothing for a cancellation alone", () => {
    expect(mergeAlert(null, [order("v", 1, { kind: "void" })])).toBeNull();
  });

  it("opens a banner for a new order", () => {
    expect(mergeAlert(null, [order("a", 1)])?.entries).toHaveLength(1);
  });

  it("adds later arrivals to the open banner, in arrival order", () => {
    const open = mergeAlert(null, [order("a", 1)]);
    const next = mergeAlert(open, [order("b", 2), order("c", 3)]);
    expect(next?.entries.map((x) => x.id)).toEqual(["a", "b", "c"]);
  });

  it("does not add a ticket twice and keeps the same object when nothing changed", () => {
    const open = mergeAlert(null, [order("a", 1)]);
    expect(mergeAlert(open, [order("a", 1)])).toBe(open);
    expect(mergeAlert(open, [])).toBe(open);
  });
});

describe("pruneAlert", () => {
  const open = mergeAlert(null, [order("a", 1), order("b", 2)]) as NewOrderAlert;

  it("keeps the banner while its orders still wait in New", () => {
    expect(
      pruneAlert(open, [
        { id: "a", status: "new" },
        { id: "b", status: "new" },
      ]),
    ).toBe(open);
  });

  it("drops orders that were started or are gone", () => {
    const got = pruneAlert(open, [
      { id: "a", status: "cooking" },
      { id: "b", status: "new" },
    ]);
    expect(got?.entries.map((x) => x.id)).toEqual(["b"]);
  });

  it("closes the banner when nothing is left, and stays closed", () => {
    expect(pruneAlert(open, [])).toBeNull();
    expect(pruneAlert(null, [])).toBeNull();
  });
});

describe("summarizeAlert", () => {
  it("shows every order up to the limit", () => {
    const s = summarizeAlert({ entries: alertEntries([order("a", 1), order("b", 2)]) });
    expect(s).toMatchObject({ count: 2, more: 0, allergy: false });
    expect(s.shown).toHaveLength(2);
  });

  it("says how many more past the limit", () => {
    const many = alertEntries(Array.from({ length: MAX_SHOWN + 3 }, (_, i) => order(`t${i}`, i + 1)));
    const s = summarizeAlert({ entries: many });
    expect(s.count).toBe(MAX_SHOWN + 3);
    expect(s.shown).toHaveLength(MAX_SHOWN);
    expect(s.more).toBe(3);
  });

  it("flags an allergy anywhere in the banner, even past the shown ones", () => {
    const entries = alertEntries([
      ...Array.from({ length: MAX_SHOWN }, (_, i) => order(`t${i}`, i + 1)),
      order("x", 99, { allergy: true }),
    ]);
    expect(summarizeAlert({ entries }).allergy).toBe(true);
  });
});

describe("entryLabel", () => {
  const tableLabel = (t: string) => `Սեղան ${t}`;
  it("joins table and number", () => {
    expect(entryLabel({ id: "a", number: 12, table: "4", allergy: false }, tableLabel)).toBe("Սեղան 4 · #12");
  });
  it("is just the number without a table", () => {
    expect(entryLabel({ id: "a", number: 12, table: null, allergy: false }, tableLabel)).toBe("#12");
  });
});
