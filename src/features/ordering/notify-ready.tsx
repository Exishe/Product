"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import {
  currentSubscription,
  pushAvailability,
  readPushEnvironment,
  subscribeThisBrowser,
  type PushAvailability,
} from "@/features/notifications/push-browser";
import type { Database } from "@/lib/supabase/database";
import { useGuestI18n } from "./guest-i18n-context";

type Db = SupabaseClient<Database>;
type State = "loading" | "hidden" | Exclude<PushAvailability, "unconfigured" | "ready"> | "off" | "on";

// «Notify me when it's ready» (ADR-049): a web push to this phone when the
// kitchen marks the order ready, valid for the table session. Where push is
// not possible (iPhone Safari outside a home-screen app, blocked permission,
// old browser) the button gives way to a short note; the live status page
// keeps working either way.
export function NotifyReady({
  db,
  guestSessionId,
  vapidPublicKey,
}: {
  db: Db;
  guestSessionId: string;
  vapidPublicKey: string | null;
}) {
  const { t } = useGuestI18n();
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  const detect = useCallback(async (): Promise<State> => {
    const availability = pushAvailability(readPushEnvironment(vapidPublicKey));
    if (availability === "unconfigured") return "hidden";
    if (availability !== "ready") return availability;
    const sub = await currentSubscription();
    if (!sub) return "off";
    const { data } = await db.schema("api").rpc("guest_push_exists", {
      p_guest_session_id: guestSessionId,
      p_endpoint: sub.endpoint,
    });
    return data === true ? "on" : "off";
  }, [db, guestSessionId, vapidPublicKey]);

  useEffect(() => {
    let alive = true;
    detect()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState("unsupported"));
    return () => {
      alive = false;
    };
  }, [detect]);

  async function turnOn() {
    if (!vapidPublicKey) return;
    setBusy(true);
    setError(false);
    const result = await subscribeThisBrowser(vapidPublicKey);
    if (!result.ok) {
      if (result.reason === "failed") setError(true);
      else setState(result.reason === "denied" ? "denied" : "off");
      setBusy(false);
      return;
    }
    const { error: failed } = await db.schema("api").rpc("guest_push_subscribe", {
      p_guest_session_id: guestSessionId,
      p_subscription: result.subscription,
      p_user_agent: navigator.userAgent.slice(0, 300),
    });
    if (failed) setError(true);
    else setState("on");
    setBusy(false);
  }

  async function turnOff() {
    setBusy(true);
    setError(false);
    try {
      const sub = await currentSubscription();
      if (sub) {
        await db.schema("api").rpc("delete_push_subscription", { p_endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off");
    } catch {
      setError(true);
    }
    setBusy(false);
  }

  if (state === "loading" || state === "hidden") return null;
  const notes: Partial<Record<State, string>> = {
    unsupported: t("order.notifyUnsupported"),
    install: t("order.notifyInstall"),
    denied: t("order.notifyDenied"),
  };

  return (
    <div className="my-3 grid gap-2" data-testid="notify-ready" data-state={state}>
      {state === "off" && (
        <button
          type="button"
          className="rounded-sheet border-line-strong min-h-[52px] border bg-white px-3 font-semibold disabled:opacity-60"
          disabled={busy}
          onClick={() => void turnOn()}
        >
          {t("order.notifyReady")}
        </button>
      )}
      {state === "on" && (
        <>
          <p className="text-tarragon m-0 font-semibold" role="status">
            {t("order.notifyOn")}
          </p>
          <button
            type="button"
            className="text-tarragon min-h-12 justify-self-start font-semibold disabled:opacity-60"
            disabled={busy}
            onClick={() => void turnOff()}
          >
            {t("order.notifyOff")}
          </button>
        </>
      )}
      {notes[state] && (
        <p className="text-muted m-0 text-sm" role="status">
          {notes[state]}
        </p>
      )}
      {error && (
        <p className="text-pomegranate m-0 text-sm" role="alert">
          {t("order.notifyError")}
        </p>
      )}
    </div>
  );
}
