import { useEffect, useSyncExternalStore } from "react";

// "Call the waiter" on the menu, before or without an order: the Waiter item
// of the bottom bar, with its question just above the bar (call-waiter-button.tsx,
// fetched when the question first shows). One tap asks, a
// second confirms: a stray tap never sends a waiter over. Module state, so
// the item and the question (rendered apart) show the same thing.
// "unsent": no answer (offline, timeout, server error). The request is kept in
// storage and retried (see pending-request.ts), never shown as sent.
export type CallState = "idle" | "confirm" | "sending" | "unsent" | "called" | "failed";

let state: CallState = "idle";
export const callState = () => state;
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

