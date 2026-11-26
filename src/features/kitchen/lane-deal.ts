import type { BoardTicket } from "./board-model";

// Which ticket column of a lane each ticket sits in (ADR-101). A lane is N
// stacks, not a row-aligned grid, so a short ticket never leaves a hole under
// it. Tickets are dealt oldest first into the shortest stack, and a ticket
// keeps its stack while it is on the board: when one is bumped the others do
// not jump (and a card halfway through "are you sure?" is not rebuilt).
export type LaneDeal = { readonly columns: number; readonly at: ReadonlyMap<string, number> };

type Dealt = Pick<BoardTicket, "id" | "kind" | "orderNote" | "orderAllergy" | "lines">;

// A ticket's rough height in px, enough to choose the shorter stack: the
// header and the button, then each line with its options, note and allergy
// mark (a long name or long options take a second line).
export function ticketWeight(t: Dealt): number {
  let h = t.kind === "void" ? 180 : 210;
  if (t.orderNote || t.orderAllergy) h += 60;
  for (const l of t.lines) {
    h += l.name.length > 18 ? 86 : 56;
    const options = l.modifiers.map((m) => m.text).join(", ");
    if (options) h += options.length > 28 ? 56 : 28;
    if (l.note) h += 36;
    if (l.allergy) h += 28;
    if (l.substitute) h += 28;
  }
  return h;
}

// How many 20 rem stacks fit across a lane of this width, with 1 rem between.
export function laneColumns(width: number, rem: number): number {
  return Math.max(1, Math.floor((width + rem) / (21 * rem)));
}

// The next deal for these tickets; the same object when nothing moved, so a
// caller can keep it in state without a render loop.
export function dealTickets(prev: LaneDeal | null, tickets: readonly Dealt[], columns: number): LaneDeal {
  const keep = prev !== null && prev.columns === columns;
  const at = new Map<string, number>();
  const heights = Array.from({ length: columns }, () => 0);
  const weight = new Map(tickets.map((t) => [t.id, ticketWeight(t)]));
  // Tickets already placed stay where they are.
  if (keep) {
    for (const t of tickets) {
      const c = prev.at.get(t.id);
      if (c === undefined || c >= columns) continue;
      at.set(t.id, c);
      heights[c]! += weight.get(t.id)!;
    }
  }
  let changed = !keep || at.size !== prev.at.size;
  for (const t of tickets) {
    if (at.has(t.id)) continue;
    let shortest = 0;
    for (let c = 1; c < columns; c++) if (heights[c]! < heights[shortest]!) shortest = c;
    at.set(t.id, shortest);
    heights[shortest]! += weight.get(t.id)!;
    changed = true;
  }
  return changed || prev === null ? { columns, at } : prev;
}

// The tickets of each stack, in the lane's order (oldest first).
export function stacks<T extends { id: string }>(deal: LaneDeal, tickets: readonly T[]): T[][] {
  const out = Array.from({ length: deal.columns }, () => [] as T[]);
  for (const t of tickets) out[deal.at.get(t.id) ?? 0]!.push(t);
  return out;
}
