import type { Locale } from "@/i18n/routing";
import { getBrowserClient } from "@/lib/supabase/browser";
import { clearGuestSession, loadGuestSession, saveGuestSession } from "./guest-session";
import { classifyOrderError, type OrderErrorKind } from "./order-errors";
import { loadPending, savePendingSession } from "./pending-order";

// Sending a guest order from the phone (loaded only when the guest sends, so
// the menu itself carries no Supabase code):
//  1. an anonymous session on first use (no sign-in screen);
//  2. api.guest_join_table with the table token: the guest session for this table;
//  3. api.guest_place_order with the pending order's saved idempotency key.
// The pending order must already be saved (beginPending) before this runs.
export type PlaceResult = { kind: "placed"; orderId: string } | OrderErrorKind;

const TIMEOUT_MS = 15_000;

type AuthFailure = { status?: number; name?: string; message: string };
function authFailure(e: AuthFailure): OrderErrorKind {
  if (!e.status || /Retryable|Fetch/i.test(e.name ?? "") || /fetch|network/i.test(e.message)) return { kind: "offline" };
  if (e.status === 429) return { kind: "rate_limited" };
  return { kind: "failed" };
}

export async function placeOrder(args: { token: string; tableId: string; locationId: string; locale: Locale }): Promise<PlaceResult> {
  const storage = window.localStorage;
  const scope = { locationId: args.locationId, tableId: args.tableId };
  const supabase = getBrowserClient();

  for (let attempt = 0; attempt < 3; attempt++) {
    const pending = loadPending(storage, scope);
    if (!pending) return { kind: "failed" };

    let session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      const signedIn = await supabase.auth.signInAnonymously();
      if (signedIn.error || !signedIn.data.session) return signedIn.error ? authFailure(signedIn.error) : { kind: "failed" };
      session = signedIn.data.session;
    }
    const userId = session.user.id;

    let guestSessionId = pending.guestSessionId ?? loadGuestSession(storage, args.tableId, userId);
    if (!guestSessionId) {
      const joined = await supabase
        .schema("api")
        .rpc("guest_join_table", { p_token: args.token, p_locale: args.locale })
        .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
      if (joined.error || !joined.data) {
        const why = classifyOrderError({ status: joined.status, error: joined.error });
        if (why.kind === "auth" && attempt < 2) {
          await supabase.auth.refreshSession();
          continue;
        }
        return why;
      }
      guestSessionId = joined.data;
      saveGuestSession(storage, args.tableId, userId, guestSessionId);
    }
    // The session goes with the key: a retry must repeat the same request.
    savePendingSession(storage, scope, guestSessionId);

    const placed = await supabase
      .schema("api")
      .rpc("guest_place_order", { p_guest_session_id: guestSessionId, p_idempotency_key: pending.key, p_lines: pending.lines })
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    if (!placed.error && placed.data) return { kind: "placed", orderId: placed.data };

    const why = classifyOrderError({ status: placed.status, error: placed.error });
    if (why.kind === "rejoin" && attempt < 2) {
      // The guest session ended (expired or the table was closed): join again.
      clearGuestSession(storage, args.tableId);
      savePendingSession(storage, scope, null);
      continue;
    }
    if (why.kind === "auth" && attempt < 2) {
      await supabase.auth.refreshSession();
      continue;
    }
    return why;
  }
  return { kind: "failed" };
}
