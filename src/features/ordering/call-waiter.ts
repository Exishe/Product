import type { Locale } from "@/i18n/routing";
import { getBrowserClient } from "@/lib/supabase/browser";
import { clearGuestSession, loadGuestSession, saveGuestSession } from "./guest-session";
import { classifyOrderError } from "./order-errors";

// Calling the waiter from the menu, before any order: the same anonymous
// session and guest session (api.guest_join_table) the order uses, then
// api.guest_service_request. A second call while one is open returns the open
// request, so a double tap never rings twice.
export type CallResult = "called" | "offline" | "rate_limited" | "failed";

const TIMEOUT_MS = 15_000;

export async function callWaiter(args: {
  token: string;
  tableId: string;
  locale: Locale;
}): Promise<CallResult> {
  const storage = window.localStorage;
  const supabase = getBrowserClient();

  for (let attempt = 0; attempt < 3; attempt++) {
    let session = (await supabase.auth.getSession()).data.session;
    if (!session) {
      const signedIn = await supabase.auth.signInAnonymously();
      if (signedIn.error || !signedIn.data.session) {
        const status = signedIn.error?.status;
        return !status ? "offline" : status === 429 ? "rate_limited" : "failed";
      }
      session = signedIn.data.session;
    }
    const userId = session.user.id;

    let guestSessionId = loadGuestSession(storage, args.tableId, userId);
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
        return simple(why.kind);
      }
      guestSessionId = joined.data;
      saveGuestSession(storage, args.tableId, userId, guestSessionId);
    }

    const asked = await supabase
      .schema("api")
      .rpc("guest_service_request", { p_guest_session_id: guestSessionId, p_kind: "call_waiter" })
      .abortSignal(AbortSignal.timeout(TIMEOUT_MS));
    if (!asked.error) return "called";

    const why = classifyOrderError({ status: asked.status, error: asked.error });
    if ((why.kind === "rejoin" || why.kind === "auth") && attempt < 2) {
      if (why.kind === "rejoin") clearGuestSession(storage, args.tableId);
      else await supabase.auth.refreshSession();
      continue;
    }
    return simple(why.kind);
  }
  return "failed";
}

function simple(kind: string): CallResult {
  return kind === "offline" ? "offline" : kind === "rate_limited" ? "rate_limited" : "failed";
}
