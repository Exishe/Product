import { describe, expect, it, vi } from "vitest";
import { createTracker, DEDUPE_MS, FLUSH_MS, MAX_BATCH, type GuestEvent } from "./tracker-core";

const L = "loc-1";
function setup() {
  let t = 1_000;
  const sent: { location: string; table: string | null; events: GuestEvent[] }[] = [];
  const timers: { fn: () => void; ms: number; id: number }[] = [];
  let id = 0;
  const tracker = createTracker({
    send: (location, table, events) => void sent.push({ location, table, events }),
    now: () => t,
    setTimer: (fn, ms) => {
      timers.push({ fn, ms, id: ++id });
      return id;
    },
    clearTimer: (i) => {
      const k = timers.findIndex((x) => x.id === i);
      if (k >= 0) timers.splice(k, 1);
    },
  });
  return { tracker, sent, timers, advance: (ms: number) => (t += ms) };
}

describe("tracker core", () => {
  it("batches events and flushes on the timer, once", () => {
    const { tracker, sent, timers } = setup();
    tracker.track(L, null, { kind: "item_add", item_id: "a" });
    tracker.track(L, null, { kind: "item_add", item_id: "b", meta: { qty: 2 } });
    expect(sent).toHaveLength(0);
    expect(timers).toHaveLength(1);
    expect(timers[0]!.ms).toBe(FLUSH_MS);
    timers[0]!.fn();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.events).toEqual([
      { kind: "item_add", item_id: "a" },
      { kind: "item_add", item_id: "b", meta: { qty: 2 } },
    ]);
    expect(tracker.pending()).toBe(0);
  });

  it("dedupes a repeated view of the same dish within 30 s, not after", () => {
    const { tracker, sent, advance } = setup();
    tracker.track(L, null, { kind: "item_view", item_id: "a" });
    advance(DEDUPE_MS - 1);
    tracker.track(L, null, { kind: "item_view", item_id: "a" });
    tracker.track(L, null, { kind: "item_view", item_id: "b" });
    expect(tracker.pending()).toBe(2);
    advance(2);
    tracker.track(L, null, { kind: "item_view", item_id: "a" });
    expect(tracker.pending()).toBe(3);
    tracker.flush();
    expect(sent[0]!.events.map((e) => e.item_id)).toEqual(["a", "b", "a"]);
  });

  it("never dedupes adds or accepted suggestions", () => {
    const { tracker } = setup();
    tracker.track(L, null, { kind: "item_add", item_id: "a" });
    tracker.track(L, null, { kind: "item_add", item_id: "a" });
    tracker.track(L, null, { kind: "suggestion_accepted", item_id: "a", meta: { from: "x" } });
    tracker.track(L, null, { kind: "suggestion_accepted", item_id: "a", meta: { from: "x" } });
    expect(tracker.pending()).toBe(4);
  });

  it("dedupes a shown suggestion per pair, so a second source dish still counts", () => {
    const { tracker } = setup();
    tracker.track(L, null, { kind: "suggestion_shown", item_id: "c", meta: { from: "x" } });
    tracker.track(L, null, { kind: "suggestion_shown", item_id: "c", meta: { from: "x" } });
    tracker.track(L, null, { kind: "suggestion_shown", item_id: "c", meta: { from: "y" } });
    expect(tracker.pending()).toBe(2);
  });

  it("flushes at once when a batch is full and splits big flushes into 20", () => {
    const { tracker, sent } = setup();
    for (let i = 0; i < MAX_BATCH; i++) tracker.track(L, null, { kind: "item_add", item_id: `i${i}` });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.events).toHaveLength(MAX_BATCH);
  });

  it("keeps cafés and tables apart", () => {
    const { tracker, sent } = setup();
    tracker.track("l1", "t1", { kind: "item_add", item_id: "a" });
    tracker.track("l2", null, { kind: "item_add", item_id: "a" });
    tracker.flush();
    expect(sent.map((s) => [s.location, s.table])).toEqual([
      ["l1", "t1"],
      ["l2", null],
    ]);
  });

  it("flushing an empty queue sends nothing, and flush cancels the timer", () => {
    const { tracker, sent, timers } = setup();
    tracker.flush();
    expect(sent).toHaveLength(0);
    tracker.track(L, null, { kind: "item_add", item_id: "a" });
    tracker.flush();
    expect(timers).toHaveLength(0);
    expect(sent).toHaveLength(1);
  });

  it("drops silently when sending throws or rejects", async () => {
    const reject = createTracker({ send: () => Promise.reject(new Error("offline")) });
    const thrower = createTracker({
      send: () => {
        throw new Error("boom");
      },
    });
    for (const t of [reject, thrower]) {
      t.track(L, null, { kind: "item_add", item_id: "a" });
      expect(() => t.flush()).not.toThrow();
      expect(t.pending()).toBe(0);
    }
    await Promise.resolve();
  });

  it("caps what a stuck visit can queue", () => {
    const send = vi.fn(() => {
      throw new Error("down");
    });
    const t = createTracker({ send, setTimer: () => 1, clearTimer: () => {} });
    for (let i = 0; i < 500; i++) t.track(L, null, { kind: "item_add", item_id: `i${i}` });
    expect(t.pending()).toBeLessThanOrEqual(100);
  });
});
