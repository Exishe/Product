import { z } from "zod";
import { heatLevel } from "@/features/dashboard/insights-model";

// The shapes of api.item_conversion, api.busy_hours and api.upsell_report
// (migration 20261123230000_owner_reports, ADR-073).
const names = z.record(z.string(), z.string()).nullable();

export const REASONS = ["never_ordered", "low_share", "ok", "few_views"] as const;
export type Reason = (typeof REASONS)[number];

const conversionSchema = z.object({
  from: z.string(),
  to: z.string(),
  median: z.number().nullable(),
  min_views: z.number().int(),
  items: z.array(
    z.object({
      id: z.string(),
      name: names,
      views: z.number().int(),
      adds: z.number().int(),
      orders: z.number().int(),
      conversion: z.number().nullable(),
      flagged: z.boolean(),
      reason: z.object({ key: z.enum(REASONS), views: z.number().int(), orders: z.number().int() }),
    }),
  ),
});
export type Conversion = z.infer<typeof conversionSchema>;
export const parseConversion = (json: unknown): Conversion => conversionSchema.parse(json);

const busySchema = z.object({
  from: z.string(),
  to: z.string(),
  timezone: z.string(),
  orders: z.number().int(),
  revenue: z.number(),
  weekday_days: z.array(z.number().int()).length(7),
  cells: z.array(
    z.object({
      dow: z.number().int(),
      hour: z.number().int(),
      orders: z.number().int(),
      revenue: z.number(),
    }),
  ),
  table_time: z.object({
    sessions: z.number().int(),
    avg_minutes: z.number().nullable(),
    by_weekday: z.array(
      z.object({ dow: z.number().int(), sessions: z.number().int(), avg_minutes: z.number() }),
    ),
  }),
});
export type Busy = z.infer<typeof busySchema>;
export const parseBusy = (json: unknown): Busy => busySchema.parse(json);

const upsellSchema = z.object({
  from: z.string(),
  to: z.string(),
  shown: z.number().int(),
  accepted: z.number().int(),
  accept_rate: z.number().nullable(),
  orders_with_suggestion: z.number().int(),
  revenue: z.number(),
  pairs: z.array(
    z.object({
      from: z.string(),
      item: z.string(),
      shown: z.number().int(),
      accepted: z.number().int(),
      from_name: names,
      item_name: names,
    }),
  ),
});
export type Upsell = z.infer<typeof upsellSchema>;
export const parseUpsell = (json: unknown): Upsell => upsellSchema.parse(json);

export type Metric = "orders" | "revenue";

export type BusyGrid = {
  hours: number[];
  /** rows[dow - 1][i]: the average per day of that weekday for hours[i]; Monday first. */
  rows: number[][];
  max: number;
  busiest: { dow: number; hour: number; value: number } | null;
  quietest: { dow: number; hour: number; value: number } | null;
};

// The grid from the first to the last hour with any orders or revenue (so
// both switches share their columns), with each weekday's total divided by
// the number of such days in the period.
export function busyGrid(busy: Busy, metric: Metric): BusyGrid {
  const empty: BusyGrid = { hours: [], rows: [], max: 0, busiest: null, quietest: null };
  const live = busy.cells.filter((c) => c.orders > 0 || c.revenue > 0);
  if (live.length === 0) return empty;
  const first = Math.min(...live.map((c) => c.hour));
  const last = Math.max(...live.map((c) => c.hour));
  const hours = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const rows = Array.from({ length: 7 }, () => hours.map(() => 0));
  for (const c of live) {
    const days = busy.weekday_days[c.dow - 1] || 1;
    const row = rows[c.dow - 1];
    if (row) row[c.hour - first] = c[metric] / days;
  }
  const value = (c: { dow: number; hour: number }) => rows[c.dow - 1]?.[c.hour - first] ?? 0;
  let busiest: BusyGrid["busiest"] = null;
  for (const c of live) {
    const v = value(c);
    if (v > 0 && (!busiest || v > busiest.value)) busiest = { dow: c.dow, hour: c.hour, value: v };
  }
  // Quiet hours only count on days the café is open: inside a weekday's first
  // and last busy hour, the one with the lowest value.
  let quietest: BusyGrid["quietest"] = null;
  rows.forEach((row, d) => {
    const open = row.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
    const start = open[0];
    const end = open[open.length - 1];
    if (open.length < 3 || start === undefined || end === undefined) return;
    for (let i = start + 1; i < end; i++) {
      const v = row[i] ?? 0;
      if (!quietest || v < quietest.value) quietest = { dow: d + 1, hour: hours[i] ?? 0, value: v };
    }
  });
  const max = busiest?.value ?? 0;
  return { hours, rows, max, busiest, quietest };
}

export { heatLevel };

export function splitMinutes(total: number): { hours: number; minutes: number } {
  const t = Math.max(0, Math.round(total));
  return { hours: Math.floor(t / 60), minutes: t % 60 };
}
