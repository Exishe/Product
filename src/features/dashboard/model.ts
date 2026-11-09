import { z } from "zod";
import type { Locale } from "@/i18n/routing";

// The shape of api.sales_dashboard (migration 20261109203000_dashboard_platform).
const names = z.record(z.string(), z.string()).nullable();
const dish = z.object({ name: names, qty: z.number().int(), revenue: z.number().int() });

const schema = z.object({
  from: z.string(),
  to: z.string(),
  today: z.string(),
  partial: z.boolean(),
  timezone: z.string(),
  shift_days: z.number().int(),
  summary: z.object({
    revenue: z.number().int(),
    bills: z.number().int(),
    avg_bill: z.number().int(),
    orders: z.number().int(),
    qr_orders: z.number().int(),
    waiter_orders: z.number().int(),
    items_sold: z.number().int(),
  }),
  compare: z.object({
    revenue: z.number().int(),
    bills: z.number().int(),
    avg_bill: z.number().int(),
    orders: z.number().int(),
  }),
  open_tables: z.object({ count: z.number().int(), total: z.number().int() }),
  hourly: z
    .array(z.object({ hour: z.number().int(), orders: z.number().int(), compare_orders: z.number().int() }))
    .length(24),
  top_dishes: z.array(dish),
  weak_dishes: z.array(dish),
  kitchen: z.array(
    z.object({
      station: z.string(),
      is_default: z.boolean(),
      tickets: z.number().int(),
      avg_seconds: z.number().int(),
      over_limit: z.number().int(),
    }),
  ),
  cancellations: z.object({
    items: z.number().int(),
    rejected_orders: z.number().int(),
    reasons: z.array(z.object({ reason: z.string(), count: z.number().int() })),
  }),
});

export type Dashboard = z.infer<typeof schema>;
export type Dish = z.infer<typeof dish>;
export type HourRow = Dashboard["hourly"][number];

export function parseDashboard(json: unknown): Dashboard {
  return schema.parse(json);
}

export function deltaPercent(now: number, before: number): number | null {
  if (before === 0) return null;
  return Math.round(((now - before) / before) * 100);
}

export function sharePercent(part: number, whole: number): number | null {
  if (whole === 0) return null;
  return Math.round((part / whole) * 100);
}

const MIN_HOURS = 6;

// The hours worth drawing: first to last hour with an order in either series,
// widened to at least six hours so a quiet morning still reads as a chart.
export function chartHours(hourly: readonly HourRow[]): HourRow[] {
  const busy = hourly.filter((h) => h.orders > 0 || h.compare_orders > 0).map((h) => h.hour);
  if (busy.length === 0) return [];
  let first = Math.min(...busy);
  let last = Math.max(...busy);
  while (last - first + 1 < MIN_HOURS) {
    if (first > 0) first -= 1;
    if (last - first + 1 < MIN_HOURS && last < 23) last += 1;
  }
  return hourly.filter((h) => h.hour >= first && h.hour <= last);
}

const FALLBACK: readonly Locale[] = ["hy", "ru", "en"];

export function dishName(name: Record<string, string> | null, locale: Locale): string {
  if (!name) return "";
  for (const l of [locale, ...FALLBACK]) if (name[l]) return name[l];
  return Object.values(name)[0] ?? "";
}

// The language of the name dishName picked, for the lang attribute.
export function dishNameLocale(name: Record<string, string> | null, locale: Locale): Locale {
  return [locale, ...FALLBACK].find((l) => name?.[l]) ?? locale;
}

export function toMinutes(seconds: number): number {
  return Math.round(seconds / 60);
}
