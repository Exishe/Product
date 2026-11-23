// What the guest has accepted (ADR-076). Loaded only when a dish with a replacement
// is on the page, never in the first load.
import { parseSubDetail, type SubInfo } from "./substitutions-parse";

/** What the guest said yes to: one entry per dish and replacement (a different one asks again). */
export const subKey = (s: Pick<SubInfo, "itemId" | "fromId" | "toId" | "delta">) =>
  `${s.itemId}|${s.fromId}|${s.toId}|${s.delta}`;

type Cartish = readonly { itemId: string }[];

/** The substitutions of the dishes in the cart that the guest has not accepted yet, one per dish. */
export function unacked(lines: Cartish, subs: Readonly<Record<string, SubInfo>>, acked: ReadonlySet<string>): SubInfo[] {
  const seen = new Set<string>();
  return lines.flatMap((l) => {
    const s = subs[l.itemId];
    if (!s || seen.has(l.itemId) || acked.has(subKey(s))) return [];
    seen.add(l.itemId);
    return [s];
  });
}

/** `subs_ack` of the order: the replaced ingredient ids of the accepted substitutions in the cart. */
export function ackIds(lines: Cartish, subs: Readonly<Record<string, SubInfo>>, acked: ReadonlySet<string>): string[] {
  const ids = new Set<string>();
  for (const l of lines) {
    const s = subs[l.itemId];
    if (s && acked.has(subKey(s))) ids.add(s.fromId);
  }
  return [...ids].sort();
}

/** The dish's price once this substitution applies; `shownDelta` is what the price on screen already includes. */
export const priceWith = (shownPrice: number, shownDelta: number, delta: number) =>
  Math.max(0, shownPrice - shownDelta + delta);

type StorageLike = Pick<Storage, "getItem" | "setItem">;
const browserSession = (): StorageLike | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null; // storage blocked: kept in memory for this visit
  }
};
const storeKey = (locationId: string) => `pativ:subs-ack:v1:${locationId}`;
const memory = new Map<string, Set<string>>();

/** The accepted substitutions of this visit (sessionStorage; memory when storage is blocked). */
export function loadAcked(storage: StorageLike | null, locationId: string): Set<string> {
  const mem = memory.get(locationId);
  if (mem) return mem;
  let list: string[] = [];
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(storeKey(locationId)) ?? "[]");
    list = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : [];
  } catch {
    // no storage: start empty
  }
  const set = new Set(list);
  memory.set(locationId, set);
  return set;
}

export function addAcked(storage: StorageLike | null, locationId: string, subs: readonly SubInfo[]): Set<string> {
  const set = new Set(loadAcked(storage, locationId));
  for (const s of subs) set.add(subKey(s));
  memory.set(locationId, set);
  try {
    storage?.setItem(storeKey(locationId), JSON.stringify([...set]));
  } catch {
    // kept in memory for this visit
  }
  return set;
}

/** One pop-up entry per substitution, with the dish's name and its price once the replacement applies. */
export function toAsks(
  list: readonly SubInfo[],
  items: Readonly<Record<string, { name: { text: string }; price: number; substitution: { delta: number } | null }>>,
): { sub: SubInfo; name: string; price: number | null }[] {
  return list.map((sub) => {
    const item = items[sub.itemId];
    return {
      sub,
      name: item?.name.text ?? "",
      price: item ? priceWith(item.price, item.substitution?.delta ?? 0, sub.delta) : null,
    };
  });
}

type Dishes = Parameters<typeof toAsks>[1];

/** What to do before sending: the dishes to ask about, and the `subs_ack` of what is already accepted. */
export function plan(
  locationId: string,
  lines: Cartish,
  subs: Readonly<Record<string, SubInfo>>,
  items: Dishes,
): { ask: ReturnType<typeof toAsks>; ack: string[] } {
  const acked = loadAcked(browserSession(), locationId);
  return { ask: toAsks(unacked(lines, subs, acked), items), ack: ackIds(lines, subs, acked) };
}

/** Has the guest accepted this substitution on this visit? */
export const isAccepted = (locationId: string, sub: SubInfo) => loadAcked(browserSession(), locationId).has(subKey(sub));

/** The guest said "Order": remembered for this visit. */
export const accept = (locationId: string, subs: readonly SubInfo[]) => {
  addAcked(browserSession(), locationId, subs);
};

/** A `substitution_changed` refusal: the substitutions the server named and the pop-up entries for them. */
export function refusal(details: string, locale: string, items: Dishes) {
  const named = parseSubDetail(details, locale);
  return named.length ? { subs: Object.fromEntries(named.map((s) => [s.itemId, s])), asks: toAsks(named, items) } : null;
}

/** For tests. */
export const forgetAckMemory = () => memory.clear();
