import { describe, expect, it } from "vitest";
import { classifyLateness, elapsedMinutes, HURRY_AFTER_MS, LATE_AFTER_MS } from "./lateness";

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
