import type { Locale } from "@/i18n/routing";
import type { Database, Json } from "@/lib/supabase/types";

// The kitchen board's view of tickets, built from the rows RLS lets a station
// read. Pure functions only: the board, the server page and the tests share them.

type Enums = Database["public"]["Enums"];
export type TicketStatus = Enums["ticket_status"];
export type OrderSource = Enums["order_source"];

// Shape of one row of the board query (board-data.ts).
export type TicketRow = {
  id: string;
  kind: Enums["ticket_kind"];
  status: TicketStatus;
  number: number;
  created_at: string;
  ready_at: string | null;
  first_seen_at: string | null;
  acknowledged_at: string | null;
  orders: { source: OrderSource; guest_note: string | null; paid_at: string | null; tables: { label: string } | null } | null;
  kitchen_ticket_items: {
    quantity: number;
    order_items: {
      id: string;
      name_i18n: Json;
      note: string | null;
      sort: number;
      quantity: number;
      cancelled_quantity: number;
      order_item_modifiers: { name_i18n: Json }[];
    } | null;
  }[];
};

export type LocalizedText = { text: string; locale: Locale };

export type BoardLine = {
  id: string;
  quantity: number; // what to cook now (or, on a cancellation slip, what was cancelled)
  orderedQuantity: number; // what the ticket asked for when it was printed
  name: string;
  nameLocale: Locale;
  note: string | null;
  modifiers: LocalizedText[];
};

export type BoardTicket = {
  id: string;
  kind: "order" | "void";
  status: TicketStatus;
  number: number;
  createdAt: number;
  readyAt: number | null;
  firstSeen: boolean;
  table: string | null;
  source: OrderSource;
  orderNote: string | null;
  lines: BoardLine[];
};

export type ShownTicket = BoardTicket & { pending: boolean };

// What a kitchen screen can do; queued in the offline outbox.
export type KitchenAction =
  | { kind: "set_ticket_status"; ticketId: string; expected: TicketStatus; next: TicketStatus }
  | { kind: "acknowledge_void"; ticketId: string };

const FALLBACK: readonly Locale[] = ["hy", "ru", "en"];

// Order lines keep the dish name in every language (i18n.md); the kitchen reads
// its own language, then Armenian, Russian, English. Never an empty line.
export function pickName(names: Json, locale: Locale): LocalizedText {
  const map = names && typeof names === "object" && !Array.isArray(names) ? (names as Record<string, Json | undefined>) : {};
  for (const l of [locale, ...FALLBACK]) {
    const v = map[l];
    if (typeof v === "string" && v.trim()) return { text: v.trim(), locale: l };
  }
  return { text: "—", locale };
}

const LIVE: readonly TicketStatus[] = ["new", "cooking", "ready"];

export function toBoardTickets(rows: readonly TicketRow[], locale: Locale): BoardTicket[] {
  const out: BoardTicket[] = [];
  for (const r of rows) {
    if (!LIVE.includes(r.status)) continue;
    if (r.kind === "void" && r.acknowledged_at) continue;
    // Settled tables have eaten: their plates no longer wait for a waiter.
    if (r.kind === "order" && r.status === "ready" && r.orders?.paid_at) continue;

    const lines: BoardLine[] = [];
    const items = [...r.kitchen_ticket_items].sort((a, b) => (a.order_items?.sort ?? 0) - (b.order_items?.sort ?? 0));
    for (const k of items) {
      const oi = k.order_items;
      if (!oi) continue;
      const name = pickName(oi.name_i18n, locale);
      // A ticket never changes after it's printed; cancellations arrive as void
      // tickets. The order line knows what is still wanted.
      const left = Math.max(0, oi.quantity - oi.cancelled_quantity);
      lines.push({
        id: oi.id,
        quantity: r.kind === "void" ? k.quantity : Math.min(k.quantity, left),
        orderedQuantity: k.quantity,
        name: name.text,
        nameLocale: name.locale,
        note: oi.note?.trim() || null,
        modifiers: oi.order_item_modifiers.map((m) => pickName(m.name_i18n, locale)),
      });
    }
    if (r.kind === "order" && lines.every((l) => l.quantity === 0)) continue;

    out.push({
      id: r.id,
      kind: r.kind,
      status: r.status,
      number: r.number,
      createdAt: Date.parse(r.created_at),
      readyAt: r.ready_at ? Date.parse(r.ready_at) : null,
      firstSeen: r.first_seen_at !== null,
      table: r.orders?.tables?.label ?? null,
      source: r.orders?.source ?? "waiter",
      orderNote: r.orders?.guest_note?.trim() || null,
      lines,
    });
  }
  return out;
}

export type Columns<T extends BoardTicket = BoardTicket> = { new: T[]; cooking: T[]; ready: T[] };

// New: cancellations on top (they must be seen), then oldest orders first.
// Cooking: oldest first. Ready: the plate that has waited longest first.
export function groupTickets<T extends BoardTicket>(tickets: readonly T[]): Columns<T> {
  const cols: Columns<T> = { new: [], cooking: [], ready: [] };
  for (const t of tickets) {
    if (t.kind === "void") cols.new.push(t);
    else if (t.status === "new" || t.status === "cooking" || t.status === "ready") cols[t.status].push(t);
  }
  const byAge = (a: T, b: T) => a.createdAt - b.createdAt || a.number - b.number;
  cols.new.sort((a, b) => Number(b.kind === "void") - Number(a.kind === "void") || byAge(a, b));
  cols.cooking.sort(byAge);
  cols.ready.sort((a, b) => (a.readyAt ?? a.createdAt) - (b.readyAt ?? b.createdAt) || byAge(a, b));
  return cols;
}

export type OverlayAction = { action: KitchenAction; waiting: boolean };

// The board shows the server's state with the cook's own taps on top: taps
// still in the outbox (waiting) and taps sent but not yet seen in a refresh.
// A move applies only from the status it expected (compare-and-set).
export function applyPending(tickets: readonly BoardTicket[], overlay: readonly OverlayAction[]): ShownTicket[] {
  const shown = new Map<string, ShownTicket>(tickets.map((t) => [t.id, { ...t, pending: false }]));
  for (const { action, waiting } of overlay) {
    const t = shown.get(action.ticketId);
    if (!t) continue;
    if (action.kind === "acknowledge_void") {
      shown.delete(t.id);
      continue;
    }
    if (t.status === action.expected) {
      if (!LIVE.includes(action.next)) {
        shown.delete(t.id);
        continue;
      }
      t.status = action.next;
      // Just marked ready on this screen: it goes to the end of the Ready column.
      if (action.next === "ready") t.readyAt = Number.MAX_SAFE_INTEGER;
    }
    if (waiting) t.pending = true;
  }
  return [...shown.values()];
}
