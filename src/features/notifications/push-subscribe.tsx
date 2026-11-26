"use client";

import { BellOff, BellRing, CircleCheck, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { button } from "@/features/admin-ui/styles";
import { useEffect, useState } from "react";
import { deletePushSubscription, isPushSubscribed, savePushSubscription } from "./actions";
import {
  currentSubscription,
  pushAvailability,
  readPushEnvironment,
  subscribeThisBrowser,
} from "./push-browser";

// Web push for owners without Telegram (ADR-035). On iPhones it works only
// once the admin is added to the home screen, so the toggle says so.

type Status = "loading" | "unsupported" | "install" | "unconfigured" | "denied" | "off" | "on";

async function detect(vapidPublicKey: string | null): Promise<Status> {
  const availability = pushAvailability(readPushEnvironment(vapidPublicKey));
  if (availability !== "ready") return availability;
  const subscription = await currentSubscription();
  if (subscription && (await isPushSubscribed(subscription.endpoint))) return "on";
  return "off";
}

export function PushSubscribe({ vapidPublicKey }: { vapidPublicKey: string | null }) {
  const t = useTranslations("push");
  const [status, setStatus] = useState<Status>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let alive = true;
    detect(vapidPublicKey)
      .then((s) => alive && setStatus(s))
      .catch(() => alive && setStatus("unsupported"));
    return () => {
      alive = false;
    };
  }, [vapidPublicKey]);

  async function turnOn() {
    if (!vapidPublicKey) return;
    setBusy(true);
    setError(false);
    try {
      const result = await subscribeThisBrowser(vapidPublicKey);
      if (!result.ok) {
        if (result.reason === "failed") setError(true);
        else setStatus(result.reason === "denied" ? "denied" : "off");
        return;
      }
      const ok = await savePushSubscription(result.subscription, navigator.userAgent);
      if (ok) setStatus("on");
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    setError(false);
    try {
      const subscription = await currentSubscription();
      if (subscription) {
        await deletePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus("off");
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  const note: Partial<Record<Status, string>> = {
    unsupported: t("unsupported"),
    install: t("install"),
    unconfigured: t("unconfigured"),
    denied: t("denied"),
  };

  return (
    <section
      className="flex flex-col gap-4"
      aria-labelledby="push-title"
      data-testid="push-section"
    >
      <h2 id="push-title" className="border-staff-sep m-0 flex items-center gap-2 border-b pb-3 text-heading font-semibold">
        {t("title")}
      </h2>
      <p className="text-staff-label2 m-0">{t("hint")}</p>
      {note[status] && (
        // A plain status line with an icon, not a grey box under the heading.
        <p role="status" className="text-ink m-0 flex items-start gap-2" data-testid="push-status">
          <Info aria-hidden="true" className="text-staff-label2 mt-0.5 size-5 shrink-0" />
          {note[status]}
        </p>
      )}
      {status === "off" && (
        <button type="button" onClick={turnOn} disabled={busy} className={button("primary", "self-start max-sm:w-full")}>
          <BellRing aria-hidden="true" />
          {t("turnOn")}
        </button>
      )}
      {status === "on" && (
        <>
          <p
            role="status"
            className="text-ink m-0 flex items-center gap-2 font-semibold"
            data-testid="push-status"
          >
            <CircleCheck aria-hidden="true" className="size-5 shrink-0" />
            {t("on")}
          </p>
          <button type="button" onClick={turnOff} disabled={busy} className={button("danger", "self-start max-sm:w-full")}>
            <BellOff aria-hidden="true" />
            {t("turnOff")}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-pomegranate m-0 font-semibold">
          {t("error")}
        </p>
      )}
    </section>
  );
}
