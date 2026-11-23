import { describe, expect, it } from "vitest";
import { formatKcal } from "./kcal";

describe("formatKcal", () => {
  const tpl = (v: string) => `≈ ${v} kcal`;
  it("always carries the ≈ and rounds to a whole number", () => {
    expect(formatKcal(620, tpl, "en")).toBe("≈ 620 kcal");
    expect(formatKcal(619.6, tpl, "en")).toBe("≈ 620 kcal");
  });
  it("groups thousands for the language", () => {
    expect(formatKcal(1240, tpl, "en")).toBe("≈ 1,240 kcal");
  });
});
