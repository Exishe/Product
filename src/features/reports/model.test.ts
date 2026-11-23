import { describe, expect, it } from "vitest";
import { busyGrid, parseBusy, parseConversion, parseDigest, splitMinutes, type Busy } from "./model";

const busy: Busy = {
  from: "2026-11-16",
  to: "2026-11-22",
  timezone: "Asia/Yerevan",
  orders: 9,
  revenue: 9000,
  weekday_days: [2, 1, 1, 1, 1, 1, 1],
  cells: [
    { dow: 1, hour: 10, orders: 4, revenue: 4000 },
    { dow: 1, hour: 11, orders: 0, revenue: 0 },
    { dow: 1, hour: 12, orders: 2, revenue: 3000 },
    { dow: 1, hour: 13, orders: 1, revenue: 1000 },
    { dow: 2, hour: 12, orders: 2, revenue: 1000 },
  ],
  table_time: { sessions: 0, avg_minutes: null, by_weekday: [] },
};

describe("busyGrid", () => {
  it("averages a weekday's total over the days of that weekday in the period", () => {
    const g = busyGrid(busy, "orders");
    expect(g.hours).toEqual([10, 11, 12, 13]);
    expect(g.rows[0]).toEqual([2, 0, 1, 0.5]);
    expect(g.busiest).toEqual({ dow: 1, hour: 10, value: 2 });
  });
  it("switches to revenue on the same columns", () => {
    const g = busyGrid(busy, "revenue");
    expect(g.rows[0]).toEqual([2000, 0, 1500, 500]);
    expect(g.busiest?.value).toBe(2000);
  });
  it("finds the quietest hour inside the open hours only", () => {
    expect(busyGrid(busy, "orders").quietest).toEqual({ dow: 1, hour: 11, value: 0 });
  });
  it("is empty without data", () => {
    expect(busyGrid({ ...busy, cells: [] }, "orders").hours).toEqual([]);
  });
});

describe("helpers", () => {
  it("splits minutes", () => expect(splitMinutes(75)).toEqual({ hours: 1, minutes: 15 }));
  it("rejects a wrong shape", () => {
    expect(() => parseBusy({})).toThrow();
    expect(() => parseConversion({ items: 1 })).toThrow();
  });
});

describe("parseDigest", () => {
  it("reads the message of the last week", () => {
    const d = parseDigest({
      from: "2026-11-16",
      to: "2026-11-22",
      enough: true,
      findings: 3,
      text: "Weekly summary",
    });
    expect(d).toEqual({
      from: "2026-11-16",
      to: "2026-11-22",
      enough: true,
      findings: 3,
      text: "Weekly summary",
    });
  });
  it("refuses a body without text", () => {
    expect(() => parseDigest({ from: "2026-11-16", to: "2026-11-22" })).toThrow();
    expect(() => parseDigest(null)).toThrow();
  });
});
