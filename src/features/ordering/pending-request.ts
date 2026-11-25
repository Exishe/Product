// A waiter call or bill request that has not reached the server yet. Like a
// pending order, it is written to storage before it is sent, so a reload or a
// dead connection never loses it. No idempotency key is needed: the database
// keeps one open request per table and kind (guest_service_request returns
// the open one), so sending the same request twice rings once.
import { requestKey } from "./pending-request-key";

export type RequestKind = "call_waiter" | "bring_bill";
export type PendingRequest = { kind: RequestKind; payment: "card" | "cash" | null; createdAt: string };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

// An old request is dropped: the guest has likely left, or asked the waiter in person.
export const PENDING_MAX_AGE_MS = 15 * 60_000;
export const RETRY_MS = 10_000;

export { requestKey };

export function loadRequest(
  storage: StorageLike,
  tableId: string,
  kind: RequestKind,
  now: () => number = Date.now,
): PendingRequest | null {
  try {
    const p = JSON.parse(storage.getItem(requestKey(tableId, kind)) ?? "null") as PendingRequest | null;
    if (!p || p.kind !== kind) return null;
    const age = now() - Date.parse(p.createdAt);
    if (!Number.isFinite(age) || age > PENDING_MAX_AGE_MS) {
      storage.removeItem(requestKey(tableId, kind));
      return null;
    }
    return {
      kind,
      payment: p.payment === "card" || p.payment === "cash" ? p.payment : null,
      createdAt: p.createdAt,
    };
  } catch {
    return null;
  }
}

/** The pending request, or a new one written to storage first (the first press wins, its time is kept). */
export function beginRequest(
  storage: StorageLike,
  tableId: string,
  kind: RequestKind,
  payment: "card" | "cash" | null = null,
  now: () => number = Date.now,
): PendingRequest {
  const existing = loadRequest(storage, tableId, kind, now);
  if (existing) {
    if (payment === existing.payment) return existing;
    const updated = { ...existing, payment };
    storage.setItem(requestKey(tableId, kind), JSON.stringify(updated));
    return updated;
  }
  const pending: PendingRequest = { kind, payment, createdAt: new Date(now()).toISOString() };
  storage.setItem(requestKey(tableId, kind), JSON.stringify(pending));
  return pending;
}

export function clearRequest(storage: StorageLike, tableId: string, kind: RequestKind): void {
  storage.removeItem(requestKey(tableId, kind));
}
