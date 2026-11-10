import { describe, expect, it } from "vitest";
import {
  applyPending,
  areaLayout,
  buildFloor,
  closeBlocker,
  needCount,
  settlement,
  type FloorRows,
  type OrderRow,
  type SessionRow,
} from "./floor-model";

const T0 = Date.parse("2026-11-09T18:00:00Z");
const iso = (minutes: number) => new Date(T0 + minutes * 60_000).toISOString();

const item = (id: string, over: Partial<OrderRow["order_items"][number]> = {}): OrderRow["order_items"][number] => ({
  id,
  name_i18n: { hy: "Տոլմա", ru: "Толма" },
  quantity: 2,
  cancelled_quantity: 0,
  line_total: 6400,
  note: null,
  sort: 1,
  station_id: "kitchen",
  order_item_modifiers: [],
  ...over,
});

const order = (id: string, over: Partial<OrderRow> = {}): OrderRow => ({
  id,
  number: 7,
  source: "qr",
  status: "accepted",
  kitchen_status: "pending",
  placed_at: iso(0),
  guest_note: null,
  total: 6400,
  reject_reason: null,
  possible_duplicate_of: null,
  order_items: [item(`${id}-1`)],
  kitchen_tickets: [{ id: `${id}-k`, station_id: "kitchen", kind: "order", status: "new" }],
  ...over,
});

const session = (id: string, table: string, orders: OrderRow[], over: Partial<SessionRow> = {}): SessionRow => ({
  id,
  table_id: table,
  status: "open",
  opened_at: iso(-30),
  orders,
  ...over,
});

const rows = (over: Partial<FloorRows> = {}): FloorRows => ({
  areas: [
    { id: "hall", name: "Դահլիճ", sort: 1 },
    { id: "terrace", name: "Պատշգամբ", sort: 2 },
  ],
  tables: [
    { id: "t1", label: "1", area_id: "hall", shape: "square", pos_x: null, pos_y: null, sort: 1 },
    { id: "t2", label: "2", area_id: "hall", shape: "round", pos_x: null, pos_y: null, sort: 2 },
    { id: "t10", label: "10", area_id: "terrace", shape: "rect", pos_x: null, pos_y: null, sort: 3 },
  ],
  sessions: [],
  requests: [],
  stations: [
    { id: "kitchen", name: "Kitchen", is_default: true },
    { id: "bar", name: "Բար", is_default: false },
  ],
  ...over,
});

const byId = (floor: ReturnType<typeof buildFloor>, id: string) => {
  const t = floor.tables.find((x) => x.id === id);
  if (!t) throw new Error(id);
  return t;
};

describe("table states (screens.md §5)", () => {
  it("a table without a session is free", () => {
    expect(byId(buildFloor(rows(), "hy", T0), "t1").state).toBe("free");
  });

  it("a session without orders is busy (seated)", () => {
    const floor = buildFloor(rows({ sessions: [session("s1", "t1", [])] }), "hy", T0);
    expect(byId(floor, "t1").state).toBe("busy");
    expect(byId(floor, "t1").openMinutes).toBe(30);
  });

  it("an order waiting for acceptance is a new order", () => {
    const floor = buildFloor(rows({ sessions: [session("s1", "t1", [order("o1", { status: "placed", kitchen_tickets: [] })])] }), "hy", T0);
    expect(byId(floor, "t1").state).toBe("new");
  });

  it("food ready at any station makes the table ready", () => {
    const o = order("o1", {
      kitchen_status: "cooking",
      kitchen_tickets: [
        { id: "k1", station_id: "kitchen", kind: "order", status: "cooking" },
        { id: "k2", station_id: "bar", kind: "order", status: "ready" },
      ],
    });
    expect(byId(buildFloor(rows({ sessions: [session("s1", "t1", [o])] }), "hy", T0), "t1").state).toBe("ready");
  });

  it("an open bill request is «Հաշիվ», a call is «Կանչում են»", () => {
    const served = order("o1", { kitchen_status: "served", kitchen_tickets: [{ id: "k", station_id: "kitchen", kind: "order", status: "served" }] });
    const base = { sessions: [session("s1", "t1", [served])] };
    const bill = buildFloor(rows({ ...base, requests: [{ id: "r1", table_id: "t1", table_session_id: "s1", kind: "bring_bill", status: "open", created_at: iso(-2) }] }), "hy", T0);
    expect(byId(bill, "t1").state).toBe("bill");
    const call = buildFloor(
      rows({
        ...base,
        requests: [
          { id: "r1", table_id: "t1", table_session_id: "s1", kind: "bring_bill", status: "open", created_at: iso(-2) },
          { id: "r2", table_id: "t1", table_session_id: "s1", kind: "call_waiter", status: "acknowledged", created_at: iso(-3) },
        ],
      }),
      "hy",
      T0,
    );
    expect(byId(call, "t1").state).toBe("call");
    expect(byId(call, "t1").call).toEqual({ id: "r2", minutes: 3 });
  });

  it("priority: calling > new order > ready > bill > busy", () => {
    const placed = order("o2", { status: "placed", kitchen_tickets: [] });
    const ready = order("o1", { kitchen_status: "ready", kitchen_tickets: [{ id: "k", station_id: "kitchen", kind: "order", status: "ready" }] });
    const both = buildFloor(rows({ sessions: [session("s1", "t1", [ready, placed])] }), "hy", T0);
    expect(byId(both, "t1").state).toBe("new");
  });

  it("a new party waiting at the table is a new order and is listed apart", () => {
    const served = order("o1", { kitchen_status: "served", kitchen_tickets: [{ id: "k", station_id: "kitchen", kind: "order", status: "served" }] });
    const waitingOrder = order("o9", { status: "placed", number: 9, kitchen_tickets: [] });
    const floor = buildFloor(
      rows({ sessions: [session("s1", "t1", [served]), session("w1", "t1", [waitingOrder], { status: "waiting", opened_at: iso(-1) })] }),
      "hy",
      T0,
    );
    const t = byId(floor, "t1");
    expect(t.state).toBe("new");
    expect(t.sessionId).toBe("s1");
    expect(t.orders.map((o) => o.id)).toEqual(["o1"]);
    expect(t.waiting?.sessionId).toBe("w1");
    expect(t.waiting?.orders.map((o) => o.id)).toEqual(["o9"]);
  });

  it("counts the tables that need someone", () => {
    const floor = buildFloor(
      rows({
        sessions: [session("s1", "t1", [order("o1", { status: "placed", kitchen_tickets: [] })]), session("s2", "t2", [])],
        requests: [{ id: "r", table_id: "t10", table_session_id: null, kind: "call_waiter", status: "open", created_at: iso(0) }],
      }),
      "hy",
      T0,
    );
    expect(needCount(floor.tables)).toBe(2);
  });
});

describe("orders in the panel", () => {
  it("newest round first, lines with live quantities, names in the screen's language with fallback", () => {
    const o1 = order("o1", { placed_at: iso(-20), number: 3 });
    const o2 = order("o2", {
      placed_at: iso(-5),
      number: 8,
      order_items: [item("a", { name_i18n: { ru: "Хачапури" }, quantity: 3, cancelled_quantity: 1, line_total: 3000, station_id: "bar" })],
    });
    const t = byId(buildFloor(rows({ sessions: [session("s1", "t1", [o1, o2])] }), "en", T0), "t1");
    expect(t.orders.map((o) => o.number)).toEqual([8, 3]);
    expect(t.orders[0]?.lines[0]).toMatchObject({ quantity: 2, cancelled: 1, name: { text: "Хачапури", locale: "ru" }, lineTotal: 3000 });
  });

  it("the total counts accepted orders only, as the bill will", () => {
    const t = byId(
      buildFloor(
        rows({
          sessions: [
            session("s1", "t1", [
              order("o1", { total: 6400 }),
              order("o2", { status: "rejected", total: 1000 }),
              order("o3", { status: "placed", total: 500, kitchen_tickets: [] }),
            ]),
          ],
        }),
        "hy",
        T0,
      ),
      "t1",
    );
    expect(t.total).toBe(6400);
  });

  it("station chips: the default station named Kitchen has no custom name", () => {
    const o = order("o1", {
      kitchen_tickets: [
        { id: "k1", station_id: "kitchen", kind: "order", status: "ready" },
        { id: "k2", station_id: "bar", kind: "order", status: "served" },
        { id: "v", station_id: "bar", kind: "void", status: "new" },
      ],
    });
    const t = byId(buildFloor(rows({ sessions: [session("s1", "t1", [o])] }), "hy", T0), "t1");
    expect(t.orders[0]?.tickets).toEqual([
      { id: "k1", stationId: "kitchen", stationName: null, status: "ready" },
      { id: "k2", stationId: "bar", stationName: "Բար", status: "served" },
    ]);
  });

  it("a line counts as served when its station's ticket is served", () => {
    const o = order("o1", {
      order_items: [item("a"), item("b", { station_id: "bar" })],
      kitchen_tickets: [
        { id: "k1", station_id: "kitchen", kind: "order", status: "served" },
        { id: "k2", station_id: "bar", kind: "order", status: "cooking" },
      ],
    });
    const t = byId(buildFloor(rows({ sessions: [session("s1", "t1", [o])] }), "hy", T0), "t1");
    expect(t.orders[0]?.lines.map((l) => l.served)).toEqual([true, false]);
  });
});

describe("closing the table", () => {
  it("is blocked while a QR order waits for acceptance", () => {
    const t = byId(buildFloor(rows({ sessions: [session("s1", "t1", [order("o1", { status: "placed", kitchen_tickets: [] })])] }), "hy", T0), "t1");
    expect(closeBlocker(t)).toBe("pending");
    const ok = byId(buildFloor(rows({ sessions: [session("s1", "t1", [order("o1")])] }), "hy", T0), "t1");
    expect(closeBlocker(ok)).toBeNull();
  });

  it("cash or card pays the total; split must add up exactly", () => {
    expect(settlement({ mode: "cash", cash: "", card: "" }, 9800)).toEqual({ ok: true, paid: 9800, payments: [{ method: "cash", amount: 9800 }] });
    expect(settlement({ mode: "card", cash: "", card: "" }, 9800).payments).toEqual([{ method: "card_terminal", amount: 9800 }]);
    expect(settlement({ mode: "split", cash: "5000", card: "4900" }, 9800)).toMatchObject({ ok: false, paid: 9900 });
    expect(settlement({ mode: "split", cash: "5 000", card: "4800" }, 9800)).toEqual({
      ok: true,
      paid: 9800,
      payments: [
        { method: "cash", amount: 5000 },
        { method: "card_terminal", amount: 4800 },
      ],
    });
    expect(settlement({ mode: null, cash: "", card: "" }, 9800).ok).toBe(false);
  });
});

describe("taps not yet confirmed", () => {
  const placed = order("o1", { status: "placed", kitchen_tickets: [] });
  const ready = order("o2", { kitchen_status: "ready", kitchen_tickets: [{ id: "k2", station_id: "kitchen", kind: "order", status: "ready" }] });
  const floor = () =>
    buildFloor(
      rows({
        sessions: [session("s1", "t1", [placed, ready])],
        requests: [{ id: "r1", table_id: "t1", table_session_id: "s1", kind: "call_waiter", status: "open", created_at: iso(0) }],
      }),
      "hy",
      T0,
    );

  it("accept, serve and «Գնում եմ» show at once, marked as waiting", () => {
    const shown = applyPending(floor().tables, [
      { action: { kind: "accept", orderId: "o1" }, waiting: true },
      { action: { kind: "serve", ticketId: "k2" }, waiting: false },
      { action: { kind: "resolve", requestId: "r1" }, waiting: true },
    ]);
    const t = shown.find((x) => x.id === "t1");
    expect(t?.call).toBeNull();
    expect(t?.orders.find((o) => o.id === "o1")).toMatchObject({ status: "accepted", pending: true });
    expect(t?.orders.find((o) => o.id === "o2")?.tickets[0]?.status).toBe("served");
    expect(t?.state).toBe("busy");
  });

  it("a rejected order leaves the total and the new-order state", () => {
    const shown = applyPending(floor().tables, [{ action: { kind: "reject", orderId: "o1", reason: "x" }, waiting: true }]);
    expect(shown.find((x) => x.id === "t1")?.state).toBe("call");
    expect(shown.find((x) => x.id === "t1")?.orders.find((o) => o.id === "o1")?.status).toBe("rejected");
  });

  it("a waiter order waiting to be sent appears as a round on its table", () => {
    const shown = applyPending(floor().tables, [
      {
        action: {
          kind: "place",
          key: "key-1",
          tableId: "t2",
          lines: [{ item_id: "i", quantity: 2, modifier_ids: [], note: null }],
          note: null,
          locale: "hy",
          preview: { lines: [{ name: { text: "Սուրճ", locale: "hy" }, quantity: 2, lineTotal: 1600 }], total: 1600 },
        },
        waiting: true,
      },
    ]);
    const t2 = shown.find((x) => x.id === "t2");
    expect(t2?.state).toBe("busy");
    expect(t2?.orders[0]).toMatchObject({ id: "key-1", source: "waiter", pending: true, total: 1600 });
  });
});

describe("floor layout", () => {
  it("uses the saved positions when every table has one", () => {
    expect(
      areaLayout([
        { pos: { x: 0, y: 0 } },
        { pos: { x: 3, y: 1 } },
      ]),
    ).toEqual({ placed: true, columns: 4, rows: 2 });
  });

  it("otherwise flows the tables in order", () => {
    expect(areaLayout([{ pos: { x: 0, y: 0 } }, { pos: null }])).toEqual({ placed: false, columns: 0, rows: 0 });
  });

  it("orders tables by sort, then by label as a number", () => {
    const floor = buildFloor(
      rows({
        tables: [
          { id: "a", label: "10", area_id: null, shape: "square", pos_x: null, pos_y: null, sort: 0 },
          { id: "b", label: "2", area_id: null, shape: "square", pos_x: null, pos_y: null, sort: 0 },
        ],
      }),
      "hy",
      T0,
    );
    expect(floor.tables.map((t) => t.label)).toEqual(["2", "10"]);
    expect(floor.areas).toEqual([{ id: null, name: null }]);
  });

  it("lists areas in order, with tables without an area last", () => {
    const floor = buildFloor(
      rows({
        tables: [
          ...rows().tables,
          { id: "x", label: "X", area_id: null, shape: "square", pos_x: null, pos_y: null, sort: 9 },
        ],
      }),
      "hy",
      T0,
    );
    expect(floor.areas).toEqual([
      { id: "hall", name: "Դահլիճ" },
      { id: "terrace", name: "Պատշգամբ" },
      { id: null, name: null },
    ]);
  });
});
