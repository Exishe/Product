// The staff outbox (realtime.md, "The outbox"): taps made while the network is
// down are kept on the device and replayed in order, one at a time, once it's
// back. Every queued action must be safe to repeat; the database makes status
// moves compare-and-set, so the same move twice succeeds silently.
//
// The store is pluggable: IndexedDB in the browser (idb-store.ts), memory in
// tests and when IndexedDB is unavailable.

export type SendResult<S = string> =
  | { kind: "ok" }
  | { kind: "stale"; current: S | null } // someone else changed it first: drop, refresh, tell the user
  | { kind: "forbidden" } // device disconnected: stop replaying
  | { kind: "retry"; reason: string } // network or server trouble: keep, try again later
  | { kind: "failed"; reason: string }; // the database will never accept it: drop, tell the user

export type OutboxEntry<A> = {
  id: string;
  seq: number;
  action: A;
  createdAt: number;
  attempts: number;
  nextAttemptAt: number;
  lastError?: string;
};

export interface OutboxStore<A> {
  list(): Promise<OutboxEntry<A>[]>;
  put(entry: OutboxEntry<A>): Promise<void>;
  delete(id: string): Promise<void>;
}

export type OutboxEvent<A> =
  | { type: "changed"; entries: readonly OutboxEntry<A>[] }
  | { type: "sent"; entry: OutboxEntry<A> }
  | { type: "stale"; entry: OutboxEntry<A>; current: unknown; dropped: OutboxEntry<A>[] }
  | { type: "failed"; entry: OutboxEntry<A>; reason: string }
  | { type: "forbidden"; entry: OutboxEntry<A> };

export type ReplayOutcome = "idle" | "done" | "retry-later" | "stopped";

export type OutboxOptions<A> = {
  store: OutboxStore<A>;
  send: (action: A) => Promise<SendResult>;
  sameAction: (a: A, b: A) => boolean; // a second identical tap is not queued twice
  groupKey: (a: A) => string; // after a conflict, later taps on the same thing are dropped too
  now?: () => number;
  newId?: () => string;
  backoff?: (attempts: number) => number;
};

// 1 s, 2 s, 4 s … up to 30 s (realtime.md).
export const defaultBackoff = (attempts: number): number => Math.min(30_000, 1_000 * 2 ** Math.max(0, attempts - 1));

export class MemoryStore<A> implements OutboxStore<A> {
  private rows = new Map<string, OutboxEntry<A>>();
  async list() {
    return [...this.rows.values()].map((e) => ({ ...e })).sort((a, b) => a.seq - b.seq);
  }
  async put(entry: OutboxEntry<A>) {
    this.rows.set(entry.id, { ...entry });
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
}

export class Outbox<A> {
  private queue: OutboxEntry<A>[] = [];
  private seq = 0;
  private running: Promise<ReplayOutcome> | null = null;
  private stopped = false;
  private listeners = new Set<(e: OutboxEvent<A>) => void>();
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly backoff: (attempts: number) => number;

  constructor(private readonly opts: OutboxOptions<A>) {
    this.now = opts.now ?? Date.now;
    this.newId = opts.newId ?? (() => crypto.randomUUID());
    this.backoff = opts.backoff ?? defaultBackoff;
  }

  // Taps saved before a reload come first.
  async load(): Promise<void> {
    const saved = await this.safe(() => this.opts.store.list(), []);
    const known = new Set(this.queue.map((e) => e.id));
    this.queue = [...saved.filter((e) => !known.has(e.id)), ...this.queue].sort((a, b) => a.seq - b.seq);
    this.seq = Math.max(this.seq, ...this.queue.map((e) => e.seq));
    this.emit({ type: "changed", entries: this.entries() });
  }

  entries(): readonly OutboxEntry<A>[] {
    return this.queue.map((e) => ({ ...e }));
  }

  nextAttemptAt(): number | null {
    return this.queue[0]?.nextAttemptAt ?? null;
  }

  isStopped(): boolean {
    return this.stopped;
  }

  subscribe(listener: (e: OutboxEvent<A>) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async enqueue(action: A): Promise<OutboxEntry<A>> {
    const same = this.queue.find((e) => this.opts.sameAction(e.action, action));
    if (same) return { ...same };
    const now = this.now();
    const entry: OutboxEntry<A> = { id: this.newId(), seq: ++this.seq, action, createdAt: now, attempts: 0, nextAttemptAt: now };
    this.queue.push(entry);
    this.emit({ type: "changed", entries: this.entries() });
    await this.safe(() => this.opts.store.put(entry), undefined);
    return { ...entry };
  }

  // Sends waiting taps in order. One replay runs at a time; a call made while
  // one runs joins it. `force` ignores the backoff (the network just came back).
  replay(options: { force?: boolean } = {}): Promise<ReplayOutcome> {
    if (this.stopped) return Promise.resolve("stopped");
    if (this.running) return this.running;
    if (this.queue.length === 0) return Promise.resolve("idle");
    this.running = this.run(options.force ?? false).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async run(force: boolean): Promise<ReplayOutcome> {
    for (let entry = this.queue[0]; entry; entry = this.queue[0]) {
      if (!force && entry.nextAttemptAt > this.now()) return "retry-later";
      let result: SendResult;
      try {
        result = await this.opts.send(entry.action);
      } catch (e) {
        result = { kind: "retry", reason: e instanceof Error ? e.message : String(e) };
      }
      switch (result.kind) {
        case "ok":
          await this.remove([entry]);
          this.emit({ type: "sent", entry });
          break;
        case "stale": {
          const key = this.opts.groupKey(entry.action);
          const dropped = this.queue.slice(1).filter((e) => this.opts.groupKey(e.action) === key);
          await this.remove([entry, ...dropped]);
          this.emit({ type: "stale", entry, current: result.current, dropped });
          break;
        }
        case "failed":
          await this.remove([entry]);
          this.emit({ type: "failed", entry, reason: result.reason });
          break;
        case "forbidden":
          this.stopped = true;
          this.emit({ type: "forbidden", entry });
          return "stopped";
        case "retry": {
          entry.attempts += 1;
          entry.lastError = result.reason;
          entry.nextAttemptAt = this.now() + this.backoff(entry.attempts);
          await this.safe(() => this.opts.store.put(entry), undefined);
          this.emit({ type: "changed", entries: this.entries() });
          return "retry-later";
        }
      }
      force = false; // the network answered: later entries follow their own schedule
    }
    return "done";
  }

  private async remove(entries: OutboxEntry<A>[]): Promise<void> {
    const ids = new Set(entries.map((e) => e.id));
    this.queue = this.queue.filter((e) => !ids.has(e.id));
    this.emit({ type: "changed", entries: this.entries() });
    for (const id of ids) await this.safe(() => this.opts.store.delete(id), undefined);
  }

  private emit(event: OutboxEvent<A>): void {
    for (const l of this.listeners) l(event);
  }

  // Storage trouble (private mode, quota) must never lose a tap that is still
  // in memory, nor stop the board: the queue keeps working without persistence.
  private async safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  }
}
