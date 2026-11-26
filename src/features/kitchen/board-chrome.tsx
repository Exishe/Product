"use client";

import { clsx } from "clsx";
import { CircleAlert, TriangleAlert, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { formatTime } from "@/lib/format/date";
import type { Connection } from "./connection";

// Top-bar connection label (R1, RB1): a green dot and a word while all is
// well, an amber dot while (re)connecting, and a red «Կապ չկա» block with the
// number of taps waiting and the time of the last data.
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
        "inline-flex items-center gap-2 text-lg font-semibold",
        state === "offline" ? "bg-late-on-dark min-h-12 rounded-xl px-4 py-1 text-white" : "text-slip-dim",
      )}
    >
      {state === "offline" ? (
        <WifiOff aria-hidden="true" className="size-5 shrink-0" />
      ) : (
        <span
          aria-hidden="true"
          className={clsx(
            "size-2.5 shrink-0 rounded-full",
            state === "online" ? "bg-tarragon-on-dark" : "bg-apricot-deep",
          )}
        />
      )}
      <span className="grid leading-tight">
        <span data-testid="connection-label">{label}</span>
        {state === "offline" && lastSyncAt !== null && (
          <span className="text-base font-normal">
            {t("lastSync", { time: formatTime(new Date(lastSyncAt), timeZone) })}
          </span>
        )}
      </span>
    </span>
  );
}

export type Toast = { id: number; title: string; detail?: string; tone: "conflict" | "error" };

export function Toasts({ toasts, onDismiss }: { toasts: readonly Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      aria-live="assertive"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-30 grid justify-items-center gap-3 px-4"
    >
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
              "bg-basalt-3 text-slip shadow-float pointer-events-auto flex max-w-xl items-start gap-4 rounded-2xl border-4 px-6 py-4 text-left",
              toast.tone === "conflict" ? "border-apricot-deep" : "border-late-on-dark",
            )}
          >
            <Icon
              aria-hidden="true"
              className={clsx(
                "mt-0.5 size-8 shrink-0",
                toast.tone === "conflict" ? "text-amber-text" : "text-pom-on-dark",
              )}
            />
            <span className="grid">
              <span className="text-2xl font-bold">{toast.title}</span>
              {toast.detail && <span className="text-slip-dim text-lg">{toast.detail}</span>}
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
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="revoked-title"
      className="bg-basalt text-slip fixed inset-0 z-50 grid place-items-center px-6 text-center"
    >
      <div className="grid max-w-xl justify-items-center gap-4">
        <WifiOff aria-hidden="true" className="text-slip-dim size-16" />
        <h2 id="revoked-title" className="text-4xl font-bold">
          {t("title")}
        </h2>
        <p className="text-slip-dim text-2xl">{t("body")}</p>
        <Link
          href="/pair"
          className="bg-slip mt-4 inline-grid min-h-[72px] place-items-center rounded-xl px-10 text-2xl font-bold text-white"
        >
          {t("action")}
        </Link>
      </div>
    </div>
  );
}
