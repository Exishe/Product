"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { IdbStore } from "./idb-store";
import { Outbox, type OutboxEntry, type OutboxEvent, type SendResult } from "./outbox";

type OutboxApi<A> = {
  entries: readonly OutboxEntry<A>[];
  enqueue: (action: A) => Promise<void>;
  subscribe: (listener: (e: OutboxEvent<A>) => void) => () => void;
};

const OutboxContext = createContext<OutboxApi<unknown> | null>(null);

type Props<A> = {
  name: string; // IndexedDB name; one per device user
  send: (action: A) => Promise<SendResult>;
  sameAction: (a: A, b: A) => boolean;
  groupKey: (a: A) => string;
  children: ReactNode;
};

// Owns one outbox for a staff screen: loads taps saved before a reload, sends
// right away when online, retries with backoff, and replays at once when the
// browser says the network is back.
export function OutboxProvider<A>({ name, send, sameAction, groupKey, children }: Props<A>) {
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  const [outbox] = useState(
    () => new Outbox<A>({ store: new IdbStore<A>(name), send: (a) => sendRef.current(a), sameAction, groupKey }),
  );
  const [entries, setEntries] = useState<readonly OutboxEntry<A>[]>([]);
  const timer = useRef<number | undefined>(undefined);

  const kick = useCallback(
    async function kick(force = false) {
      window.clearTimeout(timer.current);
      if (!navigator.onLine) return; // the "online" event replays
      const outcome = await outbox.replay({ force });
      const at = outbox.nextAttemptAt();
      if (outcome === "retry-later" && at !== null) {
        timer.current = window.setTimeout(() => void kick(), Math.max(0, at - Date.now()) + 50);
      }
    },
    [outbox],
  );

  useEffect(() => {
    const off = outbox.subscribe((e) => {
      if (e.type === "changed") setEntries(e.entries);
    });
    void outbox.load().then(() => kick());
    const onOnline = () => void kick(true);
    window.addEventListener("online", onOnline);
    return () => {
      off();
      window.removeEventListener("online", onOnline);
      window.clearTimeout(timer.current);
    };
  }, [outbox, kick]);

  const api = useMemo<OutboxApi<A>>(
    () => ({
      entries,
      enqueue: async (action) => {
        await outbox.enqueue(action);
        void kick();
      },
      subscribe: (listener) => outbox.subscribe(listener),
    }),
    [entries, outbox, kick],
  );

  return <OutboxContext.Provider value={api as OutboxApi<unknown>}>{children}</OutboxContext.Provider>;
}

export function useOutbox<A>(): OutboxApi<A> {
  const api = useContext(OutboxContext);
  if (!api) throw new Error("useOutbox outside OutboxProvider");
  return api as OutboxApi<A>;
}
