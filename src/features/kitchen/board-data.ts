import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import type { TicketRow } from "./board-model";

// Reads for the kitchen board, through RLS with the device's own session
// (ADR-038). Used by the server page for the first paint and by the board after.

type Client = SupabaseClient<Database>;

// Live tickets of one station: what kitchen_tickets_live_idx covers. The order,
// table and lines come along in one request.
const TICKET_SELECT =
  "id, kind, status, number, created_at, ready_at, first_seen_at, acknowledged_at, orders!kitchen_tickets_restaurant_id_order_id_fkey(source, guest_note, paid_at, tables(label)), kitchen_ticket_items(quantity, order_items(id, name_i18n, note, sort, quantity, cancelled_quantity, order_item_modifiers(name_i18n)))";

export type Fetched<T> = { ok: true; data: T } | { ok: false; status: number };

export async function fetchTicketRows(supabase: Client, stationId: string): Promise<Fetched<TicketRow[]>> {
  const { data, error, status } = await supabase
    .from("kitchen_tickets")
    .select(TICKET_SELECT)
    .eq("station_id", stationId)
    .or("and(kind.eq.order,status.in.(new,cooking,ready)),and(kind.eq.void,acknowledged_at.is.null)")
    .order("created_at");
  if (error) return { ok: false, status };
  const rows: TicketRow[] = data; // the compiler checks the select against TicketRow
  return { ok: true, data: rows };
}

export type BusyState = { until: string | null; minutes: number | null };

// null: RLS no longer shows this location to the caller, so the device was
// disconnected (or the member lost access). An empty ticket list alone can't
// tell that apart from a quiet kitchen.
export async function fetchBusy(supabase: Client, locationId: string): Promise<Fetched<BusyState | null>> {
  const { data, error, status } = await supabase
    .from("locations")
    .select("kitchen_busy_until, expected_wait_minutes")
    .eq("id", locationId)
    .maybeSingle();
  if (error) return { ok: false, status };
  return { ok: true, data: data && { until: data.kitchen_busy_until, minutes: data.expected_wait_minutes } };
}

// Dishes on today's stop list (still active at `now`).
export async function fetchSoldOut(supabase: Client, locationId: string, now: Date): Promise<Fetched<string[]>> {
  const { data, error, status } = await supabase
    .from("stop_list")
    .select("item_id")
    .eq("location_id", locationId)
    .or(`until.is.null,until.gt.${now.toISOString()}`);
  if (error) return { ok: false, status };
  return { ok: true, data: data.map((r) => r.item_id) };
}

export function isBusy(busy: BusyState, now: number): boolean {
  return busy.until !== null && busy.minutes !== null && Date.parse(busy.until) > now;
}
