"use client";

import { clsx } from "clsx";
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
  return (
    <span
      role="status"
      data-testid="connection"
      data-state={state}
      className={clsx(
        "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-1 text-base font-semibold",
        state === "offline" ? "border-pom-on-dark bg-pomegranate text-white" : "border-basalt-3 bg-basalt-2 text-slip",
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          "size-3 shrink-0 rounded-full",
          state === "online" ? "bg-tarragon-on-dark" : state === "connecting" ? "bg-apricot-on-dark" : "bg-white",
        )}
      />
      <span className="grid leading-tight">
        <span data-testid="connection-label">{label}</span>
        {state === "offline" && lastSyncAt !== null && (
          <span className="text-sm font-normal">{t("lastSync", { time: formatTime(new Date(lastSyncAt), timeZone) })}</span>
        )}
      </span>
    </span>
  );
}

export type Toast = { id: number; title: string; detail?: string; tone: "conflict" | "error" };

export function Toasts({ toasts, onDismiss }: { toasts: readonly Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div aria-live="assertive" className="pointer-events-none fixed inset-x-0 bottom-6 z-30 grid justify-items-center gap-3 px-4">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          role="alert"
          data-testid="toast"
          onClick={() => onDismiss(toast.id)}
          className={clsx(
            "pointer-events-auto grid max-w-xl rounded-sheet border-l-8 bg-ink px-6 py-4 text-left text-slip shadow-float",
            toast.tone === "conflict" ? "border-apricot" : "border-pom-on-dark",
          )}
        >
          <span className="text-2xl font-bold">{toast.title}</span>
          {toast.detail && <span className="text-lg text-slip-dim">{toast.detail}</span>}
        </button>
      ))}
    </div>
  );
}

// screens.md §7, "Device signed out".
export function DisconnectedScreen() {
  const t = useTranslations("kitchen.revoked");
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="revoked-title" className="fixed inset-0 z-50 grid place-items-center bg-basalt px-6 text-center text-slip">
      <div className="grid max-w-xl justify-items-center gap-4">
        <h2 id="revoked-title" className="text-4xl font-bold">
          {t("title")}
        </h2>
        <p className="text-2xl text-slip-dim">{t("body")}</p>
        <Link href="/pair" className="mt-4 inline-grid min-h-[72px] place-items-center rounded-sheet bg-apricot px-10 text-2xl font-bold text-ink">
          {t("action")}
        </Link>
      </div>
    </div>
  );
}
