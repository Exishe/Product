import type { CartLine } from "./cart";

// "Last time here": what this phone last sent at this café (any table),
// kept on the phone only: dish and option ids and quantities, no notes, no
// prices, no names. The menu offers it again, checked against today's menu.
export type SavedLine = { itemId: string; modifierIds: string[]; quantity: number };

const DAY = 86_400_000;
/** Older than this, a regular's order isn't "last time" any more. */
export const MAX_AGE_DAYS = 120;

export const lastOrderKey = (locationId: string) => `pativ:last:v1:${locationId}`;

type Get = Pick<Storage, "getItem">;
type Set = Pick<Storage, "setItem">;

export function saveLastOrder(
  storage: Set | null,
  locationId: string,
  lines: readonly CartLine[],
  now = Date.now(),
) {
  const saved: SavedLine[] = lines.map((l) => ({
    itemId: l.itemId,
    modifierIds: [...l.modifierIds],
    quantity: l.quantity,
  }));
  if (!saved.length) return;
  try {
    storage?.setItem(lastOrderKey(locationId), JSON.stringify({ at: now, lines: saved }));
  } catch {
    // storage blocked or full: nothing to offer next time
  }
}

const isSaved = (x: unknown): x is SavedLine => {
  if (typeof x !== "object" || x === null) return false;
  const l = x as Record<string, unknown>;
  return (
    typeof l.itemId === "string" &&
    Array.isArray(l.modifierIds) &&
    l.modifierIds.every((m) => typeof m === "string") &&
    Number.isInteger(l.quantity) &&
    (l.quantity as number) >= 1
  );
};

export function loadLastOrder(storage: Get | null, locationId: string, now = Date.now()): SavedLine[] {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(lastOrderKey(locationId)) ?? "null");
    if (typeof raw !== "object" || raw === null) return [];
    const { at, lines } = raw as { at?: unknown; lines?: unknown };
    if (typeof at !== "number" || now - at > MAX_AGE_DAYS * DAY || !Array.isArray(lines)) return [];
    return lines.filter(isSaved);
  } catch {
    return [];
  }
}

/** Whether there is anything saved, without parsing it (the menu's first check). */
export function hasLastOrder(storage: Get | null, locationId: string): boolean {
  try {
    return Boolean(storage?.getItem(lastOrderKey(locationId)));
  } catch {
    return false;
  }
}
