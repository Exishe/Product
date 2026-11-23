// The 14 allergens EU menus must declare (Regulation 1169/2011, Annex II),
// as stored in items.allergens. Labels live in messages/*.json under
// guest.allergens. An empty list means the café hasn't filled it in, never
// "free of allergens": the guest is told to ask the waiter. Only when the café
// also confirmed the dish (items.allergens_confirmed, ADR-083) does an empty
// list read "no allergens declared by the venue".
export const ALLERGENS = [
  "gluten",
  "crustaceans",
  "eggs",
  "fish",
  "peanuts",
  "soy",
  "milk",
  "nuts",
  "celery",
  "mustard",
  "sesame",
  "sulphites",
  "lupin",
  "molluscs",
] as const;
export type Allergen = (typeof ALLERGENS)[number];

export const isAllergen = (v: unknown): v is Allergen =>
  typeof v === "string" && (ALLERGENS as readonly string[]).includes(v);

/** What the guest's "I avoid…" choice says about one dish. */
export type AllergenMatch =
  | { kind: "none" } // nothing chosen, or the dish is reviewed and none of the avoided is listed
  | { kind: "contains"; allergens: Allergen[] }
  | { kind: "unknown" }; // the café has not reviewed this dish: never shown as safe

export function matchAllergens(
  dish: readonly Allergen[],
  avoid: readonly Allergen[],
  confirmed: boolean = dish.length > 0,
): AllergenMatch {
  if (avoid.length === 0) return { kind: "none" };
  if (!confirmed && dish.length === 0) return { kind: "unknown" };
  const hit = dish.filter((a) => avoid.includes(a));
  return hit.length ? { kind: "contains", allergens: hit } : { kind: "none" };
}

// The guest's choice is about the person, not the café: one key for every
// menu on this phone. Storage can be missing or blocked: then nothing is kept.
const KEY = "pativ:avoid:v1";

export function loadAvoid(storage: Pick<Storage, "getItem"> | null): Allergen[] {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(KEY) ?? "[]");
    return Array.isArray(raw) ? ALLERGENS.filter((a) => raw.includes(a)) : [];
  } catch {
    return [];
  }
}

export function saveAvoid(
  storage: Pick<Storage, "setItem" | "removeItem"> | null,
  avoid: readonly Allergen[],
) {
  try {
    if (avoid.length) storage?.setItem(KEY, JSON.stringify(avoid));
    else storage?.removeItem(KEY);
  } catch {
    // private mode: the choice lasts for this visit only
  }
}
