"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import styles from "./guest.module.css";
import { BellIcon, CheckIcon } from "./ui";

// "Call the waiter" on the menu, before or without an order. Shared state, so
// the button in the header and the one in the bar that slides in on scroll
// show the same thing. One tap asks, a second confirms: a stray tap never
// sends a waiter over.
type State = "idle" | "confirm" | "sending" | "called" | "failed";

let state: State = "idle";
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function set(next: State, revertAfterMs?: number) {
  state = next;
  clearTimeout(timer);
  if (revertAfterMs) timer = setTimeout(() => set("idle"), revertAfterMs);
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const CALLED_FOR_MS = 90_000;

export function CallWaiterButton({
  token,
  tableId,
  compact = false,
}: {
  token: string;
  tableId: string;
  compact?: boolean;
}) {
  const { t, locale } = useGuestI18n();
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => "idle" as State,
  );

  // A guest who scrolls away mid-question shouldn't leave it hanging.
  useEffect(() => () => void (state === "confirm" && set("idle")), []);

  const send = async () => {
    set("sending");
    const { callWaiter } = await import("@/features/ordering/call-waiter");
    const result = await callWaiter({ token, tableId, locale }).catch(() => "failed" as const);
    if (result === "called") set("called", CALLED_FOR_MS);
    else set("failed", 4000);
  };

  const pill =
    "inline-flex min-h-11 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors";

  if (current === "confirm") {
    return (
      <span
        role="group"
        aria-label={t("menu.callConfirm")}
        className={`inline-flex items-center gap-1.5 ${styles.pop}`}
      >
        {!compact && <span className="text-sm font-semibold">{t("menu.callConfirm")}</span>}
        <button
          type="button"
          onClick={() => void send()}
          className={`${pill} bg-apricot text-ink hover:bg-apricot-deep active:scale-95`}
        >
          {compact ? t("menu.callConfirm") : t("menu.callYes")}
        </button>
        <button
          type="button"
          onClick={() => set("idle")}
          className={`${pill} border-line-strong text-muted hover:bg-mist border bg-white`}
        >
          {t("menu.callCancel")}
        </button>
      </span>
    );
  }

  if (current === "called") {
    return (
      <span role="status" className={`${pill} bg-tarragon text-white ${styles.pop}`}>
        <CheckIcon />
        {t("menu.waiterCalled")}
      </span>
    );
  }

  const sending = current === "sending";
  return (
    <>
      <button
        type="button"
        disabled={sending}
        onClick={() => set("confirm", 8000)}
        aria-label={compact ? t("order.callWaiter") : undefined}
        className={`${pill} border-tarragon text-tarragon hover:bg-tarragon-tint relative border bg-white active:scale-95 disabled:opacity-80`}
        data-testid={compact ? "call-waiter-compact" : "call-waiter"}
      >
        {sending && (
          <span
            aria-hidden="true"
            className="border-tarragon absolute inset-0 animate-ping rounded-full border-2"
          />
        )}
        <span className={sending ? styles.ringing : styles.bell}>
          <BellIcon />
        </span>
        {!compact && t("order.callWaiter")}
      </button>
      {current === "failed" && (
        <span role="alert" className="text-pomegranate text-sm font-semibold">
          {t("order.requestFailed")}
        </span>
      )}
    </>
  );
}
