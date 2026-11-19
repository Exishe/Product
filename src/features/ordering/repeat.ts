// Pure helpers for the order status page: an earlier round back into the
// cart, and an even share of the bill.

type PlacedLine = {
  item_id: string | null;
  quantity: number;
  cancelled_quantity: number;
  note: string | null;
  sort: number;
  order_item_modifiers: { modifier_id: string | null }[];
};

/**
 * An order's lines as cart lines again, in their order: cancelled quantities
 * are left out, and so are dishes or options deleted from the menu since
 * (their ids are gone). The menu still checks each line against today's
 * menu (sold out, changed options) before it can be sent.
 */
export function repeatLines(order: { order_items: readonly PlacedLine[] }) {
  return [...order.order_items]
    .sort((a, b) => a.sort - b.sort)
    .flatMap((l) => {
      const quantity = l.quantity - l.cancelled_quantity;
      const modifierIds = l.order_item_modifiers.map((m) => m.modifier_id);
      if (!l.item_id || quantity < 1 || modifierIds.some((m) => m === null)) return [];
      return [{ itemId: l.item_id, modifierIds: modifierIds as string[], quantity, note: l.note ?? "" }];
    });
}

/** Splitting the bill evenly: up to this many people. */
export const MAX_PEOPLE = 20;

/** One person's share, rounded up to 10 dram (smaller coins aren't in use). */
export const shareOf = (total: number, people: number) =>
  Math.ceil(total / Math.max(1, Math.trunc(people)) / 10) * 10;
