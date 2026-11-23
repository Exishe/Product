import { describe, expect, it } from "vitest";
import { pickIngredientName } from "./names";

describe("pickIngredientName", () => {
  const names = { hy: "Կաթ", ru: "Молоко", en: " " };

  it("uses the reader's language", () => {
    expect(pickIngredientName(names, "ru")).toBe("Молоко");
  });

  it("falls back to Armenian when a translation is blank or missing", () => {
    expect(pickIngredientName(names, "en")).toBe("Կաթ");
    expect(pickIngredientName({ hy: "Կաթ" }, "ru")).toBe("Կաթ");
  });

  it("copes with a missing or odd value", () => {
    expect(pickIngredientName(null, "hy")).toBe("");
    expect(pickIngredientName("Կաթ", "hy")).toBe("");
  });
});
