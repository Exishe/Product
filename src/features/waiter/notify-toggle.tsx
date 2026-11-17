"use client";

import { clsx } from "clsx";
import { Bell, BellOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  currentSubscription,
  pushAvailability,
  readPushEnvironment,
  subscribeThisBrowser,
  type PushAvailability,
} from "@/features/notifications/push-browser";
import { getBrowserClient } from "@/lib/supabase/browser";

type State = "loading" | "hidden" | Exclude<PushAvailability, "unconfigured" | "ready"> | "off" | "on";

// «Ծանուցումներ այս սարքում» (ADR-049): this device gets a push when a guest
// calls the waiter or asks for the bill. Not every order (ADR-040). Where push
// is not possible a short note replaces the switch.
export function NotifyToggle({
  restaurantId,
  vapidPublicKey,
  locale,
}: {
  restaurantId: string;
  vapidPublicKey: string | null;
  locale: "hy" | "ru" | "en";
}) {
  const t = useTranslations("waiter.notify");
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const availability = pushAvailability(readPushEnvironment(vapidPublicKey));
      if (availability === "unconfigured") return "hidden" as const;
      if (availability !== "ready") return availability;
      const sub = await currentSubscription();
      if (!sub) return "off" as const;
      const { data } = await getBrowserClient()
        .schema("api")
        .rpc("push_subscription_exists", { p_endpoint: sub.endpoint });
      return data === true ? ("on" as const) : ("off" as const);
    })()
      .then((s) => alive && setState(s))
      .catch(() => alive && setState("unsupported"));
    return () => {
      alive = false;
    };
  }, [vapidPublicKey]);

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
    const { error: failed } = await getBrowserClient()
      .schema("api")
      .rpc("waiter_push_subscribe", {
        p_restaurant_id: restaurantId,
        p_endpoint: result.subscription.endpoint,
        p_p256dh: result.subscription.keys.p256dh,
        p_auth: result.subscription.keys.auth,
        p_user_agent: navigator.userAgent.slice(0, 300),
        p_locale: locale,
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
        await getBrowserClient().schema("api").rpc("delete_push_subscription", { p_endpoint: sub.endpoint });
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
    unsupported: t("unsupported"),
    install: t("install"),
    denied: t("denied"),
  };
  const note = notes[state];

  return (
    <span className="contents" data-testid="waiter-notify" data-state={state}>
      {(state === "on" || state === "off") && (
        <button
          type="button"
          role="switch"
          aria-checked={state === "on"}
          disabled={busy}
          onClick={() => void (state === "on" ? turnOff() : turnOn())}
          className={clsx(
            "inline-flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-[0.8125rem] font-semibold disabled:opacity-60",
            state === "on" ? "bg-tarragon-tint text-tarragon" : "bg-staff-fill text-ink",
          )}
        >
          {state === "on" ? <Bell aria-hidden="true" className="size-5" /> : <BellOff aria-hidden="true" className="size-5" />}
          {/* Icon only on phones; the switch keeps its name and state for screen readers. */}
          <span className="max-lg:sr-only">
            {t("label")} <span className="font-normal">{state === "on" ? t("on") : t("off")}</span>
          </span>
        </button>
      )}
      {note && (
        <span role="status" className="basis-full text-[0.8125rem] text-staff-label2 lg:basis-auto">
          {note}
        </span>
      )}
      {error && (
        <span role="alert" className="basis-full text-[0.8125rem] text-pomegranate lg:basis-auto">
          {t("error")}
        </span>
      )}
    </span>
  );
}
