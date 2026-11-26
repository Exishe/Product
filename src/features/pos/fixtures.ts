import type { PosPayload } from "./payload";

// A payload as private.pos_order_payload builds it, for the tests.
export function samplePayload(over: Partial<PosPayload> = {}): PosPayload {
  return {
    event: "order.accepted",
    idempotency_key: "pativ-order-0b6c3f2e-1111-4222-8333-444455556666",
    test: false,
    cafe: { id: "c1", name: "Սրճարան Պ" },
    location: { id: "l1" },
    table: { id: "t4", label: "4", external_id: "iiko-table-4" },
    table_session_id: "s1",
    order: {
      id: "0b6c3f2e-1111-4222-8333-444455556666",
      number: 12,
      created_at: "2026-11-26T10:00:00Z",
      source: "waiter",
      note: "Արագ, խնդրում եմ",
      items: [
        {
          pativ_item_id: "i1",
          external_id: "101",
          name: "Հավի խորոված",
          quantity: 2,
          unit_price: 3300,
          modifiers: [{ pativ_id: "m1", external_id: "7", external_group_id: "70", name: "Մեծ", price_delta: 500 }],
          note: "առանց սոխի",
          substitution: null,
        },
        {
          pativ_item_id: "i2",
          external_id: "102",
          name: "Տոլմա",
          quantity: 1,
          unit_price: 3200,
          modifiers: [],
          note: null,
          substitution: { from: { name: { hy: "Բրինձ" } }, to: { name: { hy: "Բլղուր" } }, price_delta: 0 },
        },
      ],
    },
    total: 9800,
    ...over,
  };
}
