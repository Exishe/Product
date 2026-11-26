"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import type { Locale } from "@/i18n/routing";
import {
  beginRequest,
  clearRequest,
  loadRequest,
  RETRY_MS,
  type RequestKind,
} from "@/features/ordering/pending-request";
import {
  askedFor,
  callState,
  noteIsHidden,
  set,
  setAsked,
  subscribe,
  type Ask,
} from "./call-waiter-state";
import { ChevronRight, ConciergeBell, ReceiptText } from "./icons";
import styles from "./guest.module.css";
import { BackIcon, CheckIcon } from "./ui";

const CALLED_FOR_MS = 90_000;
let busy = false;
const loadSender = () => import("@/features/ordering/call-waiter");

/** Fetches the sending code too, while the guest reads the menu. */
export const warmSender = () => void loadSender().catch(() => {});

type Target = { token: string; tableId: string; locale: Locale };

// Sends the saved request. The database keeps one open request per table and
// kind, so sending it again after a lost answer never rings twice.
async function attempt(target: Target) {
  if (busy) return;
  busy = true;
  const ask = askedFor();
  if (callState() !== "unsent") set("sending");
  try {
    // The sending code itself may not have loaded (no signal): that is "no answer" too.
    const result = await loadSender()
      .then(({ callWaiter }) => callWaiter({ ...target, kind: ask.kind, payment: ask.payment }))
      .catch(() => "offline" as const);
    if (result === "offline") {
      set("unsent");
      return;
    }
    clearRequest(window.localStorage, target.tableId, ask.kind);
    if (result === "called") set("called", CALLED_FOR_MS);
    else set("failed", 4000);
  } finally {
    busy = false;
  }
}

// The Waiter item's choices (ADR-093 area pass), inside the bottom panel just
// above the bar, not a card over the menu: two 56 px rows, «Call the waiter»
// (sent at once: opening the choices was the first tap) and «Ask for the
// bill», which asks card or cash first, the same request and choice the
// status page has. A guest who ordered by voice, or never ordered from this
// phone, still finds the bill here. After sending: one line that says what
// the waiter knows; with no answer: «not sent yet» and Try again.
export function CallWaiterPrompt({ token, tableId }: { token: string; tableId: string }) {
  const { t, locale } = useGuestI18n();
  // Read without useCallWaiter: its leave-the-page reset belongs to the page,
  // not to this panel mounting (React's dev double mount would close it).
  const current = useSyncExternalStore(subscribe, callState, () => "idle" as const);
  const cancel = useCallback(() => set("idle"), []);
  const [paying, setPaying] = useState(false);
  if (current !== "confirm" && current !== "sending" && paying) setPaying(false);

  const target = { token, tableId, locale: locale as Locale };
  const send = (ask: Ask) => {
    setAsked(ask);
    try {
      beginRequest(window.localStorage, tableId, ask.kind, ask.payment);
    } catch {
      // storage blocked: still send, just without the saved copy
    }
    void attempt(target);
  };

  // A request left unsent before a reload: show it and try again at once.
  useEffect(() => {
    warmSender();
    if (callState() !== "idle") return;
    const left = (["call_waiter", "bring_bill"] as RequestKind[])
      .map((k) => loadRequest(window.localStorage, tableId, k))
      .find((r) => r !== null);
    if (!left) return;
    setAsked({ kind: left.kind, payment: left.payment });
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

  // Escape closes the choices, like any sheet.
  useEffect(() => {
    if (current !== "confirm") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && cancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, cancel]);

  const hidden = useSyncExternalStore(subscribe, noteIsHidden, () => false);
  if (current === "idle" || (current === "called" && hidden)) return null;
  const bill = askedFor().kind === "bring_bill";
  const row =
    "border-line flex min-h-14 w-full items-center gap-3 border-b px-1 text-left text-body font-semibold last:border-b-0 disabled:opacity-60";
  const pill = `${styles.cta} inline-flex min-h-12 items-center justify-center gap-2 px-5 text-body font-semibold`;
  const choice =
    "border-line-strong bg-page hover:bg-chip inline-flex min-h-14 items-center justify-center rounded-full border text-body font-semibold disabled:opacity-60";
  return (
    <div
      className={`text-ink pointer-events-auto lg:bg-page lg:shadow-float lg:rounded-feature lg:px-4 lg:py-2 ${styles.pop}`}
      data-testid="call-waiter"
    >
      {current === "confirm" || current === "sending" ? (
        paying ? (
          <div role="group" aria-label={t("order.payTitle")} className="grid gap-2 pb-1">
            <div className="flex min-h-11 items-center gap-1">
              <button
                type="button"
                onClick={() => setPaying(false)}
                aria-label={t("order.payBack")}
                className="hover:bg-chip -ml-2 grid size-11 flex-none place-items-center rounded-full"
              >
                <BackIcon />
              </button>
              <p className="m-0 font-semibold">{t("order.payTitle")}</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={choice}
                disabled={current === "sending"}
                onClick={() => send({ kind: "bring_bill", payment: "card" })}
              >
                {t("order.payCard")}
              </button>
              <button
                type="button"
                className={choice}
                disabled={current === "sending"}
                onClick={() => send({ kind: "bring_bill", payment: "cash" })}
              >
                {t("order.payCash")}
              </button>
            </div>
          </div>
        ) : (
          <div role="group" aria-label={t("nav.waiter")}>
            <button
              type="button"
              className={row}
              disabled={current === "sending"}
              onClick={() => send({ kind: "call_waiter", payment: null })}
            >
              <ConciergeBell size={22} />
              <span className="min-w-0 flex-1">{t("order.callWaiter")}</span>
            </button>
            <button
              type="button"
              className={row}
              disabled={current === "sending"}
              aria-expanded={false}
              onClick={() => setPaying(true)}
            >
              <ReceiptText size={22} />
              <span className="min-w-0 flex-1">{t("order.askBill")}</span>
              <ChevronRight size={20} className="text-muted" />
            </button>
          </div>
        )
      ) : current === "unsent" ? (
        <div className="grid gap-2 py-1">
          <p role="status" className="text-alert px-1 font-semibold" data-testid="call-unsent">
            {t("order.notSent")}
          </p>
          <button type="button" onClick={() => void attempt(target)} className={`${pill} justify-self-start`}>
            {t("order.retryRequest")}
          </button>
        </div>
      ) : current === "called" ? (
        <p role="status" className="text-success flex min-h-12 items-center gap-2 px-1 font-semibold">
          <CheckIcon />
          {bill ? t("order.billTold") : t("menu.waiterCalled")}
        </p>
      ) : (
        <p role="alert" className="text-alert flex min-h-12 items-center px-1 font-semibold">
          {t("order.requestFailed")}
        </p>
      )}
    </div>
  );
}
