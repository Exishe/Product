import { z } from "zod";

// The vendor-neutral order the database queues for a POS (ADR-093,
// private.pos_order_payload). Adapters turn it into each vendor's request.

const modifier = z.object({
  pativ_id: z.string().nullable(),
  external_id: z.string().nullable(),
  /** iiko: productGroupId of a group modifier; Poster: the dish modification set. */
  external_group_id: z.string().nullable().optional(),
  name: z.string(),
  price_delta: z.number(),
});

const item = z.object({
  pativ_item_id: z.string().nullable(),
  external_id: z.string().nullable(),
  name: z.string(),
  quantity: z.number().int().positive(),
  unit_price: z.number(),
  modifiers: z.array(modifier),
  note: z.string().nullable(),
  substitution: z.unknown().nullable().optional(),
});

export const posPayloadSchema = z.object({
  event: z.literal("order.accepted"),
  idempotency_key: z.string().min(1),
  test: z.boolean(),
  cafe: z.object({ id: z.string(), name: z.string() }),
  location: z.object({ id: z.string() }),
  table: z
    .object({ id: z.string(), label: z.string(), external_id: z.string().nullable().optional() })
    .nullable(),
  table_session_id: z.string().nullable(),
  order: z.object({
    id: z.string().nullable(),
    number: z.number(),
    created_at: z.string(),
    source: z.string(),
    note: z.string().nullable(),
    items: z.array(item),
  }),
  total: z.number(),
});

export type PosPayload = z.infer<typeof posPayloadSchema>;
export type PosItem = PosPayload["order"]["items"][number];

/** "Dish" or "Dish (option)" for every line or option without a POS id. */
export function unmappedNames(payload: PosPayload): string[] {
  const out: string[] = [];
  for (const it of payload.order.items) {
    if (!it.external_id) out.push(it.name);
    else for (const m of it.modifiers) if (!m.external_id) out.push(`${it.name} (${m.name})`);
  }
  return [...new Set(out)];
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/** The text of an ingredient swap (ADR-076): {"to": {"name": {"hy": "..."}}} → "→ ...". */
export function substitutionText(sub: unknown): string | null {
  const name = obj(obj(obj(sub)?.to)?.name);
  const text = name ? (name.hy ?? name.ru ?? name.en) : null;
  return typeof text === "string" && text ? `→ ${text}` : null;
}

/** The line comment a POS shows: the guest's note and any ingredient swap. */
export function lineComment(it: PosItem): string | null {
  const parts = [it.note, substitutionText(it.substitution)].filter((s): s is string => !!s && s.trim() !== "");
  return parts.length ? parts.join("; ") : null;
}

/** The JSON a webhook receives: the payload without our internal fields. */
export function webhookBody(payload: PosPayload): Record<string, unknown> {
  const { table_session_id: _session, ...rest } = payload;
  void _session;
  return rest;
}
