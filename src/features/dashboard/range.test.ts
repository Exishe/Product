import { describe, expect, it } from "vitest";
import { addDays, businessDate, resolveRange } from "./range";

describe("businessDate", () => {
  it("is the calendar date in Yerevan after the day starts", () => {
    // 10:00 UTC = 14:00 Yerevan
    expect(businessDate(new Date("2026-11-13T10:00:00Z"), "Asia/Yerevan", "05:00:00")).toBe("2026-11-13");
  });

  it("still belongs to yesterday before the day starts", () => {
    // 22:30 UTC = 02:30 Yerevan on the 14th, before the 05:00 start
    expect(businessDate(new Date("2026-11-13T22:30:00Z"), "Asia/Yerevan", "05:00:00")).toBe("2026-11-13");
  });

  it("rolls over at the start", () => {
    // 01:00 UTC = 05:00 Yerevan
    expect(businessDate(new Date("2026-11-14T01:00:00Z"), "Asia/Yerevan", "05:00")).toBe("2026-11-14");
  });
});

describe("addDays", () => {
  it("crosses months and years", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("resolveRange", () => {
  const today = "2026-11-13";

  it("defaults to today", () => {
    expect(resolveRange({}, today)).toEqual({ preset: "today", from: today, to: today });
  });

  it("knows the presets", () => {
    expect(resolveRange({ range: "yesterday" }, today)).toEqual({
      preset: "yesterday",
      from: "2026-11-12",
      to: "2026-11-12",
    });
    expect(resolveRange({ range: "7d" }, today)).toEqual({ preset: "7d", from: "2026-11-07", to: today });
    expect(resolveRange({ range: "30d" }, today)).toEqual({ preset: "30d", from: "2026-10-15", to: today });
  });

  it("takes a custom range", () => {
    expect(resolveRange({ from: "2026-11-01", to: "2026-11-05" }, today)).toEqual({
      preset: "custom",
      from: "2026-11-01",
      to: "2026-11-05",
    });
  });

  it("swaps a reversed range and clamps the end to today", () => {
    expect(resolveRange({ from: "2026-11-05", to: "2026-11-01" }, today)).toMatchObject({
      from: "2026-11-01",
      to: "2026-11-05",
    });
    expect(resolveRange({ from: "2026-11-10", to: "2026-12-01" }, today)).toMatchObject({
      from: "2026-11-10",
      to: today,
    });
  });

  it("limits a range to 92 days, keeping the end", () => {
    expect(resolveRange({ from: "2026-01-01", to: "2026-11-13" }, today)).toMatchObject({
      from: "2026-08-14",
      to: today,
    });
  });

  it("ignores junk", () => {
    expect(resolveRange({ range: "forever", from: "2026-13-45", to: "x" }, today)).toEqual({
      preset: "today",
      from: today,
      to: today,
    });
  });
});
