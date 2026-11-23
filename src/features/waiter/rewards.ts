import type { SupabaseClient } from "@supabase/supabase-js";
import { parseLines, type Lines } from "@/features/games/rewards";
import type { DirectResult } from "./actions";

// Game rewards on the waiter side (ADR-075): the open claims of this location,
// read through RLS with the device's own session, and the two answers. A
// database without the migration has no table: that is "no rewards".
export type WaiterReward = {
  id: string;
  tableId: string | null;
  level: number;
  kind: "percent" | "text";
  percent: number | null;
  text: Lines;
};

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function parseRewards(rows: unknown): WaiterReward[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((r) => {
    if (!isRecord(r) || typeof r.id !== "string" || !isRecord(r.reward)) return [];
    const kind = r.reward.kind === "text" ? "text" : r.reward.kind === "percent" ? "percent" : null;
    if (!kind) return [];
    return [
      {
        id: r.id,
        tableId: typeof r.table_id === "string" ? r.table_id : null,
        level: typeof r.level === "number" ? r.level : 0,
        kind,
        percent: typeof r.reward.percent === "number" ? r.reward.percent : null,
        text: parseLines(r.reward.text),
      } satisfies WaiterReward,
    ];
  });
}

const HOURS = 12;

/** null: could not read (keep what is shown). */
export async function fetchRewards(supabase: SupabaseClient, locationId: string): Promise<WaiterReward[] | null> {
  try {
    const since = new Date(Date.now() - HOURS * 3_600_000).toISOString();
    const { data, error } = await supabase
      .from("game_reward_claims")
      .select("id, table_id, level, reward")
      .eq("location_id", locationId)
      .is("applied_at", null)
      .is("dismissed_at", null)
      .gte("claimed_at", since)
      .order("claimed_at");
    return error ? null : parseRewards(data);
  } catch {
    return null;
  }
}

export async function resolveReward(
  supabase: SupabaseClient,
  claimId: string,
  action: "applied" | "dismissed",
): Promise<DirectResult> {
  const res = await supabase.schema("api").rpc("resolve_game_reward", { p_claim_id: claimId, p_action: action });
  if (!res.error) return { ok: true };
  if (res.status === 0 || res.status >= 500) return { ok: false, reason: "network" };
  if (res.error.code === "42501") return { ok: false, reason: "forbidden" };
  // Handled by someone else a moment ago: the list just needs to refresh.
  if (res.error.code === "RS409") return { ok: false, reason: "stale", message: res.error.message };
  return { ok: false, reason: "refused", message: res.error.message };
}
