import { beforeEach, describe, expect, it } from "vitest";
import { accept, ackIds, addAcked, forgetAckMemory, loadAcked, plan, priceWith, refusal, subKey, toAsks, unacked } from "./substitutions";
import { parseSubDetail, parseSubstitutions, substituteOf } from "./substitutions-parse";

const RAW = {
  "AAA-1": {
    from: { id: "ing-trout", name: { hy: "Իշխան", ru: "Форель", en: "Trout" } },
    to: { id: "ing-salmon", name: { hy: "Սաղմոն", ru: "Лосось", en: "Salmon" } },
    price_delta: 500,
  },
};
class Mem {
  d = new Map<string, string>();
  getItem(k: string) {
    return this.d.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.d.set(k, v);
  }
}

describe("substitutions from the menu answer", () => {
  it("reads names in the guest's language and falls back to Armenian", () => {
    expect(parseSubstitutions(RAW, "ru")["aaa-1"]).toMatchObject({ from: "Форель", to: "Лосось", delta: 500, fromId: "ing-trout" });
    const partial = { x: { ...RAW["AAA-1"], to: { id: "t", name: { hy: "Սաղմոն" } } } };
    expect(parseSubstitutions(partial, "en").x?.to).toBe("Սաղմոն");
  });
  it("drops anything odd and tolerates a missing field", () => {
    expect(parseSubstitutions(undefined, "en")).toEqual({});
    expect(parseSubstitutions({ a: { from: 1 }, b: null }, "en")).toEqual({});
  });
  it("names the replacement on an order line", () => {
    expect(substituteOf(RAW["AAA-1"], "en")).toBe("Salmon");
    expect(substituteOf(null, "en")).toBeNull();
  });
  it("reads the detail of substitution_changed", () => {
    const detail = JSON.stringify([{ item_id: "aaa-1", ...RAW["AAA-1"] }]);
    expect(parseSubDetail(detail, "en")).toEqual([
      { itemId: "aaa-1", fromId: "ing-trout", toId: "ing-salmon", from: "Trout", to: "Salmon", delta: 500 },
    ]);
    expect(parseSubDetail("not json", "en")).toEqual([]);
    expect(parseSubDetail("{}", "en")).toEqual([]);
  });
});

describe("acknowledgement bookkeeping", () => {
  const subs = parseSubstitutions(RAW, "en");
  const cart = [{ itemId: "aaa-1" }, { itemId: "aaa-1" }, { itemId: "plain" }];

  it("asks once per dish, and only for dishes with a substitution", () => {
    expect(unacked(cart, subs, new Set()).map((s) => s.itemId)).toEqual(["aaa-1"]);
    expect(unacked(cart, subs, new Set([subKey(subs["aaa-1"]!)]))).toEqual([]);
  });
  it("sends the replaced ingredient ids of accepted dishes only", () => {
    expect(ackIds(cart, subs, new Set())).toEqual([]);
    expect(ackIds(cart, subs, new Set([subKey(subs["aaa-1"]!)]))).toEqual(["ing-trout"]);
    expect(ackIds([{ itemId: "plain" }], subs, new Set([subKey(subs["aaa-1"]!)]))).toEqual([]);
  });
  it("a different replacement or price asks again", () => {
    const accepted = new Set([subKey(subs["aaa-1"]!)]);
    const changed = { ...subs["aaa-1"]!, toId: "ing-char" };
    expect(unacked(cart, { "aaa-1": changed }, accepted)).toHaveLength(1);
    expect(unacked(cart, { "aaa-1": { ...subs["aaa-1"]!, delta: 0 } }, accepted)).toHaveLength(1);
  });
  it("remembers the accepted ones for the visit, also without storage", () => {
    forgetAckMemory();
    const storage = new Mem();
    addAcked(storage, "loc", [subs["aaa-1"]!]);
    forgetAckMemory(); // a reload: read back from sessionStorage
    expect(loadAcked(storage, "loc").has(subKey(subs["aaa-1"]!))).toBe(true);
    forgetAckMemory();
    addAcked(null, "loc2", [subs["aaa-1"]!]);
    expect(loadAcked(null, "loc2").size).toBe(1);
    expect(loadAcked(storage, "other").size).toBe(0);
  });
});

describe("substitution_changed re-prompt", () => {
  beforeEach(() => forgetAckMemory());
  it("the server's list is asked about, then acknowledged with exactly its ingredients", () => {
    // The menu on screen knew nothing (the substitution started after the guest added the dish).
    const shown = {};
    const cart = [{ itemId: "aaa-1" }];
    expect(unacked(cart, shown, new Set())).toEqual([]); // nothing to ask: the order goes out and is refused
    const named = parseSubDetail(JSON.stringify([{ item_id: "aaa-1", ...RAW["AAA-1"] }]), "en");
    const known = { ...shown, ...Object.fromEntries(named.map((x) => [x.itemId, x])) };
    const ask = unacked(cart, known, new Set());
    expect(ask).toHaveLength(1);
    const accepted = addAcked(null, "loc", ask);
    expect(ackIds(cart, known, accepted)).toEqual(["ing-trout"]);
    expect(unacked(cart, known, accepted)).toEqual([]); // no second question for the same thing
  });
  it("asks with the dish's name and the price once the replacement applies", () => {
    const named = parseSubDetail(JSON.stringify([{ item_id: "aaa-1", ...RAW["AAA-1"] }]), "en");
    const items = { "aaa-1": { name: { text: "Grilled fish" }, price: 4000, substitution: null } };
    expect(toAsks(named, items)).toEqual([{ sub: named[0], name: "Grilled fish", price: 4500 }]);
    expect(toAsks(named, {})).toEqual([{ sub: named[0], name: "", price: null }]);
  });
  it("plans a send: asks first, then carries the accepted ids", () => {
    const items = { "aaa-1": { name: { text: "Grilled fish" }, price: 4000, substitution: null } };
    const cart = [{ itemId: "aaa-1" }];
    const detail = JSON.stringify([{ item_id: "aaa-1", ...RAW["AAA-1"] }]);
    const refused = refusal(detail, "en", items)!;
    expect(refused.asks).toHaveLength(1);
    expect(refusal("[]", "en", items)).toBeNull();
    const first = plan("locP", cart, refused.subs, items);
    expect(first.ask).toHaveLength(1);
    expect(first.ack).toEqual([]);
    accept("locP", refused.asks.map((a) => a.sub));
    const second = plan("locP", cart, refused.subs, items);
    expect(second.ask).toEqual([]);
    expect(second.ack).toEqual(["ing-trout"]);
  });
  it("states the new price from the price on screen", () => {
    expect(priceWith(5200, 0, 500)).toBe(5700); // started after the guest looked
    expect(priceWith(5700, 500, 300)).toBe(5500); // the replacement on screen changed
    expect(priceWith(400, 0, -900)).toBe(0);
  });
});
