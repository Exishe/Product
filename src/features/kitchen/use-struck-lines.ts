"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { reconcileStrikes, type BoardTicket, type LocalStrikes } from "./board-model";
import { sendStrike, strikeStoreFor, type StrikeCallbacks } from "./strike-store";

// This screen's own taps on struck lines (item-level bump, ADR-087), as a hook
// for the board; the store and the sending are in strike-store.ts.

const NONE: LocalStrikes = new Map();

export type StruckLinesOptions = {
  storageKey: string;
  /** The board's rows carry struck_at (the migration has run); false: strikes stay on this screen. */
  serverStrikes: boolean;
  /** The server says every wanted line of this ticket is struck: move it on. */
  onComplete: (ticketId: string) => void;
  /** A tap the server refused for good (not "stale", not "offline"). */
  onFailed: () => void;
};

export function useStruckLines({ storageKey, serverStrikes, onComplete, onFailed }: StruckLinesOptions) {
  const local = useSyncExternalStore(
    useCallback((cb: () => void) => strikeStoreFor(storageKey).subscribe(cb), [storageKey]),
    () => strikeStoreFor(storageKey).get(),
    () => NONE,
  );

  // The latest callbacks, for the store to call; only the board on screen is called.
  const latest = useRef<StrikeCallbacks>({ onComplete, onFailed });
  useEffect(() => {
    latest.current = { onComplete, onFailed };
  });
  useEffect(() => {
    const store = strikeStoreFor(storageKey);
    store.callbacks = {
      onComplete: (id) => latest.current.onComplete(id),
      onFailed: () => latest.current.onFailed(),
    };
    return () => {
      store.callbacks = null;
    };
  }, [storageKey]);

  useEffect(() => {
    strikeStoreFor(storageKey).rowsShareStrikes = serverStrikes;
  }, [storageKey, serverStrikes]);

  // Sends the taps the server has not confirmed (the network is back, the live
  // channel rejoined, the safety poll ticked, the page was reloaded).
  const flush = useCallback(() => {
    const store = strikeStoreFor(storageKey);
    for (const [key, s] of store.get()) if (s.ackedAt === null) void sendStrike(store, key, s.want);
  }, [storageKey]);
  useEffect(() => flush(), [flush]);

  const set = useCallback(
    (key: string, want: boolean) => {
      const store = strikeStoreFor(storageKey);
      store.update((taps) => new Map(taps).set(key, { want, ackedAt: null }));
      void sendStrike(store, key, want);
    },
    [storageKey],
  );

  // A refresh finished: the server's rows are the truth again for what it confirmed.
  const reconcile = useCallback(
    (serverTickets: readonly BoardTicket[], startedAt: number) => {
      strikeStoreFor(storageKey).update((taps) => reconcileStrikes(taps, serverTickets, startedAt));
    },
    [storageKey],
  );

  return { local, set, flush, reconcile };
}
