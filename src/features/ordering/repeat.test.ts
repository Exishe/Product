import { describe, expect, it } from "vitest";
import { orderableAgain } from "@/features/menu/guest-menu/order-again";
import type { CartMenu } from "./cart";
import { hasLastOrder, lastOrderKey, loadLastOrder, MAX_AGE_DAYS, saveLastOrder } from "./last-order";
import { repeatLines, shareOf } from "./repeat";

const line = (over: Partial<Parameters<typeof repeatLines>[0]["order_items"][number]> = {}) => ({
  item_id: "tea",
  quantity: 2,
  cancelled_quantity: 0,
  note: null,
  sort: 0,
  order_item_modifiers: [],
  ...over,
});

describe("repeatLines", () => {
  it("keeps the order of the lines, what was not cancelled, options and notes", () => {
    const lines = repeatLines({
      order_items: [
        line({ item_id: "gata", sort: 2, quantity: 1, note: "warm" }),
        line({
          item_id: "coffee",
          sort: 1,
          quantity: 3,
          cancelled_quantity: 1,
          order_item_modifiers: [{ modifier_id: "oat" }],
        }),
      ],
    });
    expect(lines).toEqual([
      { itemId: "coffee", modifierIds: ["oat"], quantity: 2, note: "" },
      { itemId: "gata", modifierIds: [], quantity: 1, note: "warm" },
    ]);
  });

  it("leaves out fully cancelled lines and dishes or options deleted since", () => {
    expect(
      repeatLines({
        order_items: [
          line({ cancelled_quantity: 2 }),
          line({ item_id: null }),
          line({ order_item_modifiers: [{ modifier_id: null }] }),
        ],
      }),
    ).toEqual([]);
  });
});

describe("shareOf", () => {
  it("rounds each share up to 10 dram so the shares cover the bill", () => {
    expect(shareOf(12_500, 3)).toBe(4_170);
    expect(shareOf(12_500, 3) * 3).toBeGreaterThanOrEqual(12_500);
    expect(shareOf(9_000, 1)).toBe(9_000);
    expect(shareOf(9_000, 0)).toBe(9_000);
  });
});

describe("last order", () => {
  const memory = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  const cartLine = { id: "l1", itemId: "tea", modifierIds: ["mint"], quantity: 2, note: "hot" };

  it("keeps ids and quantities only, per location, and expires", () => {
    const s = memory();
    saveLastOrder(s, "loc", [cartLine], 1_000);
    expect(JSON.parse(s.getItem(lastOrderKey("loc"))!)).toEqual({
      at: 1_000,
      lines: [{ itemId: "tea", modifierIds: ["mint"], quantity: 2 }],
    });
    expect(hasLastOrder(s, "loc")).toBe(true);
    expect(hasLastOrder(s, "other")).toBe(false);
    expect(loadLastOrder(s, "loc", 2_000)).toEqual([{ itemId: "tea", modifierIds: ["mint"], quantity: 2 }]);
    expect(loadLastOrder(s, "loc", 1_000 + (MAX_AGE_DAYS + 1) * 86_400_000)).toEqual([]);
  });

  it("ignores junk and blocked storage", () => {
    const s = memory();
    s.setItem(lastOrderKey("loc"), '{"at":5,"lines":[{"itemId":"x","modifierIds":[],"quantity":0},7]}');
    expect(loadLastOrder(s, "loc", 6)).toEqual([]);
    s.setItem(lastOrderKey("loc"), "nope");
    expect(loadLastOrder(s, "loc", 6)).toEqual([]);
    const blocked = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(() => saveLastOrder(blocked, "loc", [cartLine])).not.toThrow();
    expect(hasLastOrder(blocked, "loc")).toBe(false);
    expect(loadLastOrder(null, "loc")).toEqual([]);
  });

  it("offers again only what today's menu can take", () => {
    const menu: CartMenu = {
      tea: {
        price: 800,
        soldOut: false,
        groups: [{ id: "g", min: 0, max: 1, modifiers: [{ id: "mint", delta: 0 }] }],
      },
      gata: { price: 600, soldOut: true, groups: [] },
    };
    expect(
      orderableAgain(
        [
          { itemId: "tea", modifierIds: ["mint"], quantity: 2 },
          { itemId: "gata", modifierIds: [], quantity: 1 },
          { itemId: "gone", modifierIds: [], quantity: 1 },
          { itemId: "tea", modifierIds: ["lemon"], quantity: 1 },
        ],
        menu,
      ),
    ).toEqual([{ itemId: "tea", modifierIds: ["mint"], quantity: 2 }]);
  });
});
