import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";

// «Իմ հերթափոխը» (scout finding «personal shift summary»): what this device
// or person recorded today, to reconcile the cash at closing. Factual only:
// no ranking against colleagues (metrics.md), and only their own numbers.
// Read through RLS: waiters may read the bills, payments and orders of their
// location (baseline: bills_read, payments_read, orders_read).

type Client = SupabaseClient<Database>;

export type ShiftBill = {
  status: string;
  total: number;
  closed_by: string | null;
  payments: { method: string; status: string; amount: number; recorded_by: string | null }[];
};

export type ShiftOrder = {
  source: string;
  status: string;
  placed_at: string;
  accepted_at: string | null;
  accepted_by: string | null;
  created_by_member: string | null;
};

export type ShiftSummary = {
  tables: number;
  cash: number;
  card: number;
  entered: number;
  accepted: number;
  /** Mean minutes from a guest's order to this person's accept; null with none. */
  acceptMinutes: number | null;
};

export function summarizeShift(
  bills: readonly ShiftBill[],
  orders: readonly ShiftOrder[],
  memberId: string,
): ShiftSummary {
  const mine = bills.filter((b) => b.status === "paid" && b.closed_by === memberId);
  let cash = 0;
  let card = 0;
  for (const p of mine.flatMap((b) => b.payments)) {
    if (p.status !== "succeeded" || p.recorded_by !== memberId) continue;
    if (p.method === "cash") cash += p.amount;
    else card += p.amount;
  }
  const accepted = orders.filter((o) => o.source !== "waiter" && o.accepted_by === memberId && o.accepted_at);
  const waits = accepted.map(
    (o) => Math.max(0, Date.parse(o.accepted_at ?? "") - Date.parse(o.placed_at)) / 60_000,
  );
  return {
    tables: mine.length,
    cash,
    card,
    entered: orders.filter(
      (o) => o.source === "waiter" && o.created_by_member === memberId && o.status !== "rejected",
    ).length,
    accepted: accepted.length,
    acceptMinutes: waits.length > 0 ? waits.reduce((s, m) => s + m, 0) / waits.length : null,
  };
}

export async function fetchShift(
  supabase: Client,
  locationId: string,
  memberId: string,
  businessDate: string,
): Promise<ShiftSummary | null> {
  const [bills, orders] = await Promise.all([
    supabase
      .from("bills")
      .select("status, total, closed_by, payments(method, status, amount, recorded_by)")
      .eq("location_id", locationId)
      .eq("business_date", businessDate)
      .eq("closed_by", memberId),
    supabase
      .from("orders")
      .select("source, status, placed_at, accepted_at, accepted_by, created_by_member")
      .eq("location_id", locationId)
      .eq("business_date", businessDate)
      .or(`accepted_by.eq.${memberId},created_by_member.eq.${memberId}`),
  ]);
  if (bills.error || orders.error) return null;
  return summarizeShift(bills.data ?? [], orders.data ?? [], memberId);
}
