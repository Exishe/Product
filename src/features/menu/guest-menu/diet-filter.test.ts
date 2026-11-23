import { describe, expect, it } from "vitest";
import { hasDietTags, matchesDiet, type DietFilter } from "./diet-filter";
import type { Allergen } from "./allergens";
import type { GuestTag } from "./view-model";

const dish = (tags: GuestTag[] = [], allergens: Allergen[] = []) => ({ tags, allergens });

describe("matchesDiet", () => {
  it("keeps everything when no chip is chosen", () => {
    expect(matchesDiet(dish(), [])).toBe(true);
  });

  it("matches a tag chip by the tag", () => {
    expect(matchesDiet(dish(["spicy"]), ["spicy"])).toBe(true);
    expect(matchesDiet(dish(["popular"]), ["spicy"])).toBe(false);
    expect(matchesDiet(dish(["chefs_pick"]), ["chefs_pick"])).toBe(true);
    expect(matchesDiet(dish(["new"]), ["new"])).toBe(true);
  });

  it("counts a vegan dish as vegetarian", () => {
    expect(matchesDiet(dish(["vegan"]), ["vegetarian"])).toBe(true);
    expect(matchesDiet(dish(["vegetarian"]), ["vegetarian"])).toBe(true);
    expect(matchesDiet(dish([]), ["vegetarian"])).toBe(false);
  });

  it("derives 'contains nuts' from tree nuts or peanuts, never from silence", () => {
    expect(matchesDiet(dish([], ["nuts"]), ["nuts"])).toBe(true);
    expect(matchesDiet(dish([], ["peanuts", "milk"]), ["nuts"])).toBe(true);
    expect(matchesDiet(dish([], ["milk"]), ["nuts"])).toBe(false);
    expect(matchesDiet(dish([], []), ["nuts"])).toBe(false);
  });

  it("combines chips: a dish must match all of them", () => {
    const both: DietFilter[] = ["vegetarian", "spicy"];
    expect(matchesDiet(dish(["vegetarian", "spicy"]), both)).toBe(true);
    expect(matchesDiet(dish(["vegetarian"]), both)).toBe(false);
    expect(matchesDiet(dish(["spicy"]), both)).toBe(false);
  });
});

describe("hasDietTags", () => {
  it("is true when any dish could be found by a chip", () => {
    expect(hasDietTags([dish(["popular"]), dish(["new"])])).toBe(true);
    expect(hasDietTags([dish([], ["peanuts"])])).toBe(true);
  });
  it("is false when no chip would find anything", () => {
    expect(hasDietTags([dish(["popular"]), dish(["gluten_free"], ["milk"])])).toBe(false);
    expect(hasDietTags([])).toBe(false);
  });
});
