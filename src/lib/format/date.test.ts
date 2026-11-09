import { describe, expect, it } from "vitest";
import { formatDate, formatTime } from "./date";

// 18:45 UTC is 22:45 in Yerevan (UTC+4, no daylight saving).
const evening = new Date("2026-11-13T18:45:00Z");
// 20:30 UTC is already 00:30 the next day in Yerevan.
const afterMidnight = new Date("2026-11-13T20:30:00Z");

describe("formatTime", () => {
  it("uses 24-hour Yerevan time", () => {
    expect(formatTime(evening)).toBe("22:45");
  });

  it("pads hours after midnight", () => {
    expect(formatTime(afterMidnight)).toBe("00:30");
  });
});

describe("formatDate", () => {
  it("writes dd.mm.yyyy in Armenian and Russian", () => {
    expect(formatDate(evening, "hy")).toBe("13.11.2026");
    expect(formatDate(evening, "ru")).toBe("13.11.2026");
  });

  it("writes 13 Nov 2026 in English", () => {
    expect(formatDate(evening, "en")).toBe("13 Nov 2026");
  });

  it("uses the Yerevan calendar day, not UTC", () => {
    expect(formatDate(afterMidnight, "hy")).toBe("14.11.2026");
  });
});
