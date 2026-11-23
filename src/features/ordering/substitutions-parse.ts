// Ingredient substitutes on the guest side (ADR-076). The menu answer lists
// the dishes made with a replacement today; the guest accepts that once per
// dish, and the order carries the replaced ingredient ids as `subs_ack`.
// Plain data and pure functions only: this file is part of the first load.
type Names = Partial<Record<string, string | null>> | null | undefined;

export type SubInfo = {
  itemId: string;
  fromId: string;
  toId: string;
  /** The replacement and the replaced ingredient, in the guest's language (Armenian first when it is missing). */
  from: string;
  to: string;
  /** The price difference in whole AMD (may be negative), 0 when none. */
  delta: number;
};

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function pick(names: unknown, locale: string): string {
  const n = obj(names) as Names;
  for (const l of [locale, "hy", "ru", "en"]) {
    const s = n?.[l];
    if (typeof s === "string" && s.trim()) return s.trim();
  }
  return "";
}

function parseOne(itemId: string, raw: unknown, locale: string): SubInfo | null {
  const r = obj(raw);
  const from = obj(r?.from);
  const to = obj(r?.to);
  if (!r || typeof from?.id !== "string" || typeof to?.id !== "string") return null;
  const name = pick(to.name, locale);
  if (!name) return null;
  return {
    itemId: itemId.toLowerCase(),
    fromId: from.id,
    toId: to.id,
    from: pick(from.name, locale),
    to: name,
    delta: typeof r.price_delta === "number" ? Math.trunc(r.price_delta) : 0,
  };
}

/** `substitutions` of api.public_menu, by dish id. Tolerant: anything odd is dropped. */
export function parseSubstitutions(raw: unknown, locale: string): Record<string, SubInfo> {
  const out: Record<string, SubInfo> = {};
  for (const [id, v] of Object.entries(obj(raw) ?? {})) {
    const s = parseOne(id, v, locale);
    if (s) out[s.itemId] = s;
  }
  return out;
}

/** The replacement named on an order line (`order_items.substitution`), in the guest's language. */
export const substituteOf = (sub: unknown, locale: string): string | null => parseOne("", sub, locale)?.to ?? null;

/** The `detail` of a `substitution_changed` refusal: a JSON list of {item_id, from, to, price_delta}. */
export function parseSubDetail(details: string, locale: string): SubInfo[] {
  try {
    const list: unknown = JSON.parse(details);
    return (Array.isArray(list) ? list : []).flatMap((e) => {
      const s = typeof obj(e)?.item_id === "string" ? parseOne(String(obj(e)?.item_id), e, locale) : null;
      return s ? [s] : [];
    });
  } catch {
    return [];
  }
}
