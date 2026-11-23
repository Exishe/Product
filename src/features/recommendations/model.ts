// "Goes well with" editor model (ADR-077): the kinds of dish, search over
// dishes, and the table of what may be suggested after what. Pure functions.

export const ITEM_TYPES = [
  "coffee_tea",
  "cold_drink",
  "alcohol",
  "breakfast",
  "starter_salad",
  "soup",
  "main",
  "side",
  "sauce",
  "dessert",
  "pastry_snack",
] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const isItemType = (v: unknown): v is ItemType => typeof v === "string" && (ITEM_TYPES as readonly string[]).includes(v);

/** At most this many hand-made pairings per dish (the database enforces it too). */
export const MAX_PAIRINGS = 6;

export type Names = { hy: string; ru: string; en: string };
export type Locale = keyof Names;

export type Dish = { id: string; categoryId: string; names: Names; type: ItemType | null };
export type Category = { id: string; names: Names };

/** The name in the owner's language, the Armenian one when it is missing. */
export const nameIn = (names: Names, locale: string): string =>
  (names[locale as Locale] ?? "").trim() || names.hy.trim() || "…";

/** Dishes grouped under their sections, in the section order given. Empty sections are left out. */
export function groupByCategory(dishes: readonly Dish[], categories: readonly Category[]) {
  return categories
    .map((c) => ({ category: c, dishes: dishes.filter((d) => d.categoryId === c.id) }))
    .filter((g) => g.dishes.length > 0);
}

/** Dishes whose name (in any language) contains the text, case-insensitively, minus the excluded ones. */
export function searchDishes(
  dishes: readonly Dish[],
  query: string,
  exclude: ReadonlySet<string>,
  limit = 8,
): Dish[] {
  const q = query.trim().toLowerCase();
  return dishes
    .filter((d) => !exclude.has(d.id))
    .filter((d) => q === "" || [d.names.hy, d.names.ru, d.names.en].some((n) => n.toLowerCase().includes(q)))
    .slice(0, limit);
}

export type MatrixCell = { from_type: string; to_type: string; allowed: boolean; is_custom: boolean };
export type MatrixRow = { from: ItemType; cells: { to: ItemType; allowed: boolean; custom: boolean }[] };

/** The flat answer of api.compat_matrix as one row per "after this kind", every kind in a fixed order. */
export function matrixRows(flat: readonly MatrixCell[]): MatrixRow[] {
  const byPair = new Map(flat.map((c) => [`${c.from_type}>${c.to_type}`, c]));
  return ITEM_TYPES.map((from) => ({
    from,
    cells: ITEM_TYPES.map((to) => {
      const c = byPair.get(`${from}>${to}`);
      return { to, allowed: c?.allowed ?? false, custom: c?.is_custom ?? false };
    }),
  }));
}

export const hasCustomRules = (rows: readonly MatrixRow[]) => rows.some((r) => r.cells.some((c) => c.custom));
