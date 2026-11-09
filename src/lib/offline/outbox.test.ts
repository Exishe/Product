import { describe, expect, it } from "vitest";
import { MemoryStore, Outbox, type OutboxEvent, type SendResult } from "./outbox";

type Move = { ticket: string; from: string; to: string };

function setup(script: (m: Move, call: number) => SendResult | Promise<SendResult> = () => ({ kind: "ok" })) {
  let clock = 1_000;
  let id = 0;
  const store = new MemoryStore<Move>();
  const sent: Move[] = [];
  const events: OutboxEvent<Move>[] = [];
  const make = () => {
    const box = new Outbox<Move>({
      store,
      send: async (m) => {
        sent.push(m);
        return script(m, sent.length);
      },
      sameAction: (a, b) => a.ticket === b.ticket && a.from === b.from && a.to === b.to,
      groupKey: (m) => m.ticket,
      now: () => clock,
      newId: () => `e${++id}`,
    });
    box.subscribe((e) => events.push(e));
    return box;
  };
  return { make, store, sent, events, tick: (ms: number) => (clock += ms) };
}

const start = (ticket: string): Move => ({ ticket, from: "new", to: "cooking" });
const ready = (ticket: string): Move => ({ ticket, from: "cooking", to: "ready" });

describe("Outbox", () => {
  it("keeps taps in order, in memory and in storage", async () => {
    const { make, store } = setup();
    const box = make();
    await box.enqueue(start("a"));
    await box.enqueue(ready("a"));
    expect(box.entries().map((e) => e.action)).toEqual([start("a"), ready("a")]);
    expect((await store.list()).map((e) => e.action)).toEqual([start("a"), ready("a")]);
  });

  it("replays each tap exactly once, in order, then forgets it", async () => {
    const { make, store, sent } = setup();
    const box = make();
    await box.enqueue(start("a"));
    await box.enqueue(start("b"));
    expect(await box.replay()).toBe("done");
    expect(await box.replay()).toBe("idle");
    expect(sent).toEqual([start("a"), start("b")]);
    expect(box.entries()).toEqual([]);
    expect(await store.list()).toEqual([]);
  });

  it("counts a double tap once", async () => {
    const { make, sent } = setup();
    const box = make();
    const first = await box.enqueue(start("a"));
    const again = await box.enqueue(start("a"));
    expect(again.id).toBe(first.id);
    await box.replay();
    expect(sent).toEqual([start("a")]);
  });

  it("keeps a tap when the network fails and retries it later with backoff, never out of order", async () => {
    let online = false;
    const { make, sent, tick } = setup(() => (online ? { kind: "ok" } : { kind: "retry", reason: "TypeError: Failed to fetch" }));
    const box = make();
    await box.enqueue(start("a"));
    await box.enqueue(start("b"));
    expect(await box.replay()).toBe("retry-later");
    expect(sent).toEqual([start("a")]);
    expect(box.entries().at(0)).toMatchObject({ attempts: 1, lastError: "TypeError: Failed to fetch" });
    expect(box.nextAttemptAt()).toBe(2_000);

    expect(await box.replay()).toBe("retry-later"); // too early: nothing sent
    expect(sent).toHaveLength(1);

    tick(1_000);
    expect(await box.replay()).toBe("retry-later");
    expect(box.entries().at(0)?.attempts).toBe(2);
    expect(box.nextAttemptAt()).toBe(4_000); // 1 s, 2 s, 4 s … up to 30 s

    online = true;
    expect(await box.replay({ force: true })).toBe("done"); // back online: don't wait for the backoff
    expect(sent.slice(-2)).toEqual([start("a"), start("b")]);
    expect(box.entries()).toEqual([]);
  });

  it("caps the backoff at 30 seconds", async () => {
    const { make, tick } = setup(() => ({ kind: "retry", reason: "offline" }));
    const box = make();
    await box.enqueue(start("a"));
    for (let i = 0; i < 10; i++) {
      await box.replay({ force: true });
      tick(1);
    }
    expect(box.nextAttemptAt()! - (1_000 + 9)).toBe(30_000);
  });

  it("on a conflict drops that tap and the later taps on the same ticket, and goes on with the others", async () => {
    const { make, sent, events } = setup((m) => (m.ticket === "a" ? { kind: "stale", current: "served" } : { kind: "ok" }));
    const box = make();
    await box.enqueue(start("a"));
    await box.enqueue(start("b"));
    await box.enqueue(ready("a"));
    expect(await box.replay()).toBe("done");
    expect(sent).toEqual([start("a"), start("b")]);
    const stale = events.find((e) => e.type === "stale");
    expect(stale).toMatchObject({ type: "stale", current: "served", entry: { action: start("a") } });
    expect(stale && stale.type === "stale" && stale.dropped.map((e) => e.action)).toEqual([ready("a")]);
    expect(box.entries()).toEqual([]);
  });

  it("drops a tap the database will never accept, and says so", async () => {
    const { make, events } = setup(() => ({ kind: "failed", reason: "transition_not_allowed" }));
    const box = make();
    await box.enqueue(start("a"));
    expect(await box.replay()).toBe("done");
    expect(events.find((e) => e.type === "failed")).toMatchObject({ reason: "transition_not_allowed" });
    expect(box.entries()).toEqual([]);
  });

  it("stops and keeps everything when the device has been disconnected", async () => {
    const { make, sent, events } = setup(() => ({ kind: "forbidden" }));
    const box = make();
    await box.enqueue(start("a"));
    await box.enqueue(start("b"));
    expect(await box.replay()).toBe("stopped");
    expect(await box.replay({ force: true })).toBe("stopped");
    expect(sent).toEqual([start("a")]);
    expect(box.entries()).toHaveLength(2);
    expect(events.some((e) => e.type === "forbidden")).toBe(true);
  });

  it("treats a send that throws like a network failure", async () => {
    const { make } = setup(() => {
      throw new Error("boom");
    });
    const box = make();
    await box.enqueue(start("a"));
    expect(await box.replay()).toBe("retry-later");
    expect(box.entries().at(0)?.lastError).toBe("boom");
  });

  it("finds taps saved before a reload and sends them", async () => {
    const { make, sent } = setup();
    const before = make();
    await before.enqueue(start("a"));
    await before.enqueue(ready("a"));
    const after = make();
    await after.load();
    expect(after.entries().map((e) => e.action)).toEqual([start("a"), ready("a")]);
    await after.enqueue(start("b"));
    await after.replay();
    expect(sent).toEqual([start("a"), ready("a"), start("b")]);
  });

  it("runs one replay at a time, and picks up taps made while it runs", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { make, sent } = setup(async (_m, call) => {
      if (call === 1) await gate;
      return { kind: "ok" };
    });
    const box = make();
    await box.enqueue(start("a"));
    const first = box.replay();
    const second = box.replay();
    await box.enqueue(start("b"));
    release();
    expect(await first).toBe("done");
    expect(await second).toBe("done");
    expect(sent).toEqual([start("a"), start("b")]);
  });

  it("tells listeners whenever the waiting list changes", async () => {
    const { make, events } = setup();
    const box = make();
    await box.enqueue(start("a"));
    await box.replay();
    const sizes = events.filter((e) => e.type === "changed").map((e) => (e.type === "changed" ? e.entries.length : -1));
    expect(sizes).toEqual([1, 0]);
    expect(events.find((e) => e.type === "sent")).toMatchObject({ entry: { action: start("a") } });
  });
});
