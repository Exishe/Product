"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { deletePushSubscription, isPushSubscribed, savePushSubscription } from "./actions";

// Web push for owners without Telegram (ADR-035). On iPhones it works only
// once the admin is added to the home screen, so the toggle says so.

type Status = "loading" | "unsupported" | "install" | "unconfigured" | "denied" | "off" | "on";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = base64url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function detect(vapidPublicKey: string | null): Promise<Status> {
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const standalone = window.matchMedia("(display-mode: standalone)").matches;
    return ios && !standalone ? "install" : "unsupported";
  }
  if (!vapidPublicKey) return "unconfigured";
  if (Notification.permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
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
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: keyBytes(vapidPublicKey),
        }));
      const json = subscription.toJSON();
      const ok = await savePushSubscription(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
        },
        navigator.userAgent,
      );
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
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
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
