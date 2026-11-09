import { YEREVAN } from "@/lib/format/date";

// "Not today" lasts until the café's business day rolls over (05:00 by
// default, locations.business_day_starts), in the café's time zone.
export function endOfBusinessDay(now: Date, startsAt = "05:00", timeZone: string = YEREVAN): Date {
  const [h, m] = startsAt.split(":").map(Number) as [number, number];
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  // Wall-clock time in the café, read as if it were UTC, gives the zone offset.
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offset = wall - Math.floor(now.getTime() / 1000) * 1000;
  let boundary = Date.UTC(get("year"), get("month") - 1, get("day"), h, m, 0);
  if (boundary <= wall) boundary += 24 * 60 * 60 * 1000;
  return new Date(boundary - offset);
}
