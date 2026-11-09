// The guest's cart: dish ids, chosen option ids, quantities and notes. Prices
// are never stored: they come from the menu the guest is looking at, and the
// database prices the order again from the published snapshot.
export type CartLine = { id: string; itemId: string; modifierIds: string[]; quantity: number; note: string };

type CartGroup = { id: string; min: number; max: number; modifiers: { id: string; delta: number }[] };
export type CartMenu = Record<string, { price: number; soldOut: boolean; groups: CartGroup[] }>;

/** What the database accepts per line (private.place_order_core). */
export const MAX_QUANTITY = 20;
export const MAX_NOTE = 200;

const clampQty = (n: number) => Math.min(MAX_QUANTITY, Math.max(0, Math.trunc(n)));
const sameOptions = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export function addLine(
  lines: readonly CartLine[],
  add: { itemId: string; modifierIds: string[]; quantity: number; note: string },
  newId: () => string,
): CartLine[] {
  const note = add.note.trim().slice(0, MAX_NOTE);
  const same = lines.find((l) => l.itemId === add.itemId && l.note === note && sameOptions(l.modifierIds, add.modifierIds));
  if (same) return lines.map((l) => (l === same ? { ...l, quantity: clampQty(l.quantity + add.quantity) } : l));
  const quantity = clampQty(add.quantity);
  if (quantity < 1) return [...lines];
  return [...lines, { id: newId(), itemId: add.itemId, modifierIds: [...add.modifierIds], quantity, note }];
}

export function setQuantity(lines: readonly CartLine[], id: string, quantity: number): CartLine[] {
  const q = clampQty(quantity);
  return q < 1 ? lines.filter((l) => l.id !== id) : lines.map((l) => (l.id === id ? { ...l, quantity: q } : l));
}

export type PricedLine = { line: CartLine; status: "ok" | "sold_out" | "unavailable"; unitPrice: number; total: number };
export type CartSummary = { lines: PricedLine[]; total: number; count: number; blocked: boolean };

// A line is "unavailable" when the dish left the menu or its options no longer
// fit the dish's groups; "sold_out" when it's on today's stop list. Neither
// counts in the total, and either one blocks sending until it is removed.
export function cartSummary(lines: readonly CartLine[], menu: CartMenu): CartSummary {
  const priced = lines.map((line): PricedLine => {
    const item = menu[line.itemId];
    if (!item) return { line, status: "unavailable", unitPrice: 0, total: 0 };
    let unit = item.price;
    let matched = 0;
    for (const g of item.groups) {
      const chosen = g.modifiers.filter((m) => line.modifierIds.includes(m.id));
      if (chosen.length < g.min || chosen.length > g.max) return { line, status: "unavailable", unitPrice: 0, total: 0 };
      matched += chosen.length;
      unit += chosen.reduce((s, m) => s + m.delta, 0);
    }
    if (matched !== line.modifierIds.length) return { line, status: "unavailable", unitPrice: 0, total: 0 };
    if (item.soldOut) return { line, status: "sold_out", unitPrice: unit, total: 0 };
    return { line, status: "ok", unitPrice: unit, total: unit * line.quantity };
  });
  const ok = priced.filter((p) => p.status === "ok");
  return {
    lines: priced,
    total: ok.reduce((s, p) => s + p.total, 0),
    count: ok.reduce((s, p) => s + p.line.quantity, 0),
    blocked: priced.some((p) => p.status !== "ok"),
  };
}

export type OrderLine = { item_id: string; quantity: number; modifier_ids: string[]; note?: string };

// The body of api.guest_place_order: ids and quantities only, never prices.
export function toOrderLines(lines: readonly CartLine[]): OrderLine[] {
  return lines.map((l) => ({
    item_id: l.itemId,
    quantity: l.quantity,
    modifier_ids: [...l.modifierIds],
    ...(l.note ? { note: l.note } : {}),
  }));
}
