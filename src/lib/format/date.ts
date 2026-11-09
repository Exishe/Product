import type { Locale } from "@/i18n/routing";

// Cafés run on Yerevan time (UTC+4, no daylight saving); locations can override.
export const YEREVAN = "Asia/Yerevan";

const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string, kind: "time" | "date"): Intl.DateTimeFormat {
  const id = `${kind}:${timeZone}`;
  let f = cache.get(id);
  if (!f) {
    // en-GB data exists in every browser; we only take the numbers from it.
    f =
      kind === "time"
        ? new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        : new Intl.DateTimeFormat("en-GB", { timeZone, day: "2-digit", month: "2-digit", year: "numeric" });
    cache.set(id, f);
  }
  return f;
}

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  const found = parts.find((p) => p.type === type);
  if (!found) throw new Error(`Missing ${type} in formatted date`);
  return found.value;
}

export function formatTime(date: Date, timeZone: string = YEREVAN): string {
  const parts = formatter(timeZone, "time").formatToParts(date);
  return `${part(parts, "hour")}:${part(parts, "minute")}`;
}

export function formatDate(date: Date, locale: Locale, timeZone: string = YEREVAN): string {
  const parts = formatter(timeZone, "date").formatToParts(date);
  const day = part(parts, "day");
  const month = part(parts, "month");
  const year = part(parts, "year");
  if (locale === "en") return `${Number(day)} ${MONTHS_EN[Number(month) - 1]} ${year}`;
  return `${day}.${month}.${year}`;
}
