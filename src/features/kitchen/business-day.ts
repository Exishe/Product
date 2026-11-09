// «Այսօր չկա» lasts for the business day, which runs until the location's
// business_day_starts (05:00 by default) in its own time zone, so the 00:20
// order still belongs to Friday (day-in-the-life.md).

const formatters = new Map<string, Intl.DateTimeFormat>();

function wallClock(instant: number, timeZone: string) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  const parts = Object.fromEntries(f.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    seconds: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second),
  };
}

// The zone's offset from UTC at an instant, in milliseconds.
function zoneOffset(instant: number, timeZone: string): number {
  const w = wallClock(instant, timeZone);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day) + w.seconds * 1000;
  return asUtc - Math.floor(instant / 1000) * 1000;
}

export function nextBusinessDayStart(now: Date, timeZone: string, startsAt: string): Date {
  const [h = 0, m = 0, s = 0] = startsAt.split(":").map(Number);
  const startSeconds = h * 3600 + m * 60 + s;
  const local = wallClock(now.getTime(), timeZone);
  const addDays = local.seconds < startSeconds ? 0 : 1;
  // The wall-clock time we want, written as if it were UTC, then shifted by the
  // zone's offset at that moment (checked twice to land right across a DST change).
  const wall = Date.UTC(local.year, local.month - 1, local.day + addDays) + startSeconds * 1000;
  let instant = wall - zoneOffset(wall, timeZone);
  instant = wall - zoneOffset(instant, timeZone);
  return new Date(instant);
}
