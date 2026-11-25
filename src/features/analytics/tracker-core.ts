// Guest event batching (ADR-072). Pure logic, no browser globals: events wait
// in memory, go out in batches of at most 20, every few seconds and when the
// page is hidden, and a failed send is dropped. Analytics never blocks or
// breaks ordering, so nothing here throws and nothing is retried.
export type EventKind = "item_view" | "item_add" | "suggestion_shown" | "suggestion_accepted";
export type EventMeta = { from?: string; qty?: number; via?: string };
export type GuestEvent = { kind: EventKind; item_id: string; meta?: EventMeta };
export type QueuedEvent = GuestEvent & { location: string; table: string | null };

export const FLUSH_MS = 5_000;
export const DEDUPE_MS = 30_000;
export const MAX_BATCH = 20;
/** A visit cannot queue more than this; extra events are dropped (a stuck network must not grow memory). */
export const MAX_QUEUE = 100;

export type TrackerDeps = {
  /** Sends one batch for one café. Rejects or throws on failure; the batch is then dropped. */
  send: (location: string, table: string | null, events: GuestEvent[]) => void | Promise<unknown>;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
};

export function createTracker(deps: TrackerDeps) {
  const now = deps.now ?? Date.now;
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  let queue: QueuedEvent[] = [];
  let timer: unknown = null;
  // A repeat view or shown-suggestion of the same dish within 30 s is one event.
  const seen = new Map<string, number>();

  const dedupeKey = (e: QueuedEvent) => `${e.location}|${e.kind}|${e.item_id}|${e.meta?.from ?? ""}`;

  function flush(): void {
    if (timer !== null) {
      clearTimer(timer);
      timer = null;
    }
    const batch = queue;
    queue = [];
    const byTable = new Map<string, QueuedEvent[]>();
    for (const e of batch) {
      const k = `${e.location}|${e.table ?? ""}`;
      byTable.set(k, [...(byTable.get(k) ?? []), e]);
    }
    for (const events of byTable.values()) {
      for (let i = 0; i < events.length; i += MAX_BATCH) {
        const chunk = events.slice(i, i + MAX_BATCH);
        const first = chunk[0];
        if (!first) continue;
        try {
          const out = deps.send(
            first.location,
            first.table,
            chunk.map(({ kind, item_id, meta }) => (meta ? { kind, item_id, meta } : { kind, item_id })),
          );
          if (out && typeof (out as Promise<unknown>).catch === "function")
            (out as Promise<unknown>).catch(() => {});
        } catch {
          // dropped on purpose
        }
      }
    }
  }

  function track(location: string, table: string | null, event: GuestEvent): void {
    try {
      const e: QueuedEvent = { ...event, location, table };
      if (e.kind === "item_view" || e.kind === "suggestion_shown") {
        const t = now();
        const key = dedupeKey(e);
        const last = seen.get(key);
        if (last !== undefined && t - last < DEDUPE_MS) return;
        seen.set(key, t);
        if (seen.size > 200) for (const [k, at] of seen) if (t - at >= DEDUPE_MS) seen.delete(k);
      }
      if (queue.length >= MAX_QUEUE) return;
      queue.push(e);
      if (queue.length >= MAX_BATCH) flush();
      else if (timer === null) timer = setTimer(flush, FLUSH_MS);
    } catch {
      // never break the page
    }
  }

  return { track, flush, pending: () => queue.length };
}
