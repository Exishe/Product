"use client";

import { clsx } from "clsx";
import { CircleAlert, RefreshCw, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { formatTime } from "@/lib/format/date";
import type { Connection } from "./connection";

// Top-bar connection label (R1, RB1): green, amber while (re)connecting, red
// «Կապ չկա» with the number of taps waiting and the time of the last data.
export function ConnectionPill({
  state,
  waiting,
  lastSyncAt,
  timeZone,
}: {
  state: Connection;
  waiting: number;
  lastSyncAt: number | null;
  timeZone: string;
}) {
  const t = useTranslations("kitchen.connection");
  const label =
    state === "online"
      ? t("online")
      : state === "connecting"
        ? t("connecting")
        : waiting > 0
          ? t("offlineWaiting", { count: waiting })
          : t("offline");
  const Icon = state === "online" ? Wifi : state === "connecting" ? RefreshCw : WifiOff;
  return (
    <span
      role="status"
      data-testid="connection"
      data-state={state}
      className={clsx(
        "inline-flex min-h-14 items-center gap-2 rounded-full px-4 py-1 text-lg font-semibold",
        state === "offline" ? "bg-late-on-dark text-white" : state === "connecting" ? "bg-apricot text-ink" : "bg-basalt-3 text-slip",
      )}
    >
      <Icon aria-hidden="true" className={clsx("size-5 shrink-0", state === "online" && "text-tarragon-on-dark")} />
      <span className="grid leading-tight">
        <span data-testid="connection-label">{label}</span>
        {state === "offline" && lastSyncAt !== null && (
          <span className="text-base font-normal">{t("lastSync", { time: formatTime(new Date(lastSyncAt), timeZone) })}</span>
        )}
      </span>
    </span>
  );
}

export type Toast = { id: number; title: string; detail?: string; tone: "conflict" | "error" };

export function Toasts({ toasts, onDismiss }: { toasts: readonly Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div aria-live="assertive" className="pointer-events-none fixed inset-x-0 bottom-6 z-30 grid justify-items-center gap-3 px-4">
      {toasts.map((toast) => {
        const Icon = toast.tone === "conflict" ? TriangleAlert : CircleAlert;
        return (
          <button
            key={toast.id}
            type="button"
            role="alert"
            data-testid="toast"
            onClick={() => onDismiss(toast.id)}
            className={clsx(
              "pointer-events-auto flex max-w-xl items-start gap-4 rounded-2xl border-4 bg-basalt-3 px-6 py-4 text-left text-slip shadow-float",
              toast.tone === "conflict" ? "border-apricot" : "border-late-on-dark",
            )}
          >
            <Icon aria-hidden="true" className={clsx("mt-0.5 size-8 shrink-0", toast.tone === "conflict" ? "text-apricot" : "text-pom-on-dark")} />
            <span className="grid">
              <span className="text-2xl font-bold">{toast.title}</span>
              {toast.detail && <span className="text-lg text-slip-dim">{toast.detail}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// screens.md §7, "Device signed out".
export function DisconnectedScreen() {
  const t = useTranslations("kitchen.revoked");
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="revoked-title" className="fixed inset-0 z-50 grid place-items-center bg-basalt px-6 text-center text-slip">
      <div className="grid max-w-xl justify-items-center gap-4">
        <WifiOff aria-hidden="true" className="size-16 text-slip-dim" />
        <h2 id="revoked-title" className="text-4xl font-bold">
          {t("title")}
        </h2>
        <p className="text-2xl text-slip-dim">{t("body")}</p>
        <Link href="/pair" className="mt-4 inline-grid min-h-[72px] place-items-center rounded-xl bg-slip px-10 text-2xl font-bold text-ink">
          {t("action")}
        </Link>
      </div>
    </div>
  );
}
