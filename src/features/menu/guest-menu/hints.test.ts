import { describe, expect, it } from "vitest";
import { NO_HINTS, parseHints, waitState } from "./hints";

describe("parseHints", () => {
  it("keeps up to two pairs per dish and a sane wait", () => {
    expect(
      parseHints({
        pairs: { eggs: ["coffee", "tea", "juice"], tea: ["tea", 5, "eggs"], junk: "x" },
        wait: { low: 10, high: 15 },
      }),
    ).toEqual({ pairs: { eggs: ["coffee", "tea"], tea: ["eggs"] }, wait: { low: 10, high: 15 } });
  });

  it("drops what it cannot trust", () => {
    expect(parseHints(null)).toEqual(NO_HINTS);
    expect(parseHints("nope")).toEqual(NO_HINTS);
    expect(parseHints({ pairs: [], wait: { low: 20, high: 10 } })).toEqual(NO_HINTS);
    expect(parseHints({ pairs: {}, wait: { low: 0, high: 10 } })).toEqual(NO_HINTS);
    expect(parseHints({ pairs: {}, wait: { low: 10, high: 999 } })).toEqual(NO_HINTS);
  });
});

describe("waitState", () => {
  const placed = "2026-11-19T10:00:00Z";
  const at = (min: number) => Date.parse(placed) + min * 60_000;
  it("is late only well past the usual range", () => {
    expect(waitState({ low: 10, high: 15 }, placed, at(3))).toBe("usual");
    expect(waitState({ low: 10, high: 15 }, placed, at(20))).toBe("usual");
    expect(waitState({ low: 10, high: 15 }, placed, at(21))).toBe("late");
  });
});
