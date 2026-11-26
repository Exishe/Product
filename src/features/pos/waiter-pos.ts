import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";

// The POS status on each order of the waiter app (ADR-093), read through RLS
// (waiters read their location's sends). Only orders that were queued for a
// POS have one, so nothing shows where no connection was on.

type Client = SupabaseClient<Database>;

export type WaiterPosSend = {
  id: number;
  status: "pending" | "sending" | "sent" | "failed" | "dead" | "skipped";
  error: string | null;
};

/** Latest send per order of the last 12 hours; null when the read failed (keep what is shown). */
export async function fetchPosSends(supabase: Client, locationId: string): Promise<Record<string, WaiterPosSend> | null> {
  const since = new Date(Date.now() - 12 * 3600_000).toISOString();
  const { data, error } = await supabase
    .from("pos_outbox")
    .select("id, order_id, status, last_error")
    .eq("location_id", locationId)
    .eq("is_test", false)
    .gte("created_at", since)
    .order("id");
  if (error) return null;
  const out: Record<string, WaiterPosSend> = {};
  for (const r of data ?? []) {
    if (!r.order_id) continue;
    out[r.order_id] = { id: r.id, status: r.status as WaiterPosSend["status"], error: r.last_error };
  }
  return out;
}

export type RetryResult = { ok: true } | { ok: false };

export async function retryPosSendFromWaiter(supabase: Client, id: number): Promise<RetryResult> {
  const { error } = await supabase.schema("api").rpc("pos_retry", { p_outbox_id: id });
  return error ? { ok: false } : { ok: true };
}
