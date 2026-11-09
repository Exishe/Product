import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Cell } from "./csv";

export const EXPORT_KINDS = ["menu", "orders", "bills"] as const;
export type ExportKind = (typeof EXPORT_KINDS)[number];

// Header keys under billing.export.columns in messages/*.json.
export const COLUMN_KEYS = [
  "category",
  "nameHy",
  "nameRu",
  "nameEn",
  "price",
  "active",
  "date",
  "number",
  "placedAt",
  "table",
  "source",
  "status",
  "items",
  "total",
  "test",
  "closedAt",
  "payments",
] as const;
export type Columns = Record<(typeof COLUMN_KEYS)[number], string>;
type Sheet = { header: string[]; rows: Cell[][] };
type Client = Awaited<ReturnType<typeof createClient>>;

const PAGE = 1000; // PostgREST's default row limit

// Reads every page. Each query also filters by the café, and RLS limits it to
// the caller's cafés anyway (ADR-038: the caller's own session, no secret key).
async function every<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(`Export query failed: ${JSON.stringify(error)}`);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) return out;
  }
}

const byLocale = (rows: { locale: string; name: string }[] | null | undefined) =>
  Object.fromEntries((rows ?? []).map((r) => [r.locale, r.name])) as Record<string, string | undefined>;

async function menu(supabase: Client, restaurantId: string, c: Columns): Promise<Sheet> {
  const items = await every((from, to) =>
    supabase
      .from("items")
      .select(
        "id, price, is_active, sort, categories(sort, category_translations(locale, name)), item_translations(locale, name)",
      )
      .eq("restaurant_id", restaurantId)
      .order("id")
      .range(from, to),
  );
  items.sort((a, b) => (a.categories?.sort ?? 0) - (b.categories?.sort ?? 0) || a.sort - b.sort);
  return {
    header: [c.category, c.nameHy, c.nameRu, c.nameEn, c.price, c.active],
    rows: items.map((i) => {
      const cat = byLocale(i.categories?.category_translations);
      const name = byLocale(i.item_translations);
      return [cat.hy ?? cat.ru ?? cat.en, name.hy, name.ru, name.en, i.price, i.is_active];
    }),
  };
}

async function orders(supabase: Client, restaurantId: string, c: Columns): Promise<Sheet> {
  const rows = await every((from, to) =>
    supabase
      .from("orders")
      .select("business_date, number, placed_at, source, status, item_count, total, is_test, tables(label)")
      .eq("restaurant_id", restaurantId)
      .order("business_date")
      .order("number")
      .order("id")
      .range(from, to),
  );
  return {
    header: [c.date, c.number, c.placedAt, c.table, c.source, c.status, c.items, c.total, c.test],
    rows: rows.map((o) => [
      o.business_date,
      o.number,
      o.placed_at,
      o.tables?.label,
      o.source,
      o.status,
      o.item_count,
      o.total,
      o.is_test,
    ]),
  };
}

async function bills(supabase: Client, restaurantId: string, c: Columns): Promise<Sheet> {
  const rows = await every((from, to) =>
    supabase
      .from("bills")
      .select("business_date, number, status, total, closed_at, payments(method, amount)")
      .eq("restaurant_id", restaurantId)
      .order("business_date")
      .order("number")
      .order("id")
      .range(from, to),
  );
  return {
    header: [c.date, c.number, c.status, c.total, c.closedAt, c.payments],
    rows: rows.map((b) => [
      b.business_date,
      b.number,
      b.status,
      b.total,
      b.closed_at,
      b.payments.map((p) => `${p.method} ${p.amount}`).join("; "),
    ]),
  };
}

export async function loadExport(kind: ExportKind, restaurantId: string, columns: Columns): Promise<Sheet> {
  const supabase = await createClient();
  if (kind === "menu") return menu(supabase, restaurantId, columns);
  if (kind === "orders") return orders(supabase, restaurantId, columns);
  return bills(supabase, restaurantId, columns);
}
