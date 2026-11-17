"use client";

import { clsx } from "clsx";
import { CircleAlert, CircleCheck, RefreshCw, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import type { Connection } from "@/features/kitchen/connection";

// Staff controls (ADR-054, Apple HIG adapted): one filled tint for the main
// action, grey fill for the others, red only for what removes something.
// Every control is at least 48 px tall on the waiter's phone.
export const btn = {
  base: "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-4 text-[1.0625rem] leading-tight font-semibold disabled:cursor-not-allowed [&_svg]:size-5 [&_svg]:shrink-0",
  primary: "bg-tarragon text-white disabled:bg-staff-fill disabled:text-staff-label2",
  secondary: "bg-staff-fill text-ink disabled:text-staff-label2",
  danger: "bg-pom-tint text-pomegranate disabled:bg-staff-fill disabled:text-staff-label2",
  destructive: "bg-pomegranate text-white disabled:bg-staff-fill disabled:text-staff-label2",
};
export const button = (kind: keyof Omit<typeof btn, "base">, extra?: string) => clsx(btn.base, btn[kind], extra);

// A choice in a list (reason, payment): selected is tinted, ringed and ticked,
// so it never relies on colour alone.
export const choice =
  "inline-flex min-h-12 items-center justify-between gap-2 rounded-xl bg-white px-4 text-left text-[1.0625rem] font-semibold text-ink ring-1 ring-staff-sep aria-pressed:bg-tarragon-tint aria-pressed:text-tarragon aria-pressed:ring-2 aria-pressed:ring-tarragon [&_svg]:size-5 [&_svg]:shrink-0";

export const chip = {
  base: "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.8125rem] leading-5 font-semibold [&_svg]:size-3.5 [&_svg]:shrink-0",
  plain: "bg-staff-fill text-staff-label2",
  wait: "bg-apricot text-ink",
  ready: "bg-tarragon text-white",
  done: "bg-tarragon-tint text-tarragon",
  alert: "bg-pom-tint text-pomegranate",
};

// A modal sheet on the native <dialog>: focus moves in, Escape closes, the
// page behind is inert. A bottom sheet on phones, a centred card from 640 px.
export function Sheet({
  labelledBy,
  onClose,
  children,
  wide,
}: {
  labelledBy: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      close.current();
    };
    d.addEventListener("cancel", onCancel);
    return () => d.removeEventListener("cancel", onCancel);
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      className={clsx(
        "m-auto max-h-[92dvh] w-[calc(100vw-2rem)] overflow-hidden rounded-2xl bg-staff-bg p-0 text-ink shadow-float backdrop:bg-black/40",
        "max-sm:mb-0 max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none max-sm:pb-[env(safe-area-inset-bottom,0px)]",
        wide ? "max-w-4xl" : "max-w-lg",
      )}
    >
      {children}
    </dialog>
  );
}

export type Toast = { id: number; text: string; tone: "info" | "conflict" | "error" };

const TOAST_ICON = { info: CircleCheck, conflict: TriangleAlert, error: CircleAlert } as const;

// Banners at the top, as on iOS: they never cover the panel's buttons.
export function Toasts({ toasts, onDismiss }: { toasts: readonly Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)+0.5rem)] z-40 grid justify-items-center gap-2 px-4"
    >
      {toasts.map((toast) => {
        const Icon = TOAST_ICON[toast.tone];
        return (
          <button
            key={toast.id}
            type="button"
            role="status"
            data-testid="toast"
            data-tone={toast.tone}
            onClick={() => onDismiss(toast.id)}
            className="pointer-events-auto flex max-w-xl items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-left text-[0.9375rem] font-semibold text-white shadow-float"
          >
            <Icon
              aria-hidden="true"
              className={clsx(
                "size-5 shrink-0",
                toast.tone === "info" ? "text-tarragon-on-dark" : toast.tone === "conflict" ? "text-apricot-on-dark" : "text-pom-on-dark",
              )}
            />
            {toast.text}
          </button>
        );
      })}
    </div>
  );
}

export function ConnectionPill({ state, waiting }: { state: Connection; waiting: number }) {
  const t = useTranslations("waiter.connection");
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
        "inline-flex min-h-8 min-w-0 items-center gap-1.5 rounded-full px-2.5 text-[0.8125rem] font-semibold",
        state === "offline" ? "bg-pomegranate text-white" : state === "connecting" ? "bg-apricot text-ink" : "bg-tarragon-tint text-tarragon",
      )}
    >
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

export function DisconnectedScreen() {
  const t = useTranslations("waiter.revoked");
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="revoked-title"
      className="fixed inset-0 z-50 grid place-items-center bg-staff-bg px-6 text-center"
    >
      <div className="grid max-w-md justify-items-center gap-3">
        <WifiOff aria-hidden="true" className="size-12 text-staff-label2" />
        <h2 id="revoked-title" className="m-0 text-[1.75rem] leading-tight font-bold">
          {t("title")}
        </h2>
        <p className="m-0 text-[1.0625rem] text-staff-label2">{t("body")}</p>
        <Link href="/pair" className={button("primary", "mt-4 min-h-14 px-8")}>
          {t("action")}
        </Link>
      </div>
    </div>
  );
}
