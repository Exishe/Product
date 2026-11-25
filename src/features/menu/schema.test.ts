import { describe, expect, it } from "vitest";
import { dishInput, parseDeltaInput, parsePriceInput } from "./schema";

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

describe("parseDeltaInput", () => {
  it("reads positive, zero and negative price changes", () => {
    expect(parseDeltaInput("300")).toBe(300);
    expect(parseDeltaInput("0")).toBe(0);
    expect(parseDeltaInput("-200")).toBe(-200);
    expect(parseDeltaInput("-1 500 ֏")).toBe(-1500);
    expect(parseDeltaInput("1 000")).toBe(1000);
  });

  it("stays within the database limits of one million either way", () => {
    expect(parseDeltaInput("1000000")).toBe(1_000_000);
    expect(parseDeltaInput("-1000000")).toBe(-1_000_000);
    expect(parseDeltaInput("1000001")).toBeNull();
    expect(parseDeltaInput("-1000001")).toBeNull();
    expect(parseDeltaInput("12345678")).toBeNull();
  });

  it("refuses fractions, a bare sign and words", () => {
    expect(parseDeltaInput("-150.5")).toBeNull();
    expect(parseDeltaInput("-")).toBeNull();
    expect(parseDeltaInput("+200")).toBeNull();
    expect(parseDeltaInput("--200")).toBeNull();
    expect(parseDeltaInput("երկու հարյուր")).toBeNull();
    expect(parseDeltaInput("")).toBeNull();
  });
});

const valid = {
  categoryId: "11111111-1111-4111-8111-111111111111",
  price: 3200,
  names: { hy: "Տոլմա", ru: "Толма", en: "" },
  descriptions: { hy: "", ru: "", en: "" },
  prepAreaId: null,
  tags: ["popular"],
  allergens: ["gluten", "nuts"],
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

  it("takes the diet tags the guest menu shows", () => {
    expect(
      dishInput.safeParse({ ...valid, tags: ["vegetarian", "gluten_free", "lactose_free"] }).success,
    ).toBe(true);
  });

  it("takes the Chef's pick tag", () => {
    expect(dishInput.safeParse({ ...valid, tags: ["chefs_pick", "spicy"] }).success).toBe(true);
    expect(dishInput.safeParse({ ...valid, tags: ["chef_pick"] }).success).toBe(false);
  });

  it("refuses an allergen outside the 14", () => {
    expect(dishInput.safeParse({ ...valid, allergens: ["kryptonite"] }).success).toBe(false);
    expect(dishInput.safeParse({ ...valid, allergens: [] }).success).toBe(true);
  });
});
