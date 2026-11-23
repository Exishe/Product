import { describe, expect, it } from "vitest";
import { backoffMs, parseStatus, sameStatus } from "./status";
import { hhmm, inDailyWindow, localMinutes, validWindow } from "./window";

describe("parseStatus", () => {
  it("reads the status and sorts the id lists", () => {
    const s = parseStatus({
      version: 3,
      ordering: true,
      paused: { until: "2026-11-23T10:00:00Z" },
      closed: null,
      sold_out: ["b", "a"],
      hidden_categories: ["z", "y"],
      kitchen_busy: { until: "x", expected_wait_minutes: 20 },
    });
    expect(s).toEqual({
      version: 3,
      ordering: true,
      paused: { until: "2026-11-23T10:00:00Z" },
      closed: null,
      soldOut: ["a", "b"],
      hidden: ["y", "z"],
      busy: 20,
      promos: [],
    });
  });
  it("reads live promos and drops broken ones", () => {
    const s = parseStatus({
      promos: [
        { id: "p1", title: { hy: "Ակցիա", xx: "no", ru: " " }, text: { en: "Coffee" }, badge: "-20%" },
        { id: "p2", title: {}, text: {}, badge: null },
        { title: { hy: "x" } },
        "junk",
      ],
    });
    expect(s?.promos).toEqual([{ id: "p1", title: { hy: "Ակցիա" }, text: { en: "Coffee" }, badge: "-20%" }]);
  });
  it("a database without promos reads as none, and a new promo makes the status differ", () => {
    const before = parseStatus({ ordering: true }) as NonNullable<ReturnType<typeof parseStatus>>;
    expect(before.promos).toEqual([]);
    const after = parseStatus({ ordering: true, promos: [{ id: "p1", title: { hy: "A" } }] }) as typeof before;
    expect(sameStatus(before, after)).toBe(false);
  });
  it("an open-ended pause has no end", () => {
    expect(parseStatus({ paused: { until: null } })?.paused).toEqual({ until: null });
  });
  it("an older database without the new fields reads as nothing to show", () => {
    const s = parseStatus({ ordering: true, sold_out: [] }, 7);
    expect(s).toMatchObject({ version: 7, paused: null, closed: null, hidden: [] });
  });
  it("rejects what is not an object", () => {
    expect(parseStatus(null)).toBeNull();
    expect(parseStatus("x")).toBeNull();
  });
});

describe("sameStatus", () => {
  it("does not care about list order", () => {
    const a = parseStatus({ sold_out: ["a", "b"] });
    const b = parseStatus({ sold_out: ["b", "a"] });
    expect(a && b && sameStatus(a, b)).toBe(true);
  });
  it("sees a change", () => {
    const a = parseStatus({ sold_out: ["a"] });
    const b = parseStatus({ sold_out: ["a"], paused: { until: null } });
    expect(a && b && sameStatus(a, b)).toBe(false);
  });
});

describe("backoffMs", () => {
  it("grows and stops at a minute", () => {
    expect(backoffMs(0)).toBe(10_000);
    expect(backoffMs(1)).toBe(20_000);
    expect(backoffMs(9)).toBe(60_000);
  });
});

describe("inDailyWindow", () => {
  it("is [from, to)", () => {
    expect(inDailyWindow(8 * 60, "08:00", "12:00")).toBe(true);
    expect(inDailyWindow(12 * 60, "08:00", "12:00")).toBe(false);
    expect(inDailyWindow(7 * 60 + 59, "08:00", "12:00")).toBe(false);
  });
  it("may span midnight", () => {
    expect(inDailyWindow(23 * 60, "22:00", "02:00")).toBe(true);
    expect(inDailyWindow(60, "22:00", "02:00")).toBe(true);
    expect(inDailyWindow(12 * 60, "22:00", "02:00")).toBe(false);
  });
  it("no window is always open", () => {
    expect(inDailyWindow(0, null, null)).toBe(true);
  });
});

describe("window helpers", () => {
  it("hhmm trims seconds", () => {
    expect(hhmm("08:00:00")).toBe("08:00");
    expect(hhmm(null)).toBe("");
  });
  it("validWindow needs two different times", () => {
    expect(validWindow("08:00", "12:00")).toBe(true);
    expect(validWindow("08:00", "08:00")).toBe(false);
    expect(validWindow("", "12:00")).toBe(false);
  });
  it("localMinutes reads the café's wall clock", () => {
    expect(localMinutes(new Date("2026-11-23T10:30:00Z"), "Asia/Yerevan")).toBe(14 * 60 + 30);
    expect(localMinutes(new Date("2026-11-23T10:30:00Z"), "Pacific/Kiritimati")).toBe(0 * 60 + 30);
  });
});
