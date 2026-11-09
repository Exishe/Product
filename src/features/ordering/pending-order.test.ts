import { describe, expect, it } from "vitest";
import type { OrderLine } from "./cart";
import { beginPending, clearPending, loadPending, pendingKey, savePendingSession } from "./pending-order";

class MemoryStorage {
  data = new Map<string, string>();
  writes = 0;
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.writes++;
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const lines: OrderLine[] = [{ item_id: "tolma", quantity: 2, modifier_ids: [] }];
const scope = { locationId: "loc", tableId: "t9" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("pending order", () => {
  it("stores a new idempotency key with the exact request before anything is sent", () => {
    const storage = new MemoryStorage();
    const pending = beginPending(storage, scope, lines, () => "2026-11-09T20:00:00.000Z");
    expect(pending.key).toMatch(UUID);
    expect(storage.writes).toBe(1);
    expect(JSON.parse(storage.getItem(pendingKey(scope))!)).toEqual({
      key: pending.key,
      lines,
      guestSessionId: null,
      createdAt: "2026-11-09T20:00:00.000Z",
    });
  });

  it("reuses the saved key and request on every retry, even after a reload", () => {
    const storage = new MemoryStorage();
    const first = beginPending(storage, scope, lines);
    const again = beginPending(storage, scope, [{ item_id: "other", quantity: 1, modifier_ids: [] }]);
    expect(again).toEqual(first);
    expect(loadPending(storage, scope)).toEqual(first);
  });

  it("keeps the guest session the request was made with", () => {
    const storage = new MemoryStorage();
    const p = beginPending(storage, scope, lines);
    savePendingSession(storage, scope, "gs-1");
    expect(loadPending(storage, scope)).toEqual({ ...p, guestSessionId: "gs-1" });
  });

  it("is per location and table, and is cleared once the order is placed", () => {
    const storage = new MemoryStorage();
    const p = beginPending(storage, scope, lines);
    expect(beginPending(storage, { ...scope, tableId: "t10" }, lines).key).not.toBe(p.key);
    clearPending(storage, scope);
    expect(loadPending(storage, scope)).toBeNull();
    expect(beginPending(storage, scope, lines).key).not.toBe(p.key);
  });

  it("ignores damaged data", () => {
    const storage = new MemoryStorage();
    storage.setItem(pendingKey(scope), "{nope");
    expect(loadPending(storage, scope)).toBeNull();
    storage.setItem(pendingKey(scope), JSON.stringify({ key: "not-a-uuid", lines }));
    expect(loadPending(storage, scope)).toBeNull();
  });
});
