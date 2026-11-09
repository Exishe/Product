import { useCallback, useSyncExternalStore } from "react";
import type { CartLine } from "./cart";

// One cart per location and table, kept in localStorage so it survives a
// reload, a language switch or a lost connection. Storage can be missing or
// blocked (private mode): the cart then lives in memory for this visit.
export const cartKey = (locationId: string, tableId: string | null) => `pativ:cart:v1:${locationId}:${tableId ?? "menu"}`;

const isLine = (x: unknown): x is CartLine => {
  if (typeof x !== "object" || x === null) return false;
  const l = x as Record<string, unknown>;
  return (
    typeof l.id === "string" &&
    typeof l.itemId === "string" &&
    Array.isArray(l.modifierIds) &&
    l.modifierIds.every((m) => typeof m === "string") &&
    Number.isInteger(l.quantity) &&
    (l.quantity as number) >= 1 &&
    typeof l.note === "string"
  );
};

export function parseCart(raw: string | null): CartLine[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isLine) : [];
  } catch {
    return [];
  }
}

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const EMPTY: CartLine[] = [];

export function createCartStore(getStorage: () => StorageLike) {
  const memory = new Map<string, string>();
  const cache = new Map<string, { raw: string | null; lines: CartLine[] }>();
  const listeners = new Set<() => void>();

  const read = (key: string): string | null => {
    try {
      return getStorage().getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  };

  return {
    get(key: string): CartLine[] {
      const raw = read(key);
      const hit = cache.get(key);
      if (hit && hit.raw === raw) return hit.lines;
      const lines = raw === null ? EMPTY : parseCart(raw);
      cache.set(key, { raw, lines });
      return lines;
    },
    set(key: string, lines: CartLine[]): void {
      const raw = lines.length ? JSON.stringify(lines) : null;
      try {
        const storage = getStorage();
        if (raw === null) storage.removeItem(key);
        else storage.setItem(key, raw);
      } catch {
        if (raw === null) memory.delete(key);
        else memory.set(key, raw);
      }
      for (const l of listeners) l();
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

const browserStore = createCartStore(() => window.localStorage);

// Another tab of the same café changed the cart.
function subscribeBrowser(listener: () => void) {
  const off = browserStore.subscribe(listener);
  window.addEventListener("storage", listener);
  return () => {
    off();
    window.removeEventListener("storage", listener);
  };
}

export function useCart(key: string): [CartLine[], (update: (lines: CartLine[]) => CartLine[]) => void] {
  const lines = useSyncExternalStore(
    subscribeBrowser,
    () => browserStore.get(key),
    () => EMPTY,
  );
  const update = useCallback((fn: (lines: CartLine[]) => CartLine[]) => browserStore.set(key, fn(browserStore.get(key))), [key]);
  return [lines, update];
}
