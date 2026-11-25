import { getBrowserClient } from "@/lib/supabase/browser";
import { setLineStruck, type StrikeResult } from "./actions";
import { lineOfLineKey, ticketOfLineKey, type LocalStrike, type LocalStrikes } from "./board-model";

// This screen's own taps on struck lines (item-level bump, ADR-087): the part
// the server has not confirmed yet. A tap shows at once, is sent to the server
// right away and sent again until the server has it (a dropped network, a
// reload). The board draws the server's rows with these on top (struckLines).
//
// The taps live in a small store per station, outside React, so that they
// survive a reload (sessionStorage, or memory when storage is blocked) and so
// that the first render, which must match the server's, starts without them.
// A database without the migration is noticed from the rows (no struck_at) and,
// failing that, from the first send; this screen then keeps its strikes to
// itself, as it did before.

const memory = new Map<string, string>();

// The saved value is {"<ticket>/<line>": true | false}. The older format, a
// list of struck keys, is read as "struck".
function readStored(key: string): LocalStrikes {
  let raw: string | null | undefined;
  try {
    raw = window.sessionStorage.getItem(key) ?? memory.get(key);
  } catch {
    raw = memory.get(key);
  }
  const out = new Map<string, LocalStrike>();
  if (!raw) return out;
  try {
    const saved = JSON.parse(raw) as unknown;
    if (Array.isArray(saved)) {
      for (const k of saved) if (typeof k === "string") out.set(k, { want: true, ackedAt: null });
    } else if (saved && typeof saved === "object") {
      for (const [k, v] of Object.entries(saved)) if (typeof v === "boolean") out.set(k, { want: v, ackedAt: null });
    }
  } catch {
    // unreadable: start clean
  }
  return out;
}

// Only the taps the server has not confirmed are worth keeping.
function writeStored(key: string, taps: LocalStrikes) {
  const open = Object.fromEntries([...taps].filter(([, s]) => s.ackedAt === null).map(([k, s]) => [k, s.want]));
  const raw = Object.keys(open).length > 0 ? JSON.stringify(open) : null;
  if (raw) memory.set(key, raw);
  else memory.delete(key);
  try {
    if (raw) window.sessionStorage.setItem(key, raw);
    else window.sessionStorage.removeItem(key);
  } catch {
    // Storage is blocked: the taps last until the page reloads.
  }
}

export type StrikeCallbacks = { onComplete: (ticketId: string) => void; onFailed: () => void };

export class StrikeStore {
  private taps: LocalStrikes;
  private readonly listeners = new Set<() => void>();
  readonly flight = new Set<string>();
  supported = true; // false once the server said it has no api.set_line_struck
  rowsShareStrikes = true; // false while the board's rows carry no struck_at (no migration): nothing to send to
  callbacks: StrikeCallbacks | null = null; // the board that is showing this station now

  constructor(private readonly key: string) {
    this.taps = readStored(key);
  }

  get = (): LocalStrikes => this.taps;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  update(change: (taps: LocalStrikes) => LocalStrikes) {
    const next = change(this.taps);
    if (next === this.taps) return;
    this.taps = next;
    writeStored(this.key, next);
    for (const l of this.listeners) l();
  }
}

const stores = new Map<string, StrikeStore>();
export function strikeStoreFor(key: string): StrikeStore {
  let s = stores.get(key);
  if (!s) {
    s = new StrikeStore(key);
    stores.set(key, s);
  }
  return s;
}

// Sends one tap and keeps going until the server has the latest one for that line.
export async function sendStrike(store: StrikeStore, key: string, wanted: boolean): Promise<void> {
  if (!store.supported || !store.rowsShareStrikes || store.flight.has(key) || !navigator.onLine) return;
  store.flight.add(key);
  let want = wanted;
  try {
    for (;;) {
      let res: StrikeResult;
      try {
        res = await setLineStruck(getBrowserClient(), ticketOfLineKey(key), lineOfLineKey(key), want);
      } catch {
        res = { kind: "retry" };
      }
      const answeredAt = performance.now();
      const current = store.get().get(key);
      if (res.kind === "unsupported") {
        store.supported = false;
        return;
      }
      if (res.kind === "retry") return; // stays; flush() sends it again
      if (res.kind === "gone" || res.kind === "failed") {
        // The ticket left Cooking, or the server refused: its word wins from now on.
        store.update((taps) => {
          if (!taps.has(key)) return taps;
          const next = new Map(taps);
          next.delete(key);
          return next;
        });
        if (res.kind === "failed") store.callbacks?.onFailed();
        return;
      }
      if (!current) return; // the ticket moved on meanwhile and the tap was forgotten
      if (current.want !== want) {
        want = current.want; // tapped again while this one was on its way
        continue;
      }
      store.update((taps) => new Map(taps).set(key, { want, ackedAt: answeredAt }));
      if (want && res.complete) store.callbacks?.onComplete(ticketOfLineKey(key));
      return;
    }
  } finally {
    store.flight.delete(key);
  }
}

