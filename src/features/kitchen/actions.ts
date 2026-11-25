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

// Item-level bump (ADR-087): strike a line off a ticket in Cooking, or take it
// back. Sent outside the outbox on purpose: the board keeps the tap on screen
// and retries it itself (a strike and its undo on one line would otherwise be
// merged as "the same action"), and a refused strike must not drop the ticket's
// other queued moves.
export type StrikeResult =
  | { kind: "ok"; complete: boolean } // complete: every line still wanted is struck, on every screen
  | { kind: "retry" } // network or server trouble: keep the tap, try again
  | { kind: "gone" } // the ticket left Cooking or the line is gone: the server's word wins
  | { kind: "unsupported" } // the database has no api.set_line_struck yet: this screen keeps its own strikes
  | { kind: "failed" };

export async function setLineStruck(
  supabase: Client,
  ticketId: string,
  orderItemId: string,
  struck: boolean,
): Promise<StrikeResult> {
  const res = await supabase
    .schema("api")
    .rpc("set_line_struck", { p_ticket_id: ticketId, p_order_item_id: orderItemId, p_struck: struck });
  if (!res.error) return { kind: "ok", complete: res.data === true };
  // PostgREST: no such function in its schema cache (404), Postgres: undefined function.
  if (res.error.code === "PGRST202" || res.error.code === "42883") return { kind: "unsupported" };
  const c = classifyRpcResult(res);
  if (c.kind === "retry") return { kind: "retry" };
  if (c.kind === "stale") return { kind: "gone" }; // stale_status or ticket/line not found
  return { kind: "failed" }; // forbidden, bad input
}

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

export type CantMakeResult = "ok" | "paid" | "forbidden" | "stale" | "error";

// "Can't make" on one order line (ADR-081): the database cancels the line, tells
// the guest and the waiters. Not queued: it needs a connection and says so.
export async function cantMakeItem(supabase: Client, orderItemId: string): Promise<CantMakeResult> {
  const { error } = await supabase.schema("api").rpc("cant_make_item", { p_order_item_id: orderItemId });
  if (!error) return "ok";
  if (error.code === "42501") return "forbidden";
  if (error.code === "RS409") return error.message === "order_paid" ? "paid" : "stale";
  if (error.code === "P0002" || error.code === "RS422") return "stale";
  return "error";
}
