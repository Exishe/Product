import { describe, expect, it } from "vitest";
import { applyPending, groupTickets, pickName, toBoardTickets, type BoardTicket, type TicketRow } from "./board-model";

function first<T>(list: readonly T[]): T {
  if (list.length === 0) throw new Error("empty list");
  return list[0] as T;
}

const at = (minute: number) => new Date(Date.UTC(2026, 10, 13, 18, minute)).toISOString();

function row(over: Partial<TicketRow> = {}): TicketRow {
  return {
    id: "t1",
    kind: "order",
    status: "new",
    number: 17,
    created_at: at(0),
    ready_at: null,
    first_seen_at: null,
    acknowledged_at: null,
    orders: { source: "waiter", guest_note: null, paid_at: null, tables: { label: "5" } },
    kitchen_ticket_items: [
      {
        quantity: 2,
        order_items: {
          id: "i1",
          name_i18n: { hy: "Հավի խորոված", ru: "Хоровац из курицы", en: "Chicken khorovats" },
          note: "Լավ եփած",
          sort: 2,
          quantity: 2,
          cancelled_quantity: 0,
          order_item_modifiers: [{ name_i18n: { hy: "Մեծ", en: "Large" } }],
        },
      },
      {
        quantity: 1,
        order_items: {
          id: "i0",
          name_i18n: { hy: "Ամառային աղցան" },
          note: null,
          sort: 1,
          quantity: 1,
          cancelled_quantity: 0,
          order_item_modifiers: [],
        },
      },
    ],
    ...over,
  };
}

function ticket(over: Partial<BoardTicket> & Pick<BoardTicket, "id">): BoardTicket {
  return {
    kind: "order",
    status: "new",
    number: 1,
    createdAt: Date.UTC(2026, 10, 13, 18, 0),
    readyAt: null,
    firstSeen: true,
    table: "1",
    source: "qr",
    orderNote: null,
    lines: [],
    ...over,
  };
}

describe("pickName", () => {
  it("uses the kitchen's language, then Armenian, Russian, English", () => {
    expect(pickName({ hy: "Տոլմա", ru: "Толма", en: "Tolma" }, "ru")).toEqual({ text: "Толма", locale: "ru" });
    expect(pickName({ hy: "Տոլմա", en: "Tolma" }, "ru")).toEqual({ text: "Տոլմա", locale: "hy" });
    expect(pickName({ ru: "Толма", en: "Tolma" }, "en")).toEqual({ text: "Tolma", locale: "en" });
    expect(pickName({ en: "Tolma", ru: "  " }, "hy")).toEqual({ text: "Tolma", locale: "en" });
  });

  it("never returns an empty line", () => {
    expect(pickName(null, "hy")).toEqual({ text: "—", locale: "hy" });
  });
});

describe("toBoardTickets", () => {
  it("turns a row into a slip in the kitchen's language, lines in menu order", () => {
    const t = first(toBoardTickets([row({ orders: { source: "qr", guest_note: "Առանց սոխի", paid_at: null, tables: { label: "5" } } })], "hy"));
    expect(t).toMatchObject({ id: "t1", kind: "order", status: "new", number: 17, table: "5", source: "qr", orderNote: "Առանց սոխի" });
    expect(t.createdAt).toBe(Date.UTC(2026, 10, 13, 18, 0));
    expect(t.lines.map((l) => [l.quantity, l.name])).toEqual([
      [1, "Ամառային աղցան"],
      [2, "Հավի խորոված"],
    ]);
    expect(t.lines[1]).toMatchObject({ note: "Լավ եփած", modifiers: [{ text: "Մեծ", locale: "hy" }] });
  });

  it("shows what is left to cook after a waiter cancels part of a line", () => {
    const r = row();
    first(r.kitchen_ticket_items).order_items!.cancelled_quantity = 1;
    const t = first(toBoardTickets([r], "hy"));
    expect(t.lines[1]).toMatchObject({ quantity: 1, orderedQuantity: 2 });
  });

  it("drops an order slip once nothing on it is left to cook", () => {
    const r = row();
    for (const k of r.kitchen_ticket_items) k.order_items!.cancelled_quantity = k.order_items!.quantity;
    expect(toBoardTickets([r], "hy")).toEqual([]);
  });

  it("keeps the cancelled quantity on a cancellation slip", () => {
    const r = row({ id: "v1", kind: "void" });
    const line = first(r.kitchen_ticket_items);
    r.kitchen_ticket_items = [line];
    line.quantity = 1;
    line.order_items!.cancelled_quantity = 1;
    const t = first(toBoardTickets([r], "hy"));
    expect(t.kind).toBe("void");
    expect(t.lines).toEqual([expect.objectContaining({ quantity: 1, name: "Հավի խորոված" })]);
  });

  it("hides ready food of a table that has already paid, but never food still cooking", () => {
    const paid = { source: "waiter" as const, guest_note: null, paid_at: at(30), tables: { label: "5" } };
    expect(toBoardTickets([row({ status: "ready", orders: paid })], "hy")).toEqual([]);
    expect(toBoardTickets([row({ status: "cooking", orders: paid })], "hy")).toHaveLength(1);
  });

  it("drops acknowledged cancellations and finished tickets", () => {
    expect(toBoardTickets([row({ kind: "void", acknowledged_at: at(5) })], "hy")).toEqual([]);
    expect(toBoardTickets([row({ status: "served" }), row({ status: "cancelled" })], "hy")).toEqual([]);
  });

  it("remembers whether a screen has drawn the ticket before", () => {
    expect(first(toBoardTickets([row()], "hy")).firstSeen).toBe(false);
    expect(first(toBoardTickets([row({ first_seen_at: at(1) })], "hy")).firstSeen).toBe(true);
  });
});

describe("groupTickets", () => {
  it("puts cancellations on top of New, then the oldest orders first", () => {
    const g = groupTickets([
      ticket({ id: "young", createdAt: 300 }),
      ticket({ id: "old", createdAt: 100 }),
      ticket({ id: "void", kind: "void", createdAt: 500 }),
      ticket({ id: "cook2", status: "cooking", createdAt: 200 }),
      ticket({ id: "cook1", status: "cooking", createdAt: 50 }),
      ticket({ id: "ready-late", status: "ready", createdAt: 10, readyAt: 900 }),
      ticket({ id: "ready-early", status: "ready", createdAt: 20, readyAt: 800 }),
    ]);
    expect(g.new.map((t) => t.id)).toEqual(["void", "old", "young"]);
    expect(g.cooking.map((t) => t.id)).toEqual(["cook1", "cook2"]);
    expect(g.ready.map((t) => t.id)).toEqual(["ready-early", "ready-late"]);
  });
});

describe("applyPending", () => {
  const board = [ticket({ id: "a" }), ticket({ id: "v", kind: "void" }), ticket({ id: "b", status: "cooking" })];

  it("moves a slip at once when the cook taps, and marks it as waiting to send", () => {
    const shown = applyPending(board, [{ action: { kind: "set_ticket_status", ticketId: "a", expected: "new", next: "cooking" }, waiting: true }]);
    expect(shown.find((t) => t.id === "a")).toMatchObject({ status: "cooking", pending: true });
    expect(shown.find((t) => t.id === "b")).toMatchObject({ status: "cooking", pending: false });
  });

  it("chains taps made while offline", () => {
    const shown = applyPending(board, [
      { action: { kind: "set_ticket_status", ticketId: "a", expected: "new", next: "cooking" }, waiting: true },
      { action: { kind: "set_ticket_status", ticketId: "a", expected: "cooking", next: "ready" }, waiting: true },
    ]);
    expect(shown.find((t) => t.id === "a")?.status).toBe("ready");
  });

  it("hides a cancellation once it is acknowledged", () => {
    const shown = applyPending(board, [{ action: { kind: "acknowledge_void", ticketId: "v" }, waiting: false }]);
    expect(shown.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("keeps a sent move without the waiting mark until the next refresh confirms it", () => {
    const shown = applyPending(board, [{ action: { kind: "set_ticket_status", ticketId: "a", expected: "new", next: "cooking" }, waiting: false }]);
    expect(shown.find((t) => t.id === "a")).toMatchObject({ status: "cooking", pending: false });
  });

  it("does not apply a move the server state no longer allows", () => {
    const shown = applyPending(board, [{ action: { kind: "set_ticket_status", ticketId: "b", expected: "new", next: "cooking" }, waiting: true }]);
    expect(shown.find((t) => t.id === "b")).toMatchObject({ status: "cooking", pending: true });
    const ready = applyPending(board, [{ action: { kind: "set_ticket_status", ticketId: "b", expected: "new", next: "ready" }, waiting: false }]);
    expect(ready.find((t) => t.id === "b")?.status).toBe("cooking");
  });

  it("takes a slip off the board when it is served", () => {
    const shown = applyPending([ticket({ id: "r", status: "ready" })], [
      { action: { kind: "set_ticket_status", ticketId: "r", expected: "ready", next: "served" }, waiting: true },
    ]);
    expect(shown).toEqual([]);
  });
});
