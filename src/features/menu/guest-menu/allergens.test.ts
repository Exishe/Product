import { describe, expect, it } from "vitest";
import { loadAvoid, matchAllergens, saveAvoid } from "./allergens";

describe("matchAllergens", () => {
  it("says nothing while the guest avoids nothing", () => {
    expect(matchAllergens(["milk"], [])).toEqual({ kind: "none" });
    expect(matchAllergens([], [])).toEqual({ kind: "none" });
  });

  it("names exactly the avoided allergens a dish lists", () => {
    expect(matchAllergens(["gluten", "milk", "eggs"], ["milk", "nuts", "gluten"])).toEqual({
      kind: "contains",
      allergens: ["gluten", "milk"],
    });
    expect(matchAllergens(["eggs"], ["milk"])).toEqual({ kind: "none" });
  });

  it("never calls a dish without allergen data safe", () => {
    expect(matchAllergens([], ["milk"])).toEqual({ kind: "unknown" });
  });
});

describe("loadAvoid / saveAvoid", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
      size: () => m.size,
    };
  };

  it("round-trips the choice and forgets it when cleared", () => {
    const s = memory();
    saveAvoid(s, ["nuts", "milk"]);
    expect(loadAvoid(s)).toEqual(["milk", "nuts"]);
    saveAvoid(s, []);
    expect(s.size()).toBe(0);
    expect(loadAvoid(s)).toEqual([]);
  });

  it("ignores junk and survives storage that throws", () => {
    const s = memory();
    s.setItem("pativ:avoid:v1", '["milk","poison",3]');
    expect(loadAvoid(s)).toEqual(["milk"]);
    s.setItem("pativ:avoid:v1", "{not json");
    expect(loadAvoid(s)).toEqual([]);
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadAvoid(broken)).toEqual([]);
    expect(() => saveAvoid(broken, ["milk"])).not.toThrow();
    expect(loadAvoid(null)).toEqual([]);
  });
});
