import { describe, expect, it } from "vitest";
import { dishInput, parsePriceInput } from "./schema";

describe("parsePriceInput", () => {
  it("reads whole drams typed with or without spaces", () => {
    expect(parsePriceInput("2500")).toBe(2500);
    expect(parsePriceInput("2 500")).toBe(2500);
    expect(parsePriceInput("2 500 ֏")).toBe(2500);
  });

  it("refuses fractions, negatives and words", () => {
    expect(parsePriceInput("1500.5")).toBeNull();
    expect(parsePriceInput("1500,5")).toBeNull();
    expect(parsePriceInput("-100")).toBeNull();
    expect(parsePriceInput("երկու հազար")).toBeNull();
    expect(parsePriceInput("")).toBeNull();
  });
});

const valid = {
  categoryId: "11111111-1111-4111-8111-111111111111",
  price: 3200,
  names: { hy: "Տոլմա", ru: "Толма", en: "" },
  descriptions: { hy: "", ru: "", en: "" },
  prepAreaId: null,
  tags: ["popular"],
  modifierGroupIds: [],
  markReviewed: false,
};

describe("dishInput", () => {
  it("accepts a dish with an Armenian name and a whole price", () => {
    expect(dishInput.safeParse(valid).success).toBe(true);
  });

  it("needs an Armenian name", () => {
    expect(dishInput.safeParse({ ...valid, names: { hy: "  ", ru: "Толма", en: "" } }).success).toBe(false);
  });

  it("refuses a price above 10 million or in fractions", () => {
    expect(dishInput.safeParse({ ...valid, price: 10_000_001 }).success).toBe(false);
    expect(dishInput.safeParse({ ...valid, price: 1500.5 }).success).toBe(false);
  });

  it("refuses a tag outside the list", () => {
    expect(dishInput.safeParse({ ...valid, tags: ["cheap"] }).success).toBe(false);
  });
});
