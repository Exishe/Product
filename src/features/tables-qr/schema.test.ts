import { describe, expect, it } from "vitest";
import { nextTableLabel, sortTables, tableInput, toSheets } from "./schema";

describe("tableInput", () => {
  it("accepts a number or short name and a seat count", () => {
    expect(tableInput.parse({ label: " 5 ", seats: "4", areaId: "" })).toEqual({ label: "5", seats: 4, areaId: null });
    expect(tableInput.parse({ label: "Բար 2", seats: 2, areaId: "86b7272c-0be0-4a7b-9e13-1ff42141e27c" }).areaId).toBe(
      "86b7272c-0be0-4a7b-9e13-1ff42141e27c",
    );
  });

  it("rejects an empty or too long label and impossible seat counts", () => {
    expect(tableInput.safeParse({ label: "  ", seats: 2 }).success).toBe(false);
    expect(tableInput.safeParse({ label: "1234567890123", seats: 2 }).success).toBe(false);
    expect(tableInput.safeParse({ label: "1", seats: 0 }).success).toBe(false);
    expect(tableInput.safeParse({ label: "1", seats: 51 }).success).toBe(false);
    expect(tableInput.safeParse({ label: "1", seats: 2.5 }).success).toBe(false);
    expect(tableInput.safeParse({ label: "1", seats: 2, areaId: "not-a-uuid" }).success).toBe(false);
  });
});

describe("nextTableLabel", () => {
  it("suggests the number after the highest numbered table", () => {
    expect(nextTableLabel([])).toBe("1");
    expect(nextTableLabel(["1", "2", "10", "Բար"])).toBe("11");
    expect(nextTableLabel(["Բար", "Պատշգամբ"])).toBe("3");
  });
});

describe("sortTables", () => {
  it("orders numbers numerically, then names", () => {
    const rows = ["10", "Բար", "2", "1"].map((label) => ({ label }));
    expect(sortTables(rows).map((r) => r.label)).toEqual(["1", "2", "10", "Բար"]);
  });
});

describe("toSheets", () => {
  it("puts four cards on an A4 sheet", () => {
    const cards = Array.from({ length: 12 }, (_, i) => i + 1);
    expect(toSheets(cards).map((s) => s.length)).toEqual([4, 4, 4]);
    expect(toSheets([1, 2, 3, 4, 5]).map((s) => s.length)).toEqual([4, 1]);
    expect(toSheets([])).toEqual([]);
  });
});
