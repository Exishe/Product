import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import type { PosSettings, PosVendor } from "./adapters/types";
import type { DishMatch, PativDish } from "./match";

type Client = SupabaseClient<Database>;

export type PosConnectionView = {
  id: string;
  vendor: PosVendor;
  isActive: boolean;
  hasSecret: boolean;
  settings: PosSettings;
};

export type PosSendView = {
  id: number;
  status: "pending" | "sending" | "sent" | "failed" | "dead" | "skipped";
  isTest: boolean;
  orderNumber: number | null;
  tableLabel: string | null;
  externalOrderId: string | null;
  lastError: string | null;
  attempts: number;
  createdAt: string;
  payload: unknown;
};

export type DishView = PativDish & { name: string };

export type PosAdminData = {
  locationId: string;
  connection: PosConnectionView | null;
  dishes: DishView[];
  tables: { id: string; label: string }[];
  matches: DishMatch[];
  tableMatches: { tableId: string; externalId: string; externalName: string }[];
  recent: PosSendView[];
};

const LOCALES = ["hy", "ru", "en"] as const;

function names(rows: { locale: string; name: string }[] | null | undefined): string[] {
  const list = [...(rows ?? [])].sort((a, b) => LOCALES.indexOf(a.locale as never) - LOCALES.indexOf(b.locale as never));
  return list.map((r) => r.name).filter(Boolean);
}

export function toSendView(row: {
  id: number;
  status: string;
  is_test: boolean;
  external_order_id: string | null;
  last_error: string | null;
  attempts: number;
  created_at: string;
  payload: unknown;
}): PosSendView {
  const p = (row.payload ?? {}) as { order?: { number?: unknown }; table?: { label?: unknown } | null };
  return {
    id: row.id,
    status: row.status as PosSendView["status"],
    isTest: row.is_test,
    orderNumber: typeof p.order?.number === "number" ? p.order.number : null,
    tableLabel: typeof p.table?.label === "string" ? p.table.label : null,
    externalOrderId: row.external_order_id,
    lastError: row.last_error,
    attempts: row.attempts,
    createdAt: row.created_at,
    payload: row.payload,
  };
}

/** Everything the POS page shows, read through RLS as the signed-in owner or manager. */
export async function loadPosAdmin(supabase: Client, restaurantId: string): Promise<PosAdminData | null> {
  const { data: location } = await supabase
    .from("locations")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!location) return null;

  const [conn, items, groups, tables] = await Promise.all([
    supabase
      .from("pos_connections")
      .select("id, vendor, is_active, has_secret, settings")
      .eq("location_id", location.id)
      .maybeSingle(),
    supabase
      .from("items")
      .select("id, is_active, sort, item_translations(locale, name), item_modifier_groups(group_id)")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("sort"),
    supabase
      .from("modifier_groups")
      .select("id, modifiers(id, is_active, sort, modifier_translations(locale, name))")
      .eq("restaurant_id", restaurantId),
    supabase
      .from("tables")
      .select("id, label, sort")
      .eq("location_id", location.id)
      .eq("is_active", true)
      .order("sort")
      .order("label"),
  ]);

  const modsByGroup = new Map<string, { id: string; names: string[] }[]>();
  for (const g of groups.data ?? [])
    modsByGroup.set(
      g.id,
      (g.modifiers ?? []).filter((m) => m.is_active).map((m) => ({ id: m.id, names: names(m.modifier_translations) })),
    );
  const dishes: DishView[] = (items.data ?? []).map((i) => {
    const n = names(i.item_translations);
    return {
      id: i.id,
      name: n[0] ?? "?",
      names: n,
      modifiers: (i.item_modifier_groups ?? []).flatMap((g) => modsByGroup.get(g.group_id) ?? []),
    };
  });

  const c = conn.data;
  const connection: PosConnectionView | null = c
    ? {
        id: c.id,
        vendor: c.vendor as PosVendor,
        isActive: c.is_active,
        hasSecret: c.has_secret,
        settings: (c.settings ?? {}) as PosSettings,
      }
    : null;

  let matches: DishMatch[] = [];
  let tableMatches: PosAdminData["tableMatches"] = [];
  let recent: PosSendView[] = [];
  if (connection) {
    const [links, tlinks, sends] = await Promise.all([
      supabase
        .from("pos_item_links")
        .select("item_id, external_id, external_name, modifiers, auto_matched")
        .eq("connection_id", connection.id),
      supabase.from("pos_table_links").select("table_id, external_table_id, external_name").eq("connection_id", connection.id),
      supabase
        .from("pos_outbox")
        .select("id, status, is_test, external_order_id, last_error, attempts, created_at, payload")
        .eq("connection_id", connection.id)
        .order("created_at", { ascending: false })
        .limit(20),
    ]);
    matches = (links.data ?? []).map((l) => ({
      itemId: l.item_id,
      externalId: l.external_id,
      externalName: l.external_name ?? l.external_id,
      auto: l.auto_matched,
      modifiers: (l.modifiers ?? {}) as DishMatch["modifiers"],
    }));
    tableMatches = (tlinks.data ?? []).map((l) => ({
      tableId: l.table_id,
      externalId: l.external_table_id,
      externalName: l.external_name ?? l.external_table_id,
    }));
    recent = (sends.data ?? []).map(toSendView);
  }

  return {
    locationId: location.id,
    connection,
    dishes,
    tables: (tables.data ?? []).map((t) => ({ id: t.id, label: t.label })),
    matches,
    tableMatches,
    recent,
  };
}
