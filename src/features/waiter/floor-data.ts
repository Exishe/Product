import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import type { FloorRows, SessionRow } from "./floor-model";

// Reads for the waiter app, through RLS with the device's own session
// (ADR-038). Used by the server page for the first paint and by the app after.

type Client = SupabaseClient<Database>;

const ORDER_SELECT =
  "id, number, source, status, kitchen_status, placed_at, guest_note, total, reject_reason, possible_duplicate_of, order_items(id, name_i18n, quantity, cancelled_quantity, line_total, note, sort, station_id, order_item_modifiers(name_i18n)), kitchen_tickets!kitchen_tickets_restaurant_id_order_id_fkey(id, station_id, kind, status)";

const SESSION_SELECT = `id, table_id, status, opened_at, orders!orders_restaurant_id_table_session_id_fkey(${ORDER_SELECT})`;

export type Fetched<T> = { ok: true; data: T } | { ok: false; status: number };

// null: RLS no longer shows the location, so the device was disconnected.
export async function fetchFloor(supabase: Client, locationId: string): Promise<Fetched<FloorRows | null>> {
  const [location, areas, tables, sessions, requests, stations] = await Promise.all([
    supabase.from("locations").select("id").eq("id", locationId).maybeSingle(),
    supabase.from("areas").select("id, name, sort").eq("location_id", locationId),
    supabase
      .from("tables")
      .select("id, label, area_id, shape, pos_x, pos_y, sort")
      .eq("location_id", locationId)
      .eq("is_active", true),
    // Open and waiting sessions; "not in (closed, void)" also works before the
    // 'waiting' value exists in the database.
    supabase.from("table_sessions").select(SESSION_SELECT).eq("location_id", locationId).not("status", "in", "(closed,void)"),
    supabase
      .from("service_requests")
      .select("id, table_id, table_session_id, kind, status, created_at")
      .eq("location_id", locationId)
      .neq("status", "resolved"),
    supabase.from("stations").select("id, name, is_default").eq("location_id", locationId),
  ]);
  const failed = [location, areas, tables, sessions, requests, stations].find((r) => r.error);
  if (failed) return { ok: false, status: failed.status };
  if (!location.data) return { ok: true, data: null };
  const sessionRows: SessionRow[] = sessions.data ?? []; // the compiler checks the select against SessionRow
  return {
    ok: true,
    data: {
      areas: areas.data ?? [],
      tables: tables.data ?? [],
      sessions: sessionRows,
      requests: requests.data ?? [],
      stations: stations.data ?? [],
    },
  };
}
