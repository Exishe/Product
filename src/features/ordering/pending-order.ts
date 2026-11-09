import type { OrderLine } from "./cart";

// An order being sent (Review focus 1). The idempotency key and the exact
// request are saved before the request leaves the phone, and every retry,
// even after a reload, sends the same key, lines and guest session. The
// database then returns the original order instead of creating a second one.
export type PendingOrder = { key: string; lines: OrderLine[]; guestSessionId: string | null; createdAt: string };
type Scope = { locationId: string; tableId: string };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const pendingKey = (s: Scope) => `pativ:order:v1:${s.locationId}:${s.tableId}`;

function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = ((b[6] as number) & 0x0f) | 0x40;
  b[8] = ((b[8] as number) & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function loadPending(storage: StorageLike, scope: Scope): PendingOrder | null {
  try {
    const p = JSON.parse(storage.getItem(pendingKey(scope)) ?? "null") as PendingOrder | null;
    if (!p || typeof p.key !== "string" || !UUID.test(p.key) || !Array.isArray(p.lines)) return null;
    return { key: p.key, lines: p.lines, guestSessionId: p.guestSessionId ?? null, createdAt: String(p.createdAt) };
  } catch {
    return null;
  }
}

/** The pending order for this table, or a new one written to storage first. */
export function beginPending(
  storage: StorageLike,
  scope: Scope,
  lines: OrderLine[],
  now: () => string = () => new Date().toISOString(),
): PendingOrder {
  const existing = loadPending(storage, scope);
  if (existing) return existing;
  const pending: PendingOrder = { key: uuid(), lines, guestSessionId: null, createdAt: now() };
  storage.setItem(pendingKey(scope), JSON.stringify(pending));
  return pending;
}

export function savePendingSession(storage: StorageLike, scope: Scope, guestSessionId: string | null): void {
  const p = loadPending(storage, scope);
  if (p) storage.setItem(pendingKey(scope), JSON.stringify({ ...p, guestSessionId }));
}

export function clearPending(storage: StorageLike, scope: Scope): void {
  storage.removeItem(pendingKey(scope));
}
