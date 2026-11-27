import type { FloorTable } from "./floor-model";

// What the waiter is told about the moment it happens (the live order alerts of
// ordering dashboards): a guest calling, a plate ready, a guest's order to
// accept, a bill asked for. Each has a stable key, so an event is announced
// once, however often the floor is refetched.
export type AlertKind = "call" | "ready" | "new" | "bill";
export type AlertEvent = {
  key: string;
  kind: AlertKind;
  tableId: string;
  label: string;
  payment?: "card" | "cash" | null;
};

// Most urgent first: a waving guest, then food going cold, then the rest.
const RANK: Record<AlertKind, number> = { call: 0, ready: 1, new: 2, bill: 3 };

export function alertEvents(tables: readonly FloorTable[]): AlertEvent[] {
  const out: AlertEvent[] = [];
  for (const t of tables) {
    const base = { tableId: t.id, label: t.label };
    if (t.call) out.push({ ...base, key: `call:${t.call.id}`, kind: "call" });
    if (t.bill) out.push({ ...base, key: `bill:${t.bill.id}`, kind: "bill", payment: t.bill.payment });
    for (const o of [...t.orders, ...(t.waiting?.orders ?? [])]) {
      if (o.pending) continue;
      if (o.status === "placed") out.push({ ...base, key: `new:${o.id}`, kind: "new" });
      // A guest's order the café accepted by itself never was «placed» here:
      // it still tells the waiter, once (same key, so an order they accepted
      // themselves does not ring again). Their own orders do not ring.
      if (
        o.status === "accepted" &&
        o.source !== "waiter" &&
        o.tickets.some((k) => k.status === "new" || k.status === "cooking")
      )
        out.push({ ...base, key: `new:${o.id}`, kind: "new" });
      if (o.status === "accepted")
        for (const k of o.tickets)
          if (k.status === "ready") out.push({ ...base, key: `ready:${k.id}`, kind: "ready" });
    }
  }
  return out;
}

// The events not seen before, one per table and kind (two plates ready at
// table 4 are one line), most urgent first.
export function freshEvents(events: readonly AlertEvent[], seen: ReadonlySet<string>): AlertEvent[] {
  const byTableKind = new Map<string, AlertEvent>();
  for (const e of events) {
    if (seen.has(e.key)) continue;
    const k = `${e.tableId}:${e.kind}`;
    if (!byTableKind.has(k)) byTableKind.set(k, e);
  }
  return [...byTableKind.values()].sort((a, b) => RANK[a.kind] - RANK[b.kind]);
}

// New events while the card is up join the lines already on it instead of
// replacing them: still one line per table and kind (the newer one), most urgent first.
export function mergeEvents(fresh: readonly AlertEvent[], shown: readonly AlertEvent[]): AlertEvent[] {
  return freshEvents([...fresh, ...shown], new Set());
}
