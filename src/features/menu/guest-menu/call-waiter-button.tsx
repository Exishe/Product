"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
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
  dismiss,
  noteIsHidden,
  set,
  setAsked,
  subscribe,
  type Ask,
} from "./call-waiter-state";
import { ChevronRight, ConciergeBell, ReceiptText } from "./icons";
import styles from "./guest.module.css";
import { BackIcon, CheckIcon, CloseIcon } from "./ui";

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

// The Waiter item's choices (ADR-094 area pass), inside the bottom panel just
// above the bar, not a card over the menu: two 56 px rows, «Call the waiter»
// (sent at once: opening the choices was the first tap) and «Ask for the
// bill», which asks card or cash first, the same request and choice the
// status page has. A guest who ordered by voice, or never ordered from this
// phone, still finds the bill here. After sending: one line that says what
// the waiter knows; with no answer: «not sent yet» and Try again.
// From 1024 px (`place="rail"`) the same choices and results unfold under the
// order rail's «Waiter» row the guest clicked, not at the foot of the screen:
// that row is the title and carries the × (while the choices or a result
// show), so this part holds only the choices, indented to the row's words,
// on the rail's hairlines, without icons of their own (the row has the bell). Focus moves
// to the first choice, and back to the row when the choices close.
export function CallWaiterPrompt({
  token,
  tableId,
  place = "dock",
  onLeave,
}: {
  token: string;
  tableId: string;
  place?: "dock" | "rail";
  /** Where focus goes when the rail's choices close (the «Waiter» row). */
  onLeave?: () => void;
}) {
  const { t, locale } = useGuestI18n();
  const rail = place === "rail";
  const box = useRef<HTMLDivElement>(null);
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

  // Escape closes the choices, like any sheet. In the rail it also clears a
  // result under the «Waiter» row, as its × does; focus goes back to the row
  // only from the choices, or when it was on the result itself.
  const resultShown = rail && current !== "idle" && current !== "confirm" && current !== "sending";
  useEffect(() => {
    if (current !== "confirm" && !resultShown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const active = document.activeElement;
      const inside = !active || active === document.body || !!box.current?.contains(active);
      if (current === "confirm") cancel();
      else dismiss(tableId);
      if (current === "confirm" || inside) onLeave?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, resultShown, cancel, onLeave, tableId]);

  // In the rail, focus follows the choices: to the first one as they open
  // (to «Card» on the paying step), and back to the «Waiter» row when the
  // choice that held it goes away (sent or closed).
  const choosing = current === "confirm" || current === "sending";
  useEffect(() => {
    if (!rail || current !== "confirm") return;
    box.current?.querySelector<HTMLElement>("[data-choice]")?.focus({ preventScroll: true });
  }, [rail, current, paying]);
  // Only after a key press: a mouse click needs no ring on the row (the
  // browser keeps the reading place for the next Tab anyway).
  const wasChoosing = useRef(false);
  const byKey = useRef(false);
  useEffect(() => {
    if (!rail) return;
    if (choosing) {
      wasChoosing.current = true;
      return;
    }
    if (!wasChoosing.current) return;
    wasChoosing.current = false;
    const lost = !document.activeElement || document.activeElement === document.body;
    if (lost && byKey.current) onLeave?.();
  }, [rail, choosing, onLeave]);

  const hidden = useSyncExternalStore(subscribe, noteIsHidden, () => false);
  if (current === "idle" || (current === "called" && hidden)) return null;
  const bill = askedFor().kind === "bring_bill";
  // The bottom panel's rows are 56 px; the rail's are its own 48 px rows,
  // each under a hairline that starts at the «Waiter» row's words.
  const row = rail
    ? "border-line flex min-h-12 w-full items-center gap-3 border-t text-left text-body font-semibold underline-offset-4 hover:underline disabled:opacity-60"
    : "border-line flex min-h-14 w-full items-center gap-3 border-b px-1 text-left text-body font-semibold last:border-b-0 disabled:opacity-60";
  const line = rail ? "border-line border-t" : "px-1";
  const icon = rail ? 20 : 22;
  const pill = `${styles.cta} inline-flex min-h-12 items-center justify-center gap-2 px-5 text-body font-semibold`;
  const choice = `border-line-strong bg-page hover:bg-chip inline-flex items-center justify-center rounded-full border text-body font-semibold disabled:opacity-60 ${rail ? "min-h-12" : "min-h-14"}`;
  return (
    <div
      ref={box}
      // A click from a key (Enter, Space) has no pointer behind it: detail 0.
      onClickCapture={(e) => (byKey.current = e.detail === 0)}
      className={
        rail
          ? `text-ink pl-8 ${styles.unfold}`
          : `text-ink pointer-events-auto lg:bg-page lg:shadow-float lg:rounded-feature lg:px-4 lg:py-2 ${styles.pop}`
      }
      data-testid="call-waiter"
    >
      {current === "confirm" || current === "sending" ? (
        paying ? (
          <div role="group" aria-label={t("order.payTitle")} className={`grid gap-2 ${rail ? `${line} pb-3` : "pb-1"}`}>
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
                data-choice=""
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
          <div role="group" aria-labelledby={rail ? "rail-waiter" : "waiter-title"}>
            {/* A title and a way to close, like any sheet (ADR-096). In the
                rail the «Waiter» row above is both. */}
            {!rail && (
              <div className="flex min-h-11 items-center justify-between gap-2">
                <p id="waiter-title" className="m-0 px-1 font-semibold">
                  {t("nav.waiter")}
                </p>
                <button
                  type="button"
                  onClick={cancel}
                  aria-label={t("sheet.close")}
                  className="text-muted hover:bg-chip hover:text-ink -mr-2 grid size-11 flex-none place-items-center rounded-full [&_svg]:size-5"
                >
                  <CloseIcon />
                </button>
              </div>
            )}
            <button
              type="button"
              data-choice=""
              className={row}
              disabled={current === "sending"}
              onClick={() => send({ kind: "call_waiter", payment: null })}
            >
              {/* In the rail the «Waiter» row above carries the bell: the
                  choices sit on its words with no icon of their own. */}
              {!rail && <ConciergeBell size={icon} />}
              <span className="min-w-0 flex-1">{t("order.callWaiter")}</span>
            </button>
            <button
              type="button"
              className={row}
              disabled={current === "sending"}
              aria-expanded={false}
              onClick={() => setPaying(true)}
            >
              {!rail && <ReceiptText size={icon} />}
              <span className="min-w-0 flex-1">{t("order.askBill")}</span>
              <ChevronRight size={icon - 2} className="text-muted" />
            </button>
          </div>
        )
      ) : current === "unsent" ? (
        <div className={`grid gap-2 ${rail ? `${line} pt-2 pb-3` : "py-1"}`}>
          <p role="status" className={`text-alert font-semibold ${rail ? "" : "px-1"}`} data-testid="call-unsent">
            {t("order.notSent")}
          </p>
          <button type="button" onClick={() => void attempt(target)} className={`${pill} justify-self-start`}>
            {t("order.retryRequest")}
          </button>
        </div>
      ) : current === "called" ? (
        <p role="status" className={`text-success flex min-h-12 items-center gap-2 font-semibold ${line}`}>
          <CheckIcon />
          {bill ? t("order.billTold") : t("menu.waiterCalled")}
        </p>
      ) : (
        <p role="alert" className={`text-alert flex min-h-12 items-center font-semibold ${line}`}>
          {t("order.requestFailed")}
        </p>
      )}
    </div>
  );
}
