// Which business days the dashboard shows. Dates are ISO strings (YYYY-MM-DD)
// in the location's business calendar; the database checks them again.

export type Preset = "today" | "yesterday" | "7d" | "30d";
export type Range = { preset: Preset | "custom"; from: string; to: string };

export const PRESETS: readonly Preset[] = ["today", "yesterday", "7d", "30d"];
export const MAX_DAYS = 92;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function valid(date: string | undefined): date is string {
  if (!date || !ISO.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

// Same rule as private.business_date: the local date of (now − day start).
export function businessDate(now: Date, timeZone: string, startsAt: string): string {
  const [h = 0, m = 0, s = 0] = startsAt.split(":").map(Number);
  const shifted = new Date(now.getTime() - (h * 3600 + m * 60 + s) * 1000);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(shifted);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function resolveRange(params: { range?: string; from?: string; to?: string }, today: string): Range {
  if (valid(params.from) && valid(params.to)) {
    let [from, to] = params.from <= params.to ? [params.from, params.to] : [params.to, params.from];
    if (to > today) to = today;
    if (from > to) from = to;
    if (daysBetween(from, to) >= MAX_DAYS) from = addDays(to, -(MAX_DAYS - 1));
    return { preset: "custom", from, to };
  }
  switch (params.range) {
    case "yesterday": {
      const d = addDays(today, -1);
      return { preset: "yesterday", from: d, to: d };
    }
    case "7d":
      return { preset: "7d", from: addDays(today, -6), to: today };
    case "30d":
      return { preset: "30d", from: addDays(today, -29), to: today };
    default:
      return { preset: "today", from: today, to: today };
  }
}
