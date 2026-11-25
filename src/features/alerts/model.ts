import { z } from "zod";

// Problem tables (ADR-071): what api.table_alerts returns, as the screens use it.
const row = z.object({
  reason: z.enum(["slow", "calls", "cant_make"]),
  id: z.string(),
  table: z.string().nullable(),
  number: z.number().nullable(),
  minutes: z.number(),
  presses: z.number().nullable(),
  /** Only on "cant_make" (ADR-081): the dish's names, and how many. */
  dish: z.record(z.string(), z.string().nullable()).nullish(),
  quantity: z.number().nullish(),
});
export type TableAlert = z.infer<typeof row>;

/** null: not a list (offline, or the function isn't in this database yet): keep what is shown. */
export function parseAlerts(data: unknown): TableAlert[] | null {
  const parsed = z.array(row).safeParse(data);
  return parsed.success ? parsed.data : null;
}

/** The dish of a "cant_make" row in the screen's language, then Armenian, Russian, English. */
export function dishName(dish: TableAlert["dish"], locale: string): string {
  for (const l of [locale, "hy", "ru", "en"]) {
    const v = dish?.[l];
    if (v?.trim()) return v.trim();
  }
  return "?";
}

export const sameAlerts = (a: TableAlert[], b: TableAlert[]): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

// Same owner limits as api.set_alert_settings.
export const OVERDUE_RANGE = { min: 5, max: 180 } as const;
export const CALLS_RANGE = { min: 2, max: 10 } as const;

export type AlertSettings = { overdueMinutes: number; repeatCalls: number };
