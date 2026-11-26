import { normalizeForSearch } from "@/lib/format/search";
import type { PosProduct, PosTable } from "./adapters/types";

// "Load POS menu": Pativ dishes are matched to POS products by name, in any of
// hy / ru / en, through the same sound key as the guest search («Խորոված»,
// «Хоровац» and "Khorovats" meet). Only a name that points to exactly one POS
// product counts; anything doubtful is left for the owner.

export type PativDish = {
  id: string;
  names: string[];
  modifiers: { id: string; names: string[] }[];
};

export type DishMatch = {
  itemId: string;
  externalId: string;
  externalName: string;
  auto: boolean;
  modifiers: Record<string, { external_id: string; group_id: string | null }>;
};

/** Spaces do not matter: "Ցեզար աղցան" and "Цезарь-салат" differ only by them. */
export function nameKey(name: string): string {
  return normalizeForSearch(name).replace(/\s+/g, "");
}

function uniqueIndex<T>(rows: T[], names: (row: T) => string[]): Map<string, T | null> {
  const index = new Map<string, T | null>();
  for (const row of rows) {
    for (const key of new Set(names(row).map(nameKey).filter(Boolean))) {
      // null marks a key two different rows share: ambiguous, never used.
      index.set(key, index.has(key) && index.get(key) !== row ? null : row);
    }
  }
  return index;
}

function find<T>(index: Map<string, T | null>, names: string[]): T | null {
  const hits = new Set<T>();
  for (const n of names) {
    const hit = index.get(nameKey(n));
    if (hit) hits.add(hit);
  }
  return hits.size === 1 ? ([...hits][0] as T) : null;
}

export function matchModifiers(dish: PativDish, product: PosProduct): DishMatch["modifiers"] {
  const index = uniqueIndex(product.modifiers, (m) => [m.name]);
  const out: DishMatch["modifiers"] = {};
  for (const m of dish.modifiers) {
    const hit = find(index, m.names);
    if (hit) out[m.id] = { external_id: hit.id, group_id: hit.groupId };
  }
  return out;
}

/** Automatic matches for every dish that has one, by name. */
export function autoMatch(dishes: PativDish[], products: PosProduct[]): DishMatch[] {
  const index = uniqueIndex(products, (p) => [p.name]);
  return dishes.flatMap((d) => {
    const hit = find(index, d.names);
    return hit
      ? [{ itemId: d.id, externalId: hit.id, externalName: hit.name, auto: true, modifiers: matchModifiers(d, hit) }]
      : [];
  });
}

/** Saved matches first, then automatic ones for the dishes still open. */
export function mergeMatches(saved: DishMatch[], auto: DishMatch[], products: PosProduct[]): DishMatch[] {
  const known = new Set(products.map((p) => p.id));
  const kept = saved.filter((m) => known.has(m.externalId));
  const done = new Set(kept.map((m) => m.itemId));
  return [...kept, ...auto.filter((m) => !done.has(m.itemId))];
}

/** Pativ tables to POS tables by number or name ("5", "Table 5", "Սեղան 5"). */
export function matchTables(
  tables: { id: string; label: string }[],
  posTables: PosTable[],
): { tableId: string; externalId: string; externalName: string }[] {
  const digits = (s: string) => s.match(/\d+/g)?.join("") ?? null;
  return tables.flatMap((t) => {
    const byName = posTables.filter((p) => nameKey(p.name) === nameKey(t.label));
    const n = digits(t.label);
    const byNumber =
      n === null ? [] : posTables.filter((p) => (p.number !== null ? String(p.number) === n : digits(p.name) === n));
    const pick = byName.length === 1 ? byName[0] : byName.length === 0 && byNumber.length === 1 ? byNumber[0] : null;
    return pick ? [{ tableId: t.id, externalId: pick.id, externalName: pick.name }] : [];
  });
}
