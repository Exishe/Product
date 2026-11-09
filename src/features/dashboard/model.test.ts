import { describe, expect, it } from "vitest";
import { chartHours, deltaPercent, dishName, parseDashboard, sharePercent, toMinutes } from "./model";

const hourly = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, compare_orders: 0 }));

describe("deltaPercent", () => {
  it("is the change against the comparison, rounded", () => {
    expect(deltaPercent(12600, 5000)).toBe(152);
    expect(deltaPercent(900, 1000)).toBe(-10);
  });
  it("has no percentage when there was nothing to compare with", () => {
    expect(deltaPercent(100, 0)).toBeNull();
  });
});

describe("sharePercent", () => {
  it("rounds to whole percent", () => {
    expect(sharePercent(2, 3)).toBe(67);
  });
  it("is null with no orders", () => {
    expect(sharePercent(0, 0)).toBeNull();
  });
});

describe("chartHours", () => {
  it("is empty on a day without orders", () => {
    expect(chartHours(hourly)).toEqual([]);
  });

  it("spans the first to the last hour with orders in either series, at least 6 hours", () => {
    const h = hourly.map((x) =>
      x.hour === 10 ? { ...x, orders: 2 } : x.hour === 12 ? { ...x, compare_orders: 1 } : x,
    );
    expect(chartHours(h).map((x) => x.hour)).toEqual([8, 9, 10, 11, 12, 13]);
  });

  it("keeps a long day as it is", () => {
    const h = hourly.map((x) => (x.hour === 8 || x.hour === 23 ? { ...x, orders: 1 } : x));
    expect(chartHours(h).map((x) => x.hour)).toEqual([
      8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
    ]);
  });

  it("does not run past midnight when padding", () => {
    const h = hourly.map((x) => (x.hour === 23 ? { ...x, orders: 1 } : x));
    expect(chartHours(h).map((x) => x.hour)).toEqual([18, 19, 20, 21, 22, 23]);
  });
});

describe("dishName", () => {
  it("uses the reader's language, then Armenian, Russian, English", () => {
    expect(dishName({ hy: "Տոլմա", en: "Tolma" }, "en")).toBe("Tolma");
    expect(dishName({ hy: "Տոլմա", en: "Tolma" }, "ru")).toBe("Տոլմա");
    expect(dishName({ en: "Gata" }, "hy")).toBe("Gata");
    expect(dishName(null, "hy")).toBe("");
  });
});

describe("toMinutes", () => {
  it("rounds seconds to whole minutes", () => {
    expect(toMinutes(1110)).toBe(19);
    expect(toMinutes(20)).toBe(0);
  });
});

describe("parseDashboard", () => {
  it("reads what api.sales_dashboard returns", () => {
    const data = parseDashboard({
      from: "2026-11-13",
      to: "2026-11-13",
      today: "2026-11-13",
      partial: true,
      timezone: "Asia/Yerevan",
      shift_days: 7,
      summary: {
        revenue: 12600,
        bills: 2,
        avg_bill: 6300,
        orders: 3,
        qr_orders: 2,
        waiter_orders: 1,
        items_sold: 8,
      },
      compare: { revenue: 5000, bills: 1, avg_bill: 5000, orders: 1 },
      open_tables: { count: 1, total: 4800 },
      hourly,
      top_dishes: [{ name: { hy: "Տոլմա" }, qty: 3, revenue: 9600 }],
      weak_dishes: [{ name: { hy: "Գաթա", en: "Gata" }, qty: 0, revenue: 0 }],
      kitchen: [{ station: "Kitchen", is_default: true, tickets: 2, avg_seconds: 1110, over_limit: 1 }],
      cancellations: { items: 1, rejected_orders: 1, reasons: [{ reason: "Ուշացավ", count: 1 }] },
    });
    expect(data.summary.avg_bill).toBe(6300);
    expect(data.hourly).toHaveLength(24);
  });

  it("refuses a malformed answer", () => {
    expect(() => parseDashboard({ summary: {} })).toThrow();
  });
});
