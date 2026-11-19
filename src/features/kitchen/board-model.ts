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
  orders: {
    source: OrderSource;
    guest_note: string | null;
    paid_at: string | null;
    tables: { label: string } | null;
  } | null;
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
  allergy: boolean; // the line's note mentions an allergy
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
  orderAllergy: boolean; // the order's note mentions an allergy
  allergy: boolean; // the order's note or the note of a line still wanted does
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
  const map =
    names && typeof names === "object" && !Array.isArray(names)
      ? (names as Record<string, Json | undefined>)
      : {};
  for (const l of [locale, ...FALLBACK]) {
    const v = map[l];
    if (typeof v === "string" && v.trim()) return { text: v.trim(), locale: l };
  }
  return { text: "—", locale };
}

// Guest notes are free text in three languages. A note that names an allergy
// or an intolerance gets the red allergy banner on the ticket and its own
// sound; a plain wish ("no onion") stays an ordinary note. Stems match at the
// start of a word (the three languages inflect at the end), so «ալերգիա»,
// «аллергия», "allergic" and "nuts" count, and "minute" or "donut" don't.
const ALLERGY_STEMS = [
  // Armenian
  "ալերգ",
  "գլյուտեն",
  "սնձան",
  "լակտոզ",
  "ընկույզ",
  "գետնանուշ",
  "ցելիակ",
  "անտանել",
  // Russian
  "аллерг",
  "глютен",
  "лактоз",
  "орех",
  "арахис",
  "целиак",
  "непереносим",
  "анафилак",
  // English
  "allerg",
  "gluten",
  "lactose",
  "coeliac",
  "celiac",
  "peanut",
  "intoleran",
  "anaphyla",
  "epipen",
];
const ALLERGY = new RegExp(`(?<!\\p{L})(?:${ALLERGY_STEMS.join("|")}|nuts?(?!\\p{L}))`, "iu");

export function mentionsAllergy(note: string | null | undefined): boolean {
  return !!note && ALLERGY.test(note);
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
    const items = [...r.kitchen_ticket_items].sort(
      (a, b) => (a.order_items?.sort ?? 0) - (b.order_items?.sort ?? 0),
    );
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
        allergy: mentionsAllergy(oi.note),
      });
    }
    if (r.kind === "order" && lines.every((l) => l.quantity === 0)) continue;

    const orderNote = r.orders?.guest_note?.trim() || null;
    const orderAllergy = mentionsAllergy(orderNote);

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
      orderNote,
      orderAllergy,
      allergy: r.kind === "order" && (orderAllergy || lines.some((l) => l.allergy && l.quantity > 0)),
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
export function applyPending(
  tickets: readonly BoardTicket[],
  overlay: readonly OverlayAction[],
): ShownTicket[] {
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

// "All day" (the kitchen's word for it): how many of each dish is still to be
// cooked across every order ticket in New and Cooking, so a cook can fire a
// batch instead of reading eight tickets. Lines that differ only in their
// options count together; the options are listed under the dish.
export type AllDayRow = {
  key: string;
  name: string;
  nameLocale: Locale;
  quantity: number;
  variants: { text: string; quantity: number }[]; // empty when every line is plain
  ticketIds: string[];
};

export function allDay(tickets: readonly BoardTicket[]): AllDayRow[] {
  type Acc = AllDayRow & { byVariant: Map<string, number> };
  const rows = new Map<string, Acc>();
  for (const t of tickets) {
    if (t.kind !== "order" || (t.status !== "new" && t.status !== "cooking")) continue;
    for (const l of t.lines) {
      if (l.quantity <= 0) continue;
      const key = `${l.nameLocale}:${l.name}`;
      let row = rows.get(key);
      if (!row) {
        row = {
          key,
          name: l.name,
          nameLocale: l.nameLocale,
          quantity: 0,
          variants: [],
          ticketIds: [],
          byVariant: new Map(),
        };
        rows.set(key, row);
      }
      row.quantity += l.quantity;
      if (!row.ticketIds.includes(t.id)) row.ticketIds.push(t.id);
      const variant = l.modifiers.map((m) => m.text).join(", ");
      row.byVariant.set(variant, (row.byVariant.get(variant) ?? 0) + l.quantity);
    }
  }
  const out: AllDayRow[] = [];
  for (const { byVariant, ...row } of rows.values()) {
    const plain = byVariant.size === 1 && byVariant.has("");
    const variants = plain
      ? []
      : [...byVariant]
          .map(([text, quantity]) => ({ text, quantity }))
          .sort((a, b) => b.quantity - a.quantity || a.text.localeCompare(b.text));
    out.push({ ...row, variants });
  }
  return out.sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
}

// Item-level bump: the lines a cook has struck on tickets in Cooking. A ticket
// is done when every line still wanted is struck.
export const lineKey = (ticketId: string, lineId: string) => `${ticketId}/${lineId}`;

export function allLinesStruck(ticket: BoardTicket, struck: ReadonlySet<string>): boolean {
  const wanted = ticket.lines.filter((l) => l.quantity > 0);
  return wanted.length > 0 && wanted.every((l) => struck.has(lineKey(ticket.id, l.id)));
}

// Keeps only the strikes of tickets still cooking on the board.
export function pruneStruck(struck: ReadonlySet<string>, tickets: readonly BoardTicket[]): Set<string> {
  const cooking = new Set(
    tickets.filter((t) => t.kind === "order" && t.status === "cooking").map((t) => t.id),
  );
  return new Set([...struck].filter((k) => cooking.has(k.slice(0, k.indexOf("/")))));
}
