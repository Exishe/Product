"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import styles from "./guest.module.css";
import { CheckIcon } from "./ui";

// "Call the waiter" on the menu, before or without an order: the Waiter item
// of the bottom bar, with its question just above the bar. One tap asks, a
// second confirms: a stray tap never sends a waiter over. Module state, so
// the item and the question (rendered apart) show the same thing.
export type CallState = "idle" | "confirm" | "sending" | "called" | "failed";

let state: CallState = "idle";
let timer: ReturnType<typeof setTimeout> | undefined;
// "Called" lasts 90 s on the bar item; the note above the bar only 4 s.
let noteHidden = false;
let noteTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function set(next: CallState, revertAfterMs?: number) {
  state = next;
  clearTimeout(timer);
  clearTimeout(noteTimer);
  noteHidden = false;
  if (next === "called")
    noteTimer = setTimeout(() => {
      noteHidden = true;
      listeners.forEach((l) => l());
    }, 4000);
  if (revertAfterMs) timer = setTimeout(() => set("idle"), revertAfterMs);
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const CALLED_FOR_MS = 90_000;

export function useCallWaiter() {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => "idle" as CallState,
  );
  // A guest who leaves the page mid-question shouldn't leave it hanging.
  useEffect(() => () => void (state === "confirm" && set("idle")), []);
  return {
    state: current,
    ask: () => (state === "confirm" ? set("idle") : state === "idle" || state === "failed" ? set("confirm", 8000) : undefined),
    cancel: () => set("idle"),
  };
}

/** The question and its answers, shown above the bottom bar. */
export function CallWaiterPrompt({ token, tableId }: { token: string; tableId: string }) {
  const { t, locale } = useGuestI18n();
  const { state: current, cancel } = useCallWaiter();

  const send = async () => {
    set("sending");
    const { callWaiter } = await import("@/features/ordering/call-waiter");
    const result = await callWaiter({ token, tableId, locale }).catch(() => "failed" as const);
    if (result === "called") set("called", CALLED_FOR_MS);
    else set("failed", 4000);
  };

  const pill = "inline-flex min-h-12 items-center justify-center gap-2 rounded-pill px-4 text-sm font-semibold";
  const hidden = useSyncExternalStore(
    subscribe,
    () => noteHidden,
    () => false,
  );
  if (current === "idle" || (current === "called" && hidden)) return null;
  return (
    <div
      className={`bg-surface text-ink shadow-float pointer-events-auto rounded-card border border-line p-3 ${styles.pop}`}
      data-testid="call-waiter"
    >
      {current === "confirm" || current === "sending" ? (
        <div role="group" aria-label={t("menu.callConfirm")} className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 px-1 font-semibold">{t("menu.callConfirm")}</span>
          <button type="button" disabled={current === "sending"} onClick={() => void send()} className={`${pill} bg-accent text-on-accent`}>
            {t("menu.callYes")}
          </button>
          <button type="button" disabled={current === "sending"} onClick={cancel} className={`${pill} border-line-strong border`}>
            {t("menu.callCancel")}
          </button>
        </div>
      ) : current === "called" ? (
        <p role="status" className="text-success flex items-center gap-2 px-1 font-semibold">
          <CheckIcon />
          {t("menu.waiterCalled")}
        </p>
      ) : (
        <p role="alert" className="text-alert px-1 font-semibold">
          {t("order.requestFailed")}
        </p>
      )}
    </div>
  );
}
