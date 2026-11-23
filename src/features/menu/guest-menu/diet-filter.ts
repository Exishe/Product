import type { Allergen } from "./allergens";
import type { GuestTag } from "./view-model";

// The "show only" chips of the guest menu (spec 4.2). They only narrow the list
// the guest already has: filtering is client-side over the loaded menu.
// "nuts" is derived from the allergens the venue listed (tree nuts or peanuts);
// a dish whose allergens are not listed never matches it.
export const DIET_FILTERS = ["vegetarian", "spicy", "new", "chefs_pick", "nuts"] as const;
export type DietFilter = (typeof DIET_FILTERS)[number];

export const isDietFilter = (v: unknown): v is DietFilter =>
  typeof v === "string" && (DIET_FILTERS as readonly string[]).includes(v);

type Filterable = { tags: readonly GuestTag[]; allergens: readonly Allergen[] };

function matchesOne(item: Filterable, f: DietFilter): boolean {
  switch (f) {
    case "vegetarian":
      return item.tags.includes("vegetarian") || item.tags.includes("vegan"); // vegan is vegetarian too
    case "nuts":
      return item.allergens.includes("nuts") || item.allergens.includes("peanuts");
    default:
      return item.tags.includes(f);
  }
}

/** A dish stays when it matches every chosen chip (chips combine: vegetarian + spicy = both). */
export function matchesDiet(item: Filterable, chosen: readonly DietFilter[]): boolean {
  return chosen.every((f) => matchesOne(item, f));
}

/** Some dish can be found by a chip: otherwise the filter button isn't worth showing. */
export function hasDietTags(items: Iterable<Filterable>): boolean {
  for (const i of items) if (DIET_FILTERS.some((f) => matchesOne(i, f))) return true;
  return false;
}
