import { describe, expect, it } from "vitest";
import { nextBusinessDayStart } from "./business-day";

const iso = (d: Date) => d.toISOString();

describe("nextBusinessDayStart", () => {
  it("ends an evening's stop list at 05:00 Yerevan time the next morning", () => {
    expect(iso(nextBusinessDayStart(new Date("2026-11-13T18:30:00Z"), "Asia/Yerevan", "05:00:00"))).toBe("2026-11-14T01:00:00.000Z");
  });

  it("keeps an after-midnight order in the same business day", () => {
    expect(iso(nextBusinessDayStart(new Date("2026-11-13T23:30:00Z"), "Asia/Yerevan", "05:00:00"))).toBe("2026-11-14T01:00:00.000Z");
  });

  it("starts counting the next day from the start time itself", () => {
    expect(iso(nextBusinessDayStart(new Date("2026-11-14T01:00:00Z"), "Asia/Yerevan", "05:00:00"))).toBe("2026-11-15T01:00:00.000Z");
  });

  it("follows the location's own start time and time zone, across a clock change", () => {
    expect(iso(nextBusinessDayStart(new Date("2026-11-13T18:30:00Z"), "Asia/Yerevan", "06:30"))).toBe("2026-11-14T02:30:00.000Z");
    // Berlin moves to summer time on 29 March 2026: 05:00 that morning is 03:00 UTC.
    expect(iso(nextBusinessDayStart(new Date("2026-03-28T22:00:00Z"), "Europe/Berlin", "05:00:00"))).toBe("2026-03-29T03:00:00.000Z");
  });
});
