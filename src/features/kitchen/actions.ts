import type { SupabaseClient } from "@supabase/supabase-js";
import type { SendResult } from "@/lib/offline/outbox";
import type { Database } from "@/lib/supabase/database";
import type { KitchenAction } from "./board-model";
import { classifyRpcResult } from "./send-result";

type Client = SupabaseClient<Database>;

// Queued taps (realtime.md, outbox). Status moves carry the status the cook saw,
// so the database can refuse a move made on a stale screen.
export function kitchenSender(getClient: () => Client) {
  return async function send(action: KitchenAction): Promise<SendResult> {
    const api = getClient().schema("api");
    const res =
      action.kind === "set_ticket_status"
        ? await api.rpc("set_ticket_status", { p_ticket_id: action.ticketId, p_expected: action.expected, p_next: action.next })
        : await api.rpc("acknowledge_void", { p_ticket_id: action.ticketId });
    return classifyRpcResult(res);
  };
}

export function sameKitchenAction(a: KitchenAction, b: KitchenAction): boolean {
  if (a.kind !== b.kind || a.ticketId !== b.ticketId) return false;
  if (a.kind === "set_ticket_status" && b.kind === "set_ticket_status") return a.expected === b.expected && a.next === b.next;
  return true;
}

export const kitchenActionKey = (a: KitchenAction): string => a.ticketId;

// Not queued: these need a connection and say so when it's missing.

export async function setKitchenBusy(supabase: Client, locationId: string, minutes: 20 | 30 | 45 | null) {
  // The type generator doesn't mark nullable arguments; null switches it off.
  const { data, error } = await supabase
    .schema("api")
    .rpc("set_kitchen_busy", { p_location_id: locationId, p_minutes: minutes as number });
  return error ? { ok: false as const } : { ok: true as const, until: data as string | null };
}

export async function setSoldOut(
  supabase: Client,
  row: { restaurantId: string; locationId: string; itemId: string; userId: string; until: Date },
  soldOut: boolean,
) {
  const { error } = soldOut
    ? await supabase.from("stop_list").upsert(
        {
          restaurant_id: row.restaurantId,
          location_id: row.locationId,
          item_id: row.itemId,
          until: row.until.toISOString(),
          created_by: row.userId,
        },
        { onConflict: "location_id,item_id" },
      )
    : await supabase.from("stop_list").delete().eq("location_id", row.locationId).eq("item_id", row.itemId);
  return !error;
}

// ADR-037: when a screen first drew a ticket. The database keeps the first time.
export async function markTicketsSeen(supabase: Client, ids: string[]): Promise<boolean> {
  const { error } = await supabase.schema("api").rpc("mark_tickets_seen", { p_ticket_ids: ids });
  return !error;
}

// Device heartbeat for the "screen offline" alert. "forbidden" means the device
// was disconnected.
export async function heartbeat(supabase: Client): Promise<"ok" | "forbidden" | "error"> {
  const { error } = await supabase.schema("api").rpc("heartbeat");
  if (!error) return "ok";
  return error.code === "42501" ? "forbidden" : "error";
}
