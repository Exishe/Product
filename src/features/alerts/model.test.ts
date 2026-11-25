import { describe, expect, it } from "vitest";
import { dishName, parseAlerts, sameAlerts, type TableAlert } from "./model";

const slow: TableAlert = { reason: "slow", id: "a", table: "5", number: 12, minutes: 27, presses: null };
const calls: TableAlert = { reason: "calls", id: "b", table: "2", number: null, minutes: 6, presses: 3 };

describe("table alerts", () => {
  it("reads the list the database returns", () => {
    expect(parseAlerts([slow, calls])).toEqual([slow, calls]);
    expect(parseAlerts([])).toEqual([]);
  });
  it("treats anything else as no answer, so the last list stays on screen", () => {
    expect(parseAlerts(null)).toBeNull();
    expect(parseAlerts({ error: "x" })).toBeNull();
    expect(parseAlerts([{ ...slow, reason: "other" }])).toBeNull();
  });
  it("compares lists", () => {
    expect(sameAlerts([slow], [{ ...slow }])).toBe(true);
    expect(sameAlerts([slow], [{ ...slow, minutes: 28 }])).toBe(false);
  });
  it("reads a can't-make row with the dish names (ADR-081)", () => {
    const row = { reason: "cant_make", id: "c", table: "4", number: 7, minutes: 0, presses: null, dish: { hy: "Խորոված", en: "Ribs" }, quantity: 2 };
    expect(parseAlerts([row])).toEqual([row]);
  });
  it("names the dish in the screen's language, then Armenian, Russian, English", () => {
    const dish = { hy: "Խորոված", ru: null, en: "Ribs" };
    expect(dishName(dish, "en")).toBe("Ribs");
    expect(dishName(dish, "ru")).toBe("Խորոված");
    expect(dishName(null, "en")).toBe("?");
  });
});
