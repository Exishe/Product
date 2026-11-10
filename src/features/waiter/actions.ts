import type { SupabaseClient } from "@supabase/supabase-js";
import { classifyRpcResult } from "@/features/kitchen/send-result";
import type { SendResult } from "@/lib/offline/outbox";
import type { Database } from "@/lib/supabase/database";
import type { Json } from "@/lib/supabase/types";
import type { Payment, WaiterAction } from "./floor-model";

type Client = SupabaseClient<Database>;
type RpcError = { code: string; message: string; details: string | null; hint: string | null };

// Queued taps (realtime.md, outbox). Every one is safe to repeat: accept,
// reject and serve are compare-and-set in the database, resolving a call twice
// is a no-op, and a waiter order carries its idempotency key.
export function waiterSender(getClient: () => Client) {
  return async function send(action: WaiterAction): Promise<SendResult> {
    const api = getClient().schema("api");
    switch (action.kind) {
      case "accept":
        return classifyWaiterResult(await api.rpc("accept_order", { p_order_id: action.orderId }));
      case "reject":
        return classifyWaiterResult(await api.rpc("reject_order", { p_order_id: action.orderId, p_reason: action.reason }));
      case "serve":
        return classifyWaiterResult(
          await api.rpc("set_ticket_status", { p_ticket_id: action.ticketId, p_expected: "ready", p_next: "served" }),
        );
      case "resolve":
        return classifyWaiterResult(await api.rpc("resolve_service_request", { p_request_id: action.requestId }));
      case "place":
        return classifyWaiterResult(
          await api.rpc("place_waiter_order", {
            p_table_id: action.tableId,
            p_idempotency_key: action.key,
            p_lines: action.lines as unknown as Json,
            p_note: action.note ?? undefined,
            p_locale: action.locale,
          }),
        );
    }
  };
}

// As the kitchen's rules, plus: a QR order of a party waiting for the old bill
// can't be accepted yet; that is a conflict the waiter must see, not a retry.
export function classifyWaiterResult(res: { status: number; error: RpcError | null }): SendResult {
  if (res.error?.code === "RS409" && res.error.message === "table_needs_closing") return { kind: "stale", current: "table_needs_closing" };
  return classifyRpcResult(res);
}

export function sameWaiterAction(a: WaiterAction, b: WaiterAction): boolean {
  return waiterActionKey(a) === waiterActionKey(b) && a.kind === b.kind;
}

// After a conflict, later taps on the same thing were made on a wrong picture.
export const waiterActionKey = (a: WaiterAction): string => {
  switch (a.kind) {
    case "accept":
    case "reject":
      return `order:${a.orderId}`;
    case "serve":
      return `ticket:${a.ticketId}`;
    case "resolve":
      return `request:${a.requestId}`;
    case "place":
      return `place:${a.key}`;
  }
};

// --- Not queued: these need a connection and say so when it's missing ---------

export type DirectResult = { ok: true } | { ok: false; reason: "forbidden" | "stale" | "network" | "refused"; message?: string };

function direct(res: { status: number; error: RpcError | null }): DirectResult {
  if (!res.error) return { ok: true };
  if (res.status === 0 || res.status >= 500) return { ok: false, reason: "network" };
  if (res.error.code === "42501") return { ok: false, reason: "forbidden" };
  if (res.error.code === "RS409" || res.error.code === "P0002") return { ok: false, reason: "stale", message: res.error.message };
  return { ok: false, reason: "refused", message: res.error.message };
}

export async function cancelLine(supabase: Client, orderItemId: string, quantity: number, reason: string): Promise<DirectResult> {
  return direct(
    await supabase.schema("api").rpc("cancel_order_item", { p_order_item_id: orderItemId, p_quantity: quantity, p_reason: reason }),
  );
}

// Money never sits in a queue (realtime.md): settling is online only. The key
// makes a double tap or a lost answer return the same bill.
export async function settleTable(supabase: Client, sessionId: string, payments: Payment[], key: string): Promise<DirectResult> {
  return direct(
    await supabase.schema("api").rpc("settle_table_session", {
      p_table_session_id: sessionId,
      p_payments: payments as unknown as Json,
      p_idempotency_key: key,
    }),
  );
}

export async function seatWaitingGuests(supabase: Client, waitingSessionId: string): Promise<DirectResult> {
  return direct(await supabase.schema("api").rpc("seat_waiting_guests", { p_table_session_id: waitingSessionId }));
}
