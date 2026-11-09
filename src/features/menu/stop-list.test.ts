import { describe, expect, it } from "vitest";
import { endOfBusinessDay } from "./stop-list";

describe("endOfBusinessDay", () => {
  it("ends at 05:00 Yerevan time the next morning when marked in the evening", () => {
    // 20:00 Yerevan = 16:00 UTC; the business day ends 05:00 Yerevan = 01:00 UTC next day
    expect(endOfBusinessDay(new Date("2026-11-13T16:00:00Z")).toISOString()).toBe("2026-11-14T01:00:00.000Z");
  });

  it("ends at 05:00 the same morning when marked after midnight", () => {
    // 01:30 Yerevan = 21:30 UTC the day before
    expect(endOfBusinessDay(new Date("2026-11-13T21:30:00Z")).toISOString()).toBe("2026-11-14T01:00:00.000Z");
  });

  it("rolls to the next day exactly at the boundary", () => {
    expect(endOfBusinessDay(new Date("2026-11-14T01:00:00Z")).toISOString()).toBe("2026-11-15T01:00:00.000Z");
  });
});
