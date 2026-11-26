import { useEffect, useSyncExternalStore } from "react";
import { requestKey } from "@/features/ordering/pending-request-key";

// "Call the waiter" and "Ask for the bill" on the menu, before or without an
// order: the Waiter item of the bottom bar opens the two choices just above
// the bar (call-waiter-button.tsx, fetched when they first show). One tap
// opens them, a second picks: a stray tap never sends a waiter over. Module
// state, so the item and the choices (rendered apart) show the same thing.
// "confirm" is the open choices.
// "unsent": no answer (offline, timeout, server error). The request is kept in
// storage and retried (see pending-request.ts), never shown as sent.
export type CallState = "idle" | "confirm" | "sending" | "unsent" | "called" | "failed";

let state: CallState = "idle";
export const callState = () => state;
// What the guest asked for: the waiter, or the bill (by card or in cash).
export type Ask = { kind: "call_waiter" | "bring_bill"; payment: "card" | "cash" | null };
let asked: Ask = { kind: "call_waiter", payment: null };
export const askedFor = () => asked;
export const setAsked = (next: Ask) => {
  asked = next;
};
let timer: ReturnType<typeof setTimeout> | undefined;
// "Called" lasts 90 s on the bar item; the note above the bar only 4 s.
let noteHidden = false;
export const noteIsHidden = () => noteHidden;
let noteTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

export function set(next: CallState, revertAfterMs?: number) {
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
// The × (or Escape) under the rail's «Waiter» row: whatever shows there goes.
// A request still unsent is dropped too, so a reload does not send what the
// guest closed.
export function dismiss(tableId: string) {
  if (state === "unsent")
    try {
      window.localStorage.removeItem(requestKey(tableId, asked.kind));
    } catch {
      // storage blocked: nothing was kept
    }
  set("idle");
}
export const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useCallWaiter() {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => "idle" as CallState,
  );
  const hidden = useSyncExternalStore(subscribe, noteIsHidden, () => false);
  // A guest who leaves the page mid-question shouldn't leave it hanging.
  useEffect(() => () => void (state === "confirm" && set("idle")), []);
  return {
    state: current,
    /** Something shows under the «Waiter» row: the choices or what came of them. */
    shown: current !== "idle" && !(current === "called" && hidden),
    ask: () =>
      state === "confirm"
        ? set("idle")
        : state === "idle" || state === "failed" || state === "called"
          ? set("confirm", 20_000)
          : undefined,
    cancel: () => set("idle"),
  };
}

