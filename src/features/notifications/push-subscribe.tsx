"use client";

import { useTranslations } from "next-intl";
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
      className="rounded-sheet border-line flex flex-col gap-3 border bg-white p-4"
      aria-labelledby="push-title"
      data-testid="push-section"
    >
      <h2 id="push-title" className="text-lg font-semibold">
        {t("title")}
      </h2>
      <p className="text-muted">{t("hint")}</p>
      {note[status] && (
        <p role="status" className="rounded-input bg-mist p-3" data-testid="push-status">
          {note[status]}
        </p>
      )}
      {status === "off" && (
        <button
          type="button"
          onClick={turnOn}
          disabled={busy}
          className="rounded-input bg-tarragon h-12 px-4 font-semibold text-white disabled:opacity-60"
        >
          {t("turnOn")}
        </button>
      )}
      {status === "on" && (
        <>
          <p role="status" className="text-tarragon font-semibold" data-testid="push-status">
            {t("on")}
          </p>
          <button
            type="button"
            onClick={turnOff}
            disabled={busy}
            className="rounded-input border-pomegranate text-pomegranate h-12 border px-4 font-semibold disabled:opacity-60"
          >
            {t("turnOff")}
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="text-pomegranate">
          {t("error")}
        </p>
      )}
    </section>
  );
}
