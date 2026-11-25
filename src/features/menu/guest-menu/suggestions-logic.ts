// "Goes well with" (ADR-077, guest side): pure rules for the suggestion strip.
// The server already filters (api.public_suggestions); this re-checks against
// the menu the page has loaded, because that data can be newer (stop list) or
// the answer can come from a cache. Nothing here touches the browser except
// the one fetch, so it is easy to test.
import type { GuestItem } from "./view-model";

export const MAX_SUGGESTIONS = 3;
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
export const REASONS = ["pairs_with_dish", "perfect_with_type", "often_together", "time_rule"] as const;
export type Reason = (typeof REASONS)[number];

export type Suggestion = {
  itemId: string;
  reason: Reason;
  withItemId: string | null;
  withType: ItemType | null;
};

const isType = (x: unknown): x is ItemType => typeof x === "string" && (ITEM_TYPES as readonly string[]).includes(x);
const isReason = (x: unknown): x is Reason => typeof x === "string" && (REASONS as readonly string[]).includes(x);
const str = (x: unknown) => (typeof x === "string" && x.length > 0 && x.length <= 64 ? x : null);

/** The function's JSON, checked: anything unexpected is dropped; at most three, no dish twice. */
export function parseSuggestions(raw: unknown): Suggestion[] {
  const list = (raw as { suggestions?: unknown } | null)?.suggestions;
  if (!Array.isArray(list)) return [];
  const out: Suggestion[] = [];
  for (const row of list) {
    if (typeof row !== "object" || row === null) continue;
    const r = row as Record<string, unknown>;
    const itemId = str(r.item_id);
    if (!itemId || !isReason(r.reason) || out.some((s) => s.itemId === itemId)) continue;
    out.push({
      itemId,
      reason: r.reason,
      withItemId: str(r.with_item_id),
      withType: isType(r.with_type) ? r.with_type : null,
    });
    if (out.length === MAX_SUGGESTIONS) break;
  }
  return out;
}

export type Card = { item: GuestItem; suggestion: Suggestion };

/**
 * What may be shown now: dishes on the loaded menu that can be ordered, not
 * sold out, not made with a replacement, not in the cart, not the dish just
 * added, not dismissed. Order is the server's.
 */
export function selectCards(
  list: readonly Suggestion[],
  items: Readonly<Record<string, GuestItem>>,
  o: { triggerId: string; cartIds: readonly string[]; soldOut: readonly string[]; dismissed: ReadonlySet<string> },
): Card[] {
  const cards: Card[] = [];
  for (const suggestion of list) {
    const item = items[suggestion.itemId];
    if (
      !item ||
      item.soldOut ||
      item.substitution ||
      item.id === o.triggerId ||
      o.cartIds.includes(item.id) ||
      o.soldOut.includes(item.id) ||
      o.dismissed.has(item.id)
    )
      continue;
    cards.push({ item, suggestion });
    if (cards.length === MAX_SUGGESTIONS) break;
  }
  return cards;
}

/** The message key (under `guest.suggest`) and variables for a card's reason line. */
export function reasonText(
  s: Suggestion,
  items: Readonly<Record<string, GuestItem>>,
  triggerId: string,
): { key: string; vars?: { name: string } } {
  switch (s.reason) {
    case "pairs_with_dish": {
      const name = items[s.withItemId ?? triggerId]?.name.text ?? items[triggerId]?.name.text;
      return name ? { key: "suggest.reason.pairs_with_dish", vars: { name } } : { key: "suggest.reason.generic" };
    }
    case "perfect_with_type":
      return s.withType ? { key: `suggest.perfect.${s.withType}` } : { key: "suggest.reason.generic" };
    case "often_together":
      return { key: "suggest.reason.often_together" };
    case "time_rule":
      return { key: "suggest.reason.time_rule" };
  }
}

// What this visit has already done, so the strip stays calm: a dish that
// triggered suggestions once does not trigger them again, a dismissed dish is
// not offered again, and a (dish, suggestion) pair is counted as shown once.
type Saved = { trig: string[]; dis: string[]; shown: string[] };
const CAP = 80;
type Store = Pick<Storage, "getItem" | "setItem">;

export function createVisitMemory(locationId: string, store: Store | null) {
  const key = `pativ:sugg:v1:${locationId}`;
  const empty = (): Saved => ({ trig: [], dis: [], shown: [] });
  let data = empty();
  try {
    const raw = JSON.parse(store?.getItem(key) ?? "null") as Partial<Saved> | null;
    const list = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string").slice(-CAP) : []);
    if (raw) data = { trig: list(raw.trig), dis: list(raw.dis), shown: list(raw.shown) };
  } catch {}
  const save = () => {
    try {
      store?.setItem(key, JSON.stringify(data));
    } catch {}
  };
  const add = (name: keyof Saved, id: string) => {
    if (data[name].includes(id)) return;
    data = { ...data, [name]: [...data[name], id].slice(-CAP) };
    save();
  };
  return {
    wasTriggered: (id: string) => data.trig.includes(id),
    markTriggered: (id: string) => add("trig", id),
    dismiss: (id: string) => add("dis", id),
    dismissed: () => new Set(data.dis),
    wasShown: (from: string, id: string) => data.shown.includes(`${from}>${id}`),
    markShown: (from: string, id: string) => add("shown", `${from}>${id}`),
  };
}
export type VisitMemory = ReturnType<typeof createVisitMemory>;

/** One plain fetch of the RPC (no Supabase client on the guest path). Resolves to null when anything goes wrong. */
export async function fetchSuggestions(
  locationId: string,
  itemId: string,
  cartIds: readonly string[],
  signal?: AbortSignal,
): Promise<Suggestion[] | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/public_suggestions`, {
      method: "POST",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
        "Content-Type": "application/json",
        "Content-Profile": "api",
      },
      body: JSON.stringify({ p_location_id: locationId, p_item_id: itemId, p_cart_item_ids: cartIds }),
      cache: "no-store",
      signal: signal ?? AbortSignal.timeout(6_000),
    });
    return res.ok ? parseSuggestions(await res.json()) : null;
  } catch {
    return null;
  }
}
