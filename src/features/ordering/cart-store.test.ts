import { describe, expect, it, vi } from "vitest";
import { cartKey, createCartStore, parseCart } from "./cart-store";

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

describe("cartKey", () => {
  it("keeps one cart per location and table", () => {
    expect(cartKey("loc", "t5")).toBe("pativ:cart:v1:loc:t5");
    expect(cartKey("loc", null)).toBe("pativ:cart:v1:loc:menu");
  });
});

describe("parseCart", () => {
  it("accepts saved lines and drops anything malformed", () => {
    const good = { id: "a", itemId: "i", modifierIds: ["m"], quantity: 2, note: "" };
    expect(parseCart(JSON.stringify([good, { id: "b" }, null, { ...good, quantity: 0 }, { ...good, quantity: 1.5 }]))).toEqual([good]);
    expect(parseCart("not json")).toEqual([]);
    expect(parseCart(null)).toEqual([]);
    expect(parseCart('{"a":1}')).toEqual([]);
  });
});

describe("createCartStore", () => {
  it("saves to storage, returns the same snapshot until it changes, and notifies", () => {
    const storage = new MemoryStorage();
    const store = createCartStore(() => storage);
    const key = cartKey("loc", "t5");
    const listener = vi.fn();
    const off = store.subscribe(listener);
    const empty = store.get(key);
    expect(empty).toEqual([]);
    expect(store.get(key)).toBe(empty);

    const lines = [{ id: "a", itemId: "i", modifierIds: [], quantity: 1, note: "" }];
    store.set(key, lines);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(JSON.parse(storage.getItem(key) as string)).toEqual(lines);
    const saved = store.get(key);
    expect(saved).toEqual(lines);
    expect(store.get(key)).toBe(saved);

    store.set(key, []);
    expect(storage.getItem(key)).toBeNull();
    off();
    store.set(key, lines);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("keeps working in memory when storage is blocked", () => {
    const store = createCartStore(() => {
      throw new Error("SecurityError");
    });
    const key = cartKey("loc", null);
    store.set(key, [{ id: "a", itemId: "i", modifierIds: [], quantity: 1, note: "" }]);
    expect(store.get(key)).toHaveLength(1);
  });
});
