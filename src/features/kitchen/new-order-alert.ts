import type { BoardTicket } from "./board-model";

// The big "New order" banner on the kitchen board. It lists the orders that
// arrived since a cook last tapped it away, so a cook who was out of the room
// still sees every one of them. Cancellations are not new orders.

export type AlertEntry = { id: string; number: number; table: string | null; allergy: boolean };

export type NewOrderAlert = { entries: readonly AlertEntry[] };

// How many orders the banner names before it says "+N".
export const MAX_SHOWN = 3;

type Arrival = Pick<BoardTicket, "id" | "kind" | "status" | "number" | "table" | "allergy">;

// Tickets that belong in the banner: orders waiting in New, not cancellations.
export function alertEntries(arrived: readonly Arrival[]): AlertEntry[] {
  return arrived
    .filter((x) => x.kind === "order" && x.status === "new")
    .map((x) => ({ id: x.id, number: x.number, table: x.table, allergy: x.allergy }));
}

// Adds new arrivals to an open banner (or opens one). Nothing arrived, nothing
// changes; a ticket already in the banner is not added twice.
export function mergeAlert(current: NewOrderAlert | null, arrived: readonly Arrival[]): NewOrderAlert | null {
  const add = alertEntries(arrived);
  if (add.length === 0) return current;
  const have = new Set((current?.entries ?? []).map((x) => x.id));
  const fresh = add.filter((x) => !have.has(x.id));
  if (fresh.length === 0) return current;
  return { entries: [...(current?.entries ?? []), ...fresh] };
}

// Drops orders that left the New column meanwhile (started on another screen,
// cancelled): the banner never points at a ticket that is not there to find.
// Returns null when nothing is left.
export function pruneAlert(
  current: NewOrderAlert | null,
  tickets: readonly Pick<BoardTicket, "id" | "status">[],
): NewOrderAlert | null {
  if (!current) return null;
  const waiting = new Set(tickets.filter((x) => x.status === "new").map((x) => x.id));
  const entries = current.entries.filter((x) => waiting.has(x.id));
  if (entries.length === current.entries.length) return current;
  return entries.length > 0 ? { entries } : null;
}

export type AlertSummary = {
  count: number;
  shown: readonly AlertEntry[];
  more: number; // orders past MAX_SHOWN
  allergy: boolean; // any order in the banner names an allergy
};

export function summarizeAlert(alert: NewOrderAlert, max: number = MAX_SHOWN): AlertSummary {
  const { entries } = alert;
  return {
    count: entries.length,
    shown: entries.slice(0, max),
    more: Math.max(0, entries.length - max),
    allergy: entries.some((x) => x.allergy),
  };
}

// «Սեղան 4 · #12»; an order without a table is just «#12».
export function entryLabel(entry: AlertEntry, tableLabel: (table: string) => string): string {
  return entry.table ? `${tableLabel(entry.table)} · #${entry.number}` : `#${entry.number}`;
}
