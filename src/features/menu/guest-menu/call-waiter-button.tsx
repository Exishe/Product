"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import type { Locale } from "@/i18n/routing";
import { beginRequest, clearRequest, loadRequest, RETRY_MS } from "@/features/ordering/pending-request";
import styles from "./guest.module.css";
import { CheckIcon } from "./ui";

// "Call the waiter" on the menu, before or without an order: the Waiter item
// of the bottom bar, with its question just above the bar. One tap asks, a
// second confirms: a stray tap never sends a waiter over. Module state, so
// the item and the question (rendered apart) show the same thing.
// "unsent": no answer (offline, timeout, server error). The request is kept in
// storage and retried (see pending-request.ts), never shown as sent.
export type CallState = "idle" | "confirm" | "sending" | "unsent" | "called" | "failed";

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
let busy = false;
const loadSender = () => import("@/features/ordering/call-waiter");

type Target = { token: string; tableId: string; locale: Locale };

// Sends the saved request. The database keeps one open call per table, so
// sending it again after a lost answer never rings twice.
async function attempt(target: Target) {
  if (busy) return;
  busy = true;
  if (state !== "unsent") set("sending");
  try {
    // The sending code itself may not have loaded (no signal): that is "no answer" too.
    const result = await loadSender()
      .then(({ callWaiter }) => callWaiter(target))
      .catch(() => "offline" as const);
    if (result === "offline") {
      set("unsent");
      return;
    }
    clearRequest(window.localStorage, target.tableId, "call_waiter");
    if (result === "called") set("called", CALLED_FOR_MS);
    else set("failed", 4000);
  } finally {
    busy = false;
  }
}

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
    ask: () =>
      state === "confirm"
        ? set("idle")
        : state === "idle" || state === "failed"
          ? set("confirm", 8000)
          : undefined,
    cancel: () => set("idle"),
  };
}

/** The question and its answers, shown above the bottom bar. */
export function CallWaiterPrompt({ token, tableId }: { token: string; tableId: string }) {
  const { t, locale } = useGuestI18n();
  const { state: current, cancel } = useCallWaiter();

  const target = { token, tableId, locale: locale as Locale };
  const send = () => {
    try {
      beginRequest(window.localStorage, tableId, "call_waiter");
    } catch {
      // storage blocked: still send, just without the saved copy
    }
    void attempt(target);
  };

  // A request left unsent before a reload: show it and try again at once.
  useEffect(() => {
    loadSender().catch(() => {}); // fetch the sending code while the guest reads the menu
    if (state !== "idle" || !loadRequest(window.localStorage, tableId, "call_waiter")) return;
    set("unsent");
    void attempt({ token, tableId, locale: locale as Locale });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, token]);

  useEffect(() => {
    if (current !== "unsent") return;
    const retry = () => void attempt({ token, tableId, locale: locale as Locale });
    window.addEventListener("online", retry);
    const interval = setInterval(retry, RETRY_MS);
    return () => {
      window.removeEventListener("online", retry);
      clearInterval(interval);
    };
  }, [current, token, tableId, locale]);

  const pill =
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-pill px-4 text-sm font-semibold";
  const hidden = useSyncExternalStore(
    subscribe,
    () => noteHidden,
    () => false,
  );
  if (current === "idle" || (current === "called" && hidden)) return null;
  return (
    <div
      className={`bg-surface text-ink shadow-float rounded-card border-line pointer-events-auto border p-3 ${styles.pop}`}
      data-testid="call-waiter"
    >
      {current === "confirm" || current === "sending" ? (
        <div role="group" aria-label={t("menu.callConfirm")} className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 px-1 font-semibold">{t("menu.callConfirm")}</span>
          <button
            type="button"
            disabled={current === "sending"}
            onClick={send}
            className={`${pill} ${styles.cta}`}
          >
            {t("menu.callYes")}
          </button>
          <button
            type="button"
            disabled={current === "sending"}
            onClick={cancel}
            className={`${pill} border-line-strong border`}
          >
            {t("menu.callCancel")}
          </button>
        </div>
      ) : current === "unsent" ? (
        <div className="grid gap-2">
          <p role="status" className="text-alert px-1 font-semibold" data-testid="call-unsent">
            {t("order.notSent")}
          </p>
          <button
            type="button"
            onClick={() => void attempt(target)}
            className={`${pill} ${styles.cta} justify-self-start`}
          >
            {t("order.retryRequest")}
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
