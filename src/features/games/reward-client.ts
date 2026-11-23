import type { SupabaseClient } from "@supabase/supabase-js";
import { parseClaim, parseOffer, type RewardClaim, type RewardOffer } from "./rewards";

// The guest's two reward calls (ADR-075), authenticated like every guest call:
// the signed-in anonymous user plus their guest session id. Loaded lazily with
// the reward display, never in the first-load bundle. A database without the
// migration answers with an error: that is "no rewards", not a failure.
export type RewardCtx = { db: SupabaseClient; guestSessionId: string; orderId: string };

/** Fired on window after a claim, so the status page's note looks again. */
export const REWARD_EVENT = "pativ:reward";

export async function fetchOffer(ctx: RewardCtx): Promise<RewardOffer | null> {
  try {
    const { data, error } = await ctx.db
      .schema("api")
      .rpc("guest_game_reward", { p_guest_session_id: ctx.guestSessionId, p_order_id: ctx.orderId })
      .abortSignal(AbortSignal.timeout(10_000));
    return error ? null : parseOffer(data);
  } catch {
    return null;
  }
}

export type ClaimResult = { ok: true; claim: RewardClaim } | { ok: false; retry: boolean };

export async function claimReward(ctx: RewardCtx, game: string, level: number): Promise<ClaimResult> {
  try {
    const { data, error, status } = await ctx.db
      .schema("api")
      .rpc("claim_game_reward", {
        p_guest_session_id: ctx.guestSessionId,
        p_order_id: ctx.orderId,
        p_game: game,
        p_level: level,
      })
      .abortSignal(AbortSignal.timeout(10_000));
    const claim = error ? null : parseClaim(data);
    if (claim) {
      window.dispatchEvent(new Event(REWARD_EVENT));
      return { ok: true, claim };
    }
    // A refusal (rewards off, order closed, too early) will not change by asking
    // again; only a network or server hiccup is worth another try.
    return { ok: false, retry: !error || status === 0 || status >= 500 || status === 429 };
  } catch {
    return { ok: false, retry: true };
  }
}
