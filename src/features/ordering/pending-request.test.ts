import { describe, expect, it } from "vitest";
import { beginRequest, clearRequest, loadRequest, PENDING_MAX_AGE_MS, requestKey } from "./pending-request";

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

describe("pending service request", () => {
  it("is saved before sending and survives a reload", () => {
    const s = new MemoryStorage();
    const p = beginRequest(s, "t1", "call_waiter", null, () => 1_000);
    expect(loadRequest(s, "t1", "call_waiter", () => 2_000)).toEqual(p);
  });

  it("keeps the first press time on repeated presses and updates the payment choice", () => {
    const s = new MemoryStorage();
    const first = beginRequest(s, "t1", "bring_bill", null, () => 1_000);
    const again = beginRequest(s, "t1", "bring_bill", "cash", () => 5_000);
    expect(again.createdAt).toBe(first.createdAt);
    expect(loadRequest(s, "t1", "bring_bill", () => 6_000)?.payment).toBe("cash");
  });

  it("keeps the two kinds and two tables apart", () => {
    const s = new MemoryStorage();
    beginRequest(s, "t1", "call_waiter");
    expect(loadRequest(s, "t1", "bring_bill")).toBeNull();
    expect(loadRequest(s, "t2", "call_waiter")).toBeNull();
  });

  it("drops a request older than the limit", () => {
    const s = new MemoryStorage();
    beginRequest(s, "t1", "call_waiter", null, () => 0);
    expect(loadRequest(s, "t1", "call_waiter", () => PENDING_MAX_AGE_MS + 1)).toBeNull();
    expect(s.getItem(requestKey("t1", "call_waiter"))).toBeNull();
  });

  it("ignores garbage and clears", () => {
    const s = new MemoryStorage();
    s.setItem(requestKey("t1", "call_waiter"), "{nope");
    expect(loadRequest(s, "t1", "call_waiter")).toBeNull();
    beginRequest(s, "t1", "call_waiter");
    clearRequest(s, "t1", "call_waiter");
    expect(loadRequest(s, "t1", "call_waiter")).toBeNull();
  });
});
