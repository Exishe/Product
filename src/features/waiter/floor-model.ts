import type { Locale } from "@/i18n/routing";
import type { Database, Json } from "@/lib/supabase/types";
import { pickName, type LocalizedText } from "@/features/kitchen/board-model";

// The waiter's view of the floor (screens.md §5–6, design/waiter.html), built
// from the rows RLS lets a waiter read. Pure functions: the server page, the
// client and the tests share them.

type Enums = Database["public"]["Enums"];
export type OrderStatus = Enums["order_status"];
export type TicketStatus = Enums["ticket_status"];
export type OrderSource = Enums["order_source"];

// --- Rows (floor-data.ts) ----------------------------------------------------

export type OrderRow = {
  id: string;
  number: number;
  source: OrderSource;
  status: OrderStatus;
  kitchen_status: Enums["kitchen_status"];
  placed_at: string;
  // Optional: test rows and outbox previews have none.
  accepted_at?: string | null;
  accepted_by?: string | null;
  guest_note: string | null;
  total: number;
  reject_reason: string | null;
  possible_duplicate_of: string | null;
  order_items: {
    id: string;
    name_i18n: Json;
    quantity: number;
    cancelled_quantity: number;
    line_total: number;
    note: string | null;
    sort: number;
    station_id: string | null;
    order_item_modifiers: { name_i18n: Json }[];
    substitution?: Json | null; // ADR-076: {from, to, price_delta} when an ingredient was replaced
  }[];
  kitchen_tickets: {
    id: string;
    station_id: string;
    kind: Enums["ticket_kind"];
    status: TicketStatus;
    ready_at?: string | null;
    served_at?: string | null;
  }[];
};

export type SessionRow = {
  id: string;
  table_id: string;
  status: Enums["table_session_status"];
  opened_at: string;
  orders: OrderRow[];
};

export type RequestRow = {
  id: string;
  table_id: string;
  table_session_id: string | null;
  kind: Enums["service_request_kind"];
  status: Enums["service_request_status"];
  created_at: string;
  payment_preference: string | null;
};

export type TableRow = {
  id: string;
  label: string;
  area_id: string | null;
  shape: string;
  pos_x: number | null;
  pos_y: number | null;
  sort: number;
};

export type FloorRows = {
  areas: { id: string; name: string; sort: number }[];
  tables: TableRow[];
  sessions: SessionRow[];
  requests: RequestRow[];
  stations: { id: string; name: string; is_default: boolean }[];
};

// --- View ----------------------------------------------------------------------

export type TableState = "free" | "busy" | "new" | "ready" | "call" | "bill";

export type WaiterLine = {
  id: string;
  quantity: number; // still wanted
  cancelled: number;
  name: LocalizedText;
  note: string | null;
  modifiers: LocalizedText[];
  lineTotal: number;
  stationId: string | null;
  served: boolean;
};

export type WaiterTicket = {
  id: string;
  stationId: string;
  stationName: string | null;
  status: TicketStatus;
  readyAt: number | null;
  servedAt: number | null;
};

export type WaiterOrder = {
  id: string;
  number: number | null; // null: a waiter order still in the outbox
  source: OrderSource;
  status: OrderStatus;
  placedAt: number;
  /** When a staff member accepted a guest's order; null when it went straight to the kitchen. */
  acceptedAt: number | null;
  note: string | null;
  total: number;
  rejectReason: string | null;
  duplicate: boolean;
  lines: WaiterLine[];
  tickets: WaiterTicket[];
  pending: boolean; // a tap on it waits in the outbox
};

export type FloorTable = {
  id: string;
  label: string;
  areaId: string | null;
  shape: "square" | "round" | "rect";
  pos: { x: number; y: number } | null;
  state: TableState;
  sessionId: string | null;
  openedAt: number | null;
  openMinutes: number | null;
  orders: WaiterOrder[]; // newest first
  waiting: { sessionId: string; minutes: number; orders: WaiterOrder[] } | null;
  call: { id: string; minutes: number; at: number } | null;
  bill: { id: string; minutes: number; at: number; payment: "card" | "cash" | null } | null;
  total: number;
};

export type FloorArea = { id: string | null; name: string | null };
export type Floor = { areas: FloorArea[]; tables: FloorTable[] };

// What a waiter can do; queued in the offline outbox. Settling a table and
// cancelling a line are never queued (realtime.md): they need a connection.
export type PadLine = { item_id: string; quantity: number; modifier_ids: string[]; note: string | null };
export type WaiterAction =
  | { kind: "accept"; orderId: string }
  | { kind: "reject"; orderId: string; reason: string }
  | { kind: "serve"; ticketId: string }
  | { kind: "resolve"; requestId: string }
  | {
      kind: "place";
      key: string; // the idempotency key
      tableId: string;
      lines: PadLine[];
      note: string | null;
      locale: Locale;
      preview: { lines: { name: LocalizedText; quantity: number; lineTotal: number }[]; total: number };
    };

const minutesSince = (iso: string, now: number) => Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
const msOrNull = (iso: string | null | undefined) => (iso ? Date.parse(iso) : null);

// The system's default station is shown by role («Խոհանոց»), named ones by name.
const SYSTEM_STATION_NAME = "Kitchen";

function toOrder(
  row: OrderRow,
  locale: Locale,
  stations: Map<string, { name: string; is_default: boolean }>,
): WaiterOrder {
  const tickets = row.kitchen_tickets
    .filter((k) => k.kind === "order" && k.status !== "cancelled")
    .map((k) => {
      const st = stations.get(k.station_id);
      const stationName = !st || (st.is_default && st.name === SYSTEM_STATION_NAME) ? null : st.name;
      return {
        id: k.id,
        stationId: k.station_id,
        stationName,
        status: k.status,
        readyAt: msOrNull(k.ready_at),
        servedAt: msOrNull(k.served_at),
      };
    })
    .sort(
      (a, b) => Number(a.stationName !== null) - Number(b.stationName !== null) || a.id.localeCompare(b.id),
    );
  const servedAt = new Set(tickets.filter((k) => k.status === "served").map((k) => k.stationId));
  const lines = [...row.order_items]
    .sort((a, b) => a.sort - b.sort)
    .map((oi) => ({
      id: oi.id,
      quantity: Math.max(0, oi.quantity - oi.cancelled_quantity),
      cancelled: oi.cancelled_quantity,
      name: pickName(oi.name_i18n, locale),
      note: oi.note?.trim() || null,
      modifiers: oi.order_item_modifiers.map((m) => pickName(m.name_i18n, locale)),
      lineTotal: oi.line_total,
      stationId: oi.station_id,
      served: oi.station_id !== null && servedAt.has(oi.station_id),
    }));
  return {
    id: row.id,
    number: row.number,
    source: row.source,
    status: row.status,
    placedAt: Date.parse(row.placed_at),
    // Auto-accepted guest orders carry no accepted_by; a waiter's own order is
    // accepted as it is placed. Neither is a moment of its own.
    acceptedAt: row.source !== "waiter" && row.accepted_by ? msOrNull(row.accepted_at) : null,
    note: row.guest_note?.trim() || null,
    total: row.total,
    rejectReason: row.reject_reason,
    duplicate: row.possible_duplicate_of !== null,
    lines,
    tickets,
    pending: false,
  };
}

const newestFirst = (a: WaiterOrder, b: WaiterOrder) =>
  b.placedAt - a.placedAt || (b.number ?? Infinity) - (a.number ?? Infinity);

// Priority for the colour when several things happen at one table (screens.md
// §5): calling > new order > ready > bill > busy.
export function stateOf(t: Omit<FloorTable, "state" | "total">): TableState {
  if (t.call) return "call";
  if (t.waiting || t.orders.some((o) => o.status === "placed")) return "new";
  if (t.orders.some((o) => o.status === "accepted" && o.tickets.some((k) => k.status === "ready")))
    return "ready";
  if (t.bill) return "bill";
  if (t.sessionId || t.orders.length > 0) return "busy";
  return "free";
}

const sumAccepted = (orders: readonly WaiterOrder[]) =>
  orders.filter((o) => o.status === "accepted").reduce((s, o) => s + o.total, 0);

const labelOrder = (a: TableRow, b: TableRow) =>
  a.sort - b.sort || a.label.localeCompare(b.label, "en", { numeric: true });

export function buildFloor(rows: FloorRows, locale: Locale, now: number): Floor {
  const stations = new Map(rows.stations.map((s) => [s.id, s]));
  const tables = [...rows.tables].sort(labelOrder).map((tr): FloorTable => {
    const open = rows.sessions.find((s) => s.table_id === tr.id && s.status === "open") ?? null;
    const waiting = rows.sessions.find((s) => s.table_id === tr.id && s.status === "waiting") ?? null;
    const live = rows.requests.filter((r) => r.table_id === tr.id && r.status !== "resolved");
    const call = live.find((r) => r.kind === "call_waiter");
    const bill = live.find((r) => r.kind === "bring_bill");
    const base = {
      id: tr.id,
      label: tr.label,
      areaId: tr.area_id,
      shape: (["square", "round", "rect"] as const).find((s) => s === tr.shape) ?? "square",
      pos: tr.pos_x !== null && tr.pos_y !== null ? { x: tr.pos_x, y: tr.pos_y } : null,
      sessionId: open?.id ?? null,
      openedAt: open ? Date.parse(open.opened_at) : null,
      openMinutes: open ? minutesSince(open.opened_at, now) : null,
      orders: (open?.orders ?? []).map((o) => toOrder(o, locale, stations)).sort(newestFirst),
      waiting: waiting
        ? {
            sessionId: waiting.id,
            minutes: minutesSince(waiting.opened_at, now),
            orders: waiting.orders.map((o) => toOrder(o, locale, stations)).sort(newestFirst),
          }
        : null,
      call: call
        ? { id: call.id, minutes: minutesSince(call.created_at, now), at: Date.parse(call.created_at) }
        : null,
      bill: bill
        ? {
            id: bill.id,
            minutes: minutesSince(bill.created_at, now),
            at: Date.parse(bill.created_at),
            payment: (["card", "cash"] as const).find((m) => m === bill.payment_preference) ?? null,
          }
        : null,
    };
    return { ...base, state: stateOf(base), total: sumAccepted(base.orders) };
  });

  const used = new Set(tables.map((t) => t.areaId));
  const areas: FloorArea[] = [...rows.areas]
    .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name))
    .filter((a) => used.has(a.id))
    .map((a) => ({ id: a.id, name: a.name }));
  if (tables.some((t) => t.areaId === null || !areas.some((a) => a.id === t.areaId)))
    areas.push({ id: null, name: null });
  return { areas, tables };
}

export const areaOf = (t: FloorTable, areas: readonly FloorArea[]): string | null =>
  areas.some((a) => a.id === t.areaId) ? t.areaId : null;

const NEEDS: readonly TableState[] = ["new", "ready", "call", "bill"];
export const needCount = (tables: readonly FloorTable[]) =>
  tables.filter((t) => NEEDS.includes(t.state)).length;

// When the food of these orders first stood ready at the pass (the order's
// time when the ticket carries no ready time).
const readySince = (orders: readonly WaiterOrder[]) =>
  Math.min(
    ...orders.flatMap((o) =>
      o.tickets.filter((k) => k.status === "ready").map((k) => k.readyAt ?? o.placedAt),
    ),
  );

// The Orders and Calls tabs (ADR-054): one row per table and kind of request,
// the longest-waiting first. Only a different view of the floor; nothing new.
export type InboxRow = { table: FloorTable; kind: "new" | "ready" | "call" | "bill"; minutes: number };

export function inbox(tables: readonly FloorTable[], now: number): { orders: InboxRow[]; calls: InboxRow[] } {
  const orders: InboxRow[] = [];
  const calls: InboxRow[] = [];
  const since = (at: number) => Math.max(0, Math.floor((now - at) / 60_000));
  for (const table of tables) {
    const placed = [...table.orders, ...(table.waiting?.orders ?? [])].filter((o) => o.status === "placed");
    if (placed.length > 0)
      orders.push({ table, kind: "new", minutes: since(Math.min(...placed.map((o) => o.placedAt))) });
    const ready = table.orders.filter(
      (o) => o.status === "accepted" && o.tickets.some((k) => k.status === "ready"),
    );
    if (ready.length > 0) orders.push({ table, kind: "ready", minutes: since(readySince(ready)) });
    if (table.call) calls.push({ table, kind: "call", minutes: table.call.minutes });
    if (table.bill) calls.push({ table, kind: "bill", minutes: table.bill.minutes });
  }
  const oldestFirst = (a: InboxRow, b: InboxRow) => b.minutes - a.minutes;
  return { orders: orders.sort(oldestFirst), calls: calls.sort(oldestFirst) };
}

// The one obvious thing to do for a row of the Orders or Calls tab, without
// opening the table. Only when it can't be the wrong thing: an order that may
// be a repeat, a party waiting for the old bill or two new rounds at once need
// the full panel, and a bill with an order still to accept can't be closed.
export type QuickAction =
  { kind: "accept" | "serve" | "going"; actions: WaiterAction[] } | { kind: "settle"; sessionId: string };

export function quickAction(row: InboxRow): QuickAction | null {
  const { table } = row;
  switch (row.kind) {
    case "call":
      return table.call ? { kind: "going", actions: [{ kind: "resolve", requestId: table.call.id }] } : null;
    case "ready": {
      const actions: WaiterAction[] = table.orders
        .filter((o) => o.status === "accepted" && o.number !== null && !o.pending)
        .flatMap((o) =>
          o.tickets
            .filter((k) => k.status === "ready")
            .map((k) => ({ kind: "serve" as const, ticketId: k.id })),
        );
      return actions.length > 0 ? { kind: "serve", actions } : null;
    }
    case "new": {
      if (table.waiting) return null;
      const placed = table.orders.filter((o) => o.status === "placed");
      const only = placed.length === 1 ? placed[0] : undefined;
      return only && !only.duplicate && !only.pending
        ? { kind: "accept", actions: [{ kind: "accept", orderId: only.id }] }
        : null;
    }
    case "bill":
      return table.sessionId && closeBlocker(table) === null && !table.waiting
        ? { kind: "settle", sessionId: table.sessionId }
        : null;
  }
}

// --- What happened at the table ---------------------------------------------------

// A table's evening as a list of moments, oldest first (the panel's «Ինչ է
// եղել»). Only what the floor already reads: a call that was answered is no
// longer fetched, so it is not on the list.
export type TimelineEvent =
  | { kind: "seated"; at: number }
  | { kind: "placed" | "accepted"; at: number; number: number; source: OrderSource }
  | { kind: "ready" | "served"; at: number; number: number; station: string | null }
  | { kind: "call" | "bill"; at: number };

export function timeline(table: FloorTable): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  if (table.openedAt !== null) events.push({ kind: "seated", at: table.openedAt });
  for (const o of table.orders) {
    if (o.number === null || o.status === "rejected") continue;
    const number = o.number;
    events.push({ kind: "placed", at: o.placedAt, number, source: o.source });
    if (o.acceptedAt !== null) events.push({ kind: "accepted", at: o.acceptedAt, number, source: o.source });
    const several = o.tickets.length > 1;
    for (const k of o.tickets) {
      const station = several ? k.stationName : null;
      if (k.readyAt !== null) events.push({ kind: "ready", at: k.readyAt, number, station });
      if (k.servedAt !== null) events.push({ kind: "served", at: k.servedAt, number, station });
    }
  }
  if (table.call) events.push({ kind: "call", at: table.call.at });
  if (table.bill) events.push({ kind: "bill", at: table.bill.at });
  return events.sort((a, b) => a.at - b.at);
}

// A seated table with nothing new for this long gets a «լուռ է» cue on the
// map: with QR ordering the risk is that nobody walks over (scout finding).
export const QUIET_MINUTES = 20;

// The minutes the table's most urgent thing has waited, for the badge on its
// tile; for a seated table, how long it has been quiet (null below the cue).
export function tileAge(table: FloorTable, now: number): { kind: "wait" | "quiet"; minutes: number } | null {
  const since = (at: number) => Math.max(0, Math.floor((now - at) / 60_000));
  switch (table.state) {
    case "call":
      return table.call ? { kind: "wait", minutes: table.call.minutes } : null;
    case "new": {
      const placed = [...table.orders, ...(table.waiting?.orders ?? [])].filter((o) => o.status === "placed");
      const at = Math.min(...placed.map((o) => o.placedAt));
      return Number.isFinite(at) && at <= now ? { kind: "wait", minutes: since(at) } : null;
    }
    case "ready": {
      const ready = table.orders.filter(
        (o) => o.status === "accepted" && o.tickets.some((k) => k.status === "ready"),
      );
      return { kind: "wait", minutes: since(readySince(ready)) };
    }
    case "bill":
      return table.bill ? { kind: "wait", minutes: table.bill.minutes } : null;
    case "busy": {
      const last = Math.max(...timeline(table).map((e) => e.at));
      if (!Number.isFinite(last) || last > now) return null;
      const minutes = since(last);
      return minutes >= QUIET_MINUTES ? { kind: "quiet", minutes } : null;
    }
    default:
      return null;
  }
}

// Saved floor positions (tables.pos_x/pos_y) draw the room; without them for
// every table of an area, tables flow in order.
// A long ("rect") table takes two columns, but only where the cell to its right
// is free: a neighbour placed there would otherwise sit on top of it.
export function areaLayout(
  tables: readonly { id: string; shape: string; pos: { x: number; y: number } | null }[],
) {
  const wide = new Set<string>();
  if (tables.length === 0 || tables.some((t) => t.pos === null))
    return { placed: false, columns: 0, rows: 0, wide };
  const taken = new Set(tables.map((t) => `${t.pos?.x},${t.pos?.y}`));
  let columns = 0;
  let rows = 0;
  for (const t of tables) {
    const { x, y } = t.pos ?? { x: 0, y: 0 };
    const spans = t.shape === "rect" && !taken.has(`${x + 1},${y}`);
    if (spans) wide.add(t.id);
    columns = Math.max(columns, x + (spans ? 2 : 1));
    rows = Math.max(rows, y + 1);
  }
  return { placed: true, columns, rows, wide };
}

// --- Closing the table ----------------------------------------------------------

export function closeBlocker(t: FloorTable): "pending" | "no_session" | null {
  if (!t.sessionId) return "no_session";
  if (t.orders.some((o) => o.status === "placed")) return "pending";
  return null;
}

export type PayMode = "cash" | "card" | "split";
export type PayInput = { mode: PayMode | null; cash: string; card: string };
export type Payment = { method: "cash" | "card_terminal"; amount: number };

const amount = (s: string) => {
  const digits = s.replace(/\D/g, "");
  return digits === "" ? 0 : Number(digits);
};

// The amounts must add up to the bill exactly (screens.md §6).
export function settlement(
  input: PayInput,
  total: number,
): { ok: boolean; paid: number; payments: Payment[] } {
  if (input.mode === "cash") return { ok: true, paid: total, payments: [{ method: "cash", amount: total }] };
  if (input.mode === "card")
    return { ok: true, paid: total, payments: [{ method: "card_terminal", amount: total }] };
  if (input.mode === "split") {
    const payments: Payment[] = [
      { method: "cash", amount: amount(input.cash) },
      { method: "card_terminal", amount: amount(input.card) },
    ];
    const paid = payments.reduce((s, p) => s + p.amount, 0);
    return { ok: paid === total, paid, payments };
  }
  return { ok: false, paid: 0, payments: [] };
}

// --- Taps in flight --------------------------------------------------------------

export type OverlayAction = { action: WaiterAction; waiting: boolean };

// The floor shows the server's state with this tablet's own taps on top: taps
// still in the outbox (waiting) and taps sent but not yet seen in a refresh.
export function applyPending(tables: readonly FloorTable[], overlay: readonly OverlayAction[]): FloorTable[] {
  const out = tables.map((t) => ({
    ...t,
    orders: t.orders.map((o) => ({ ...o, tickets: o.tickets.map((k) => ({ ...k })) })),
    waiting: t.waiting ? { ...t.waiting, orders: t.waiting.orders.map((o) => ({ ...o })) } : null,
  }));
  const allOrders = () => out.flatMap((t) => [...t.orders, ...(t.waiting?.orders ?? [])]);
  for (const { action, waiting } of overlay) {
    if (action.kind === "accept" || action.kind === "reject") {
      const o = allOrders().find((x) => x.id === action.orderId);
      if (o && o.status === "placed") o.status = action.kind === "accept" ? "accepted" : "rejected";
      if (o && waiting) o.pending = true;
    } else if (action.kind === "serve") {
      const o = allOrders().find((x) => x.tickets.some((k) => k.id === action.ticketId));
      const k = o?.tickets.find((x) => x.id === action.ticketId);
      if (o && k && k.status === "ready") {
        k.status = "served";
        for (const l of o.lines) if (l.stationId === k.stationId) l.served = true;
      }
      if (o && waiting) o.pending = true;
    } else if (action.kind === "resolve") {
      for (const t of out) {
        if (t.call?.id === action.requestId) t.call = null;
        if (t.bill?.id === action.requestId) t.bill = null;
      }
    } else if (action.kind === "place") {
      const t = out.find((x) => x.id === action.tableId);
      if (t && !t.orders.some((o) => o.id === action.key)) {
        t.orders.unshift({
          id: action.key,
          number: null,
          source: "waiter",
          status: "accepted",
          placedAt: Number.MAX_SAFE_INTEGER,
          acceptedAt: null,
          note: action.note,
          total: action.preview.total,
          rejectReason: null,
          duplicate: false,
          lines: action.preview.lines.map((l, i) => ({
            id: `${action.key}-${i}`,
            quantity: l.quantity,
            cancelled: 0,
            name: l.name,
            note: null,
            modifiers: [],
            lineTotal: l.lineTotal,
            stationId: null,
            served: false,
          })),
          tickets: [],
          pending: waiting,
        });
      }
    }
  }
  return out.map((t) => ({ ...t, state: stateOf(t), total: sumAccepted(t.orders) }));
}

// Which table a queued tap is about, for the «Չուղարկված» list and the dot on
// the map. Read against the server's floor (before the taps are applied: a
// resolved call is gone from the overlaid one).
export function tableOfAction(tables: readonly FloorTable[], action: WaiterAction): FloorTable | null {
  const orders = (t: FloorTable) => [...t.orders, ...(t.waiting?.orders ?? [])];
  switch (action.kind) {
    case "place":
      return tables.find((t) => t.id === action.tableId) ?? null;
    case "accept":
    case "reject":
      return tables.find((t) => orders(t).some((o) => o.id === action.orderId)) ?? null;
    case "serve":
      return (
        tables.find((t) => orders(t).some((o) => o.tickets.some((k) => k.id === action.ticketId))) ?? null
      );
    case "resolve":
      return tables.find((t) => t.call?.id === action.requestId || t.bill?.id === action.requestId) ?? null;
  }
}
