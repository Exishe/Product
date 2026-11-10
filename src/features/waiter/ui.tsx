"use client";

import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import type { Connection } from "@/features/kitchen/connection";

// Buttons on the waiter tablet are at least 56 px tall (plan.md, global constraints).
export const btn = {
  base: "inline-flex min-h-14 items-center justify-center gap-2 rounded-sheet px-4 text-base font-bold disabled:cursor-not-allowed",
  primary: "bg-apricot text-ink disabled:bg-mist disabled:text-muted",
  go: "bg-tarragon text-white disabled:bg-mist disabled:text-muted",
  ink: "bg-ink text-matsoni disabled:bg-mist disabled:text-muted",
  quiet: "border border-line-strong bg-white text-ink disabled:border-mist disabled:text-muted",
  danger: "border border-pomegranate bg-white text-pomegranate disabled:border-mist disabled:text-muted",
};
export const button = (kind: keyof Omit<typeof btn, "base">, extra?: string) => clsx(btn.base, btn[kind], extra);

export const chip = {
  base: "inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold",
  plain: "bg-mist text-muted",
  wait: "bg-apricot text-ink",
  ready: "bg-tarragon text-white",
  done: "bg-tarragon-tint text-tarragon",
  alert: "bg-pom-tint text-pomegranate",
};

// A modal sheet on the native <dialog>: focus moves in, Escape closes, the
// page behind is inert.
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
        "m-auto max-h-[92dvh] w-[calc(100vw-2rem)] overflow-hidden rounded-sheet bg-white p-0 text-ink shadow-float backdrop:bg-ink/40",
        wide ? "max-w-4xl" : "max-w-lg",
      )}
    >
      {children}
    </dialog>
  );
}

export type Toast = { id: number; text: string; tone: "info" | "conflict" | "error" };

export function Toasts({ toasts, onDismiss }: { toasts: readonly Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-40 grid justify-items-center gap-2 px-4">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          role="status"
          data-testid="toast"
          data-tone={toast.tone}
          onClick={() => onDismiss(toast.id)}
          className={clsx(
            "pointer-events-auto max-w-xl rounded-sheet bg-ink px-6 py-3 text-left text-base font-semibold text-matsoni shadow-float",
            toast.tone === "conflict" && "border-l-8 border-apricot",
            toast.tone === "error" && "border-l-8 border-pom-on-dark",
          )}
        >
          {toast.text}
        </button>
      ))}
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
  return (
    <span
      role="status"
      data-testid="connection"
      data-state={state}
      className={clsx(
        "inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-sm font-semibold",
        state === "offline" ? "border-pomegranate bg-pomegranate text-white" : "border-line bg-white text-ink",
      )}
    >
      <span
        aria-hidden="true"
        className={clsx(
          "size-2.5 shrink-0 rounded-full",
          state === "online" ? "bg-tarragon" : state === "connecting" ? "bg-apricot" : "bg-white",
        )}
      />
      {label}
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
      className="fixed inset-0 z-50 grid place-items-center bg-matsoni px-6 text-center"
    >
      <div className="grid max-w-xl justify-items-center gap-4">
        <h2 id="revoked-title" className="display-face text-[2.375rem] leading-tight">
          {t("title")}
        </h2>
        <p className="text-xl text-muted">{t("body")}</p>
        <Link href="/pair" className={button("primary", "mt-4 px-10 text-xl")}>
          {t("action")}
        </Link>
      </div>
    </div>
  );
}
