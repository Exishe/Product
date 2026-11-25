import { describe, expect, it } from "vitest";
import type { FloorTable, WaiterOrder } from "./floor-model";
import { alertEvents, freshEvents, mergeEvents } from "./live-alert-model";

const order = (
  id: string,
  status: WaiterOrder["status"],
  ready: string[] = [],
  pending = false,
): WaiterOrder => ({
  id,
  number: 1,
  source: "qr",
  status,
  placedAt: 0,
  acceptedAt: null,
  note: null,
  total: 0,
  rejectReason: null,
  duplicate: false,
  lines: [],
  tickets: ready.map((k) => ({
    id: k,
    stationId: "s",
    stationName: null,
    status: "ready",
    readyAt: 0,
    servedAt: null,
  })),
  pending,
});
const table = (id: string, over: Partial<FloorTable> = {}): FloorTable => ({
  id,
  label: id.toUpperCase(),
  areaId: null,
  shape: "square",
  pos: null,
  state: "busy",
  sessionId: "s",
  openedAt: 0,
  openMinutes: 0,
  orders: [],
  waiting: null,
  call: null,
  bill: null,
  total: 0,
  ...over,
});

describe("waiter live alerts", () => {
  const tables = [
    table("a", { bill: { id: "b1", minutes: 0, at: 0, payment: null } }),
    table("b", { orders: [order("o1", "accepted", ["k1", "k2"]), order("o2", "placed")] }),
    table("c", {
      call: { id: "c1", minutes: 0, at: 0 },
      waiting: { sessionId: "w", minutes: 0, orders: [order("o3", "placed")] },
    }),
    table("d", { orders: [order("o4", "placed", [], true)] }),
  ];

  it("finds calls, bills, guest orders to accept and ready plates, but not taps still in the outbox", () => {
    expect(
      alertEvents(tables)
        .map((e) => e.key)
        .sort(),
    ).toEqual(["bill:b1", "call:c1", "new:o2", "new:o3", "ready:k1", "ready:k2"].sort());
  });

  it("announces each event once, one line per table and kind, most urgent first", () => {
    const all = alertEvents(tables);
    expect(freshEvents(all, new Set()).map((e) => `${e.label}:${e.kind}`)).toEqual([
      "C:call",
      "B:ready",
      "B:new",
      "C:new",
      "A:bill",
    ]);
    expect(freshEvents(all, new Set(all.map((e) => e.key)))).toEqual([]);
  });

  it("adds a second event to the open card instead of replacing what is on it", () => {
    const first = freshEvents(alertEvents([tables[0]!]), new Set());
    const second = freshEvents(alertEvents([tables[2]!]), new Set());
    expect(mergeEvents(second, first).map((e) => `${e.label}:${e.kind}`)).toEqual([
      "C:call",
      "C:new",
      "A:bill",
    ]);
  });

  it("keeps one line per table and kind when the same kind comes again", () => {
    const shown = [{ key: "ready:k1", kind: "ready" as const, tableId: "b", label: "B" }];
    const fresh = [{ key: "ready:k9", kind: "ready" as const, tableId: "b", label: "B" }];
    expect(mergeEvents(fresh, shown).map((e) => e.key)).toEqual(["ready:k9"]);
    expect(mergeEvents(fresh, []).map((e) => e.key)).toEqual(["ready:k9"]);
  });
});
