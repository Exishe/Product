import { describe, expect, it } from "vitest";
import { createVisitMemory, parseSuggestions, reasonText, selectCards } from "./suggestions-logic";
import type { GuestItem } from "./view-model";

const dish = (id: string, extra: Partial<GuestItem> = {}) =>
  ({ id, name: { text: id.toUpperCase(), lang: "en" }, soldOut: false, substitution: null, ...extra }) as GuestItem;
const items = Object.fromEntries(
  [dish("burger"), dish("coffee"), dish("cake"), dish("tea", { soldOut: true }), dish("soup", { substitution: {} as never }), dish("fries")].map((i) => [i.id, i]),
);
const row = (item_id: string, reason = "often_together", extra = {}) => ({ item_id, reason, ...extra });
const none = { triggerId: "burger", cartIds: ["burger"], soldOut: [] as string[], dismissed: new Set<string>() };

describe("parseSuggestions", () => {
  it("keeps valid rows, at most three, no dish twice", () => {
    const out = parseSuggestions({
      suggestions: [row("a"), row("a"), row("b", "nope"), { reason: "time_rule" }, 5, row("c"), row("d"), row("e")],
    });
    expect(out.map((s) => s.itemId)).toEqual(["a", "c", "d"]);
  });
  it("gives nothing for anything unexpected", () => {
    for (const bad of [null, "x", {}, { suggestions: "x" }, []]) expect(parseSuggestions(bad)).toEqual([]);
  });
  it("drops an unknown kind but keeps the row", () => {
    const [s] = parseSuggestions({ suggestions: [row("a", "perfect_with_type", { with_type: "lasagna" })] });
    expect(s?.withType).toBeNull();
  });
});

describe("selectCards", () => {
  const list = parseSuggestions({ suggestions: [row("coffee"), row("tea"), row("cake")] });
  it("never shows sold out, substituted, unknown, in-cart or just-added dishes", () => {
    expect(selectCards(list, items, none).map((c) => c.item.id)).toEqual(["coffee", "cake"]);
    expect(selectCards(parseSuggestions({ suggestions: [row("soup"), row("ghost")] }), items, none)).toEqual([]);
    expect(selectCards(list, items, { ...none, cartIds: ["burger", "coffee"] }).map((c) => c.item.id)).toEqual(["cake"]);
    expect(selectCards(parseSuggestions({ suggestions: [row("burger")] }), items, none)).toEqual([]);
  });
  it("hides dishes that went out of stock or were dismissed", () => {
    expect(selectCards(list, items, { ...none, soldOut: ["coffee"] }).map((c) => c.item.id)).toEqual(["cake"]);
    expect(selectCards(list, items, { ...none, dismissed: new Set(["cake"]) }).map((c) => c.item.id)).toEqual(["coffee"]);
  });
});

describe("reasonText", () => {
  it("builds keys from the reason and the loaded names", () => {
    const [a, b, e] = parseSuggestions({
      suggestions: [
        row("a", "pairs_with_dish", { with_item_id: "burger" }),
        row("b", "perfect_with_type", { with_type: "coffee_tea" }),
        row("e", "perfect_with_type"),
      ],
    });
    const [c, d] = parseSuggestions({ suggestions: [row("c", "often_together"), row("d", "time_rule")] });
    expect(reasonText(a!, items, "burger")).toEqual({ key: "suggest.reason.pairs_with_dish", vars: { name: "BURGER" } });
    expect(reasonText(b!, items, "burger")).toEqual({ key: "suggest.perfect.coffee_tea" });
    expect(reasonText(c!, items, "burger").key).toBe("suggest.reason.often_together");
    expect(reasonText(d!, items, "burger").key).toBe("suggest.reason.time_rule");
    expect(reasonText(e!, items, "burger").key).toBe("suggest.reason.generic");
  });
});

describe("createVisitMemory", () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it("remembers triggers, dismissals and shown pairs, also across a reload", () => {
    const s = store();
    const a = createVisitMemory("loc", s);
    expect(a.wasTriggered("burger")).toBe(false);
    a.markTriggered("burger");
    a.dismiss("cake");
    a.markShown("burger", "coffee");
    const b = createVisitMemory("loc", s);
    expect(b.wasTriggered("burger")).toBe(true);
    expect(b.dismissed().has("cake")).toBe(true);
    expect(b.wasShown("burger", "coffee")).toBe(true);
    expect(createVisitMemory("other", s).wasTriggered("burger")).toBe(false);
  });
  it("works without storage and with broken storage", () => {
    const m = createVisitMemory("loc", null);
    m.markTriggered("x");
    expect(m.wasTriggered("x")).toBe(true);
    const bad = createVisitMemory("loc", { getItem: () => "{oops", setItem: () => { throw new Error("full"); } });
    bad.dismiss("y");
    expect(bad.dismissed().has("y")).toBe(true);
  });
});
