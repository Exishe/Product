import { describe, expect, it } from "vitest";
import { ageLabel, classifyLateness, elapsedMinutes, HURRY_AFTER_MS, LATE_AFTER_MS } from "./lateness";

const min = (m: number) => m * 60_000;

describe("classifyLateness", () => {
  it("is normal under 8 minutes", () => {
    expect(classifyLateness(0, "new")).toBe("normal");
    expect(classifyLateness(min(7) + 59_999, "cooking")).toBe("normal");
  });

  it("asks to hurry from 8 minutes up to 12", () => {
    expect(HURRY_AFTER_MS).toBe(min(8));
    expect(classifyLateness(min(8), "new")).toBe("hurry");
    expect(classifyLateness(min(11) + 59_999, "cooking")).toBe("hurry");
  });

  it("is late from 12 minutes on", () => {
    expect(LATE_AFTER_MS).toBe(min(12));
    expect(classifyLateness(min(12), "cooking")).toBe("late");
    expect(classifyLateness(min(95), "new")).toBe("late");
  });

  it("never marks ready tickets or cancellations", () => {
    expect(classifyLateness(min(30), "ready")).toBe("normal");
    expect(classifyLateness(min(30), "void")).toBe("normal");
  });

  it("treats a clock that runs behind the ticket as just placed", () => {
    expect(classifyLateness(-5_000, "new")).toBe("normal");
  });
});

describe("elapsedMinutes", () => {
  it("counts whole minutes and never goes below zero", () => {
    expect(elapsedMinutes(-1_000)).toBe(0);
    expect(elapsedMinutes(59_999)).toBe(0);
    expect(elapsedMinutes(60_000)).toBe(1);
    expect(elapsedMinutes(min(12) + 30_000)).toBe(12);
  });
});

describe("ageLabel", () => {
  it("says just now, then minutes up to 99, then whole hours", () => {
    expect(ageLabel(30_000)).toEqual({ unit: "now" });
    expect(ageLabel(min(8))).toEqual({ unit: "minutes", value: 8 });
    expect(ageLabel(min(99) + 59_000)).toEqual({ unit: "minutes", value: 99 });
    expect(ageLabel(min(100))).toEqual({ unit: "hours", value: 1 });
    expect(ageLabel(min(2290))).toEqual({ unit: "hours", value: 38 });
  });
});
