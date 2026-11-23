// A category's daily window, as in the database (private.in_daily_window):
// [from, to), and it may span midnight (22:00 to 02:00). No window means always.
const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};

/** "08:00:00" from the database, "08:00" from an input: both become "08:00". */
export const hhmm = (time: string | null | undefined): string => (time ? time.slice(0, 5) : "");

export function inDailyWindow(nowMinutes: number, from: string | null, to: string | null): boolean {
  if (!from || !to) return true;
  const [a, b] = [toMinutes(from), toMinutes(to)];
  return a < b ? nowMinutes >= a && nowMinutes < b : nowMinutes >= a || nowMinutes < b;
}

/** Minutes since midnight on the café's wall clock. */
export function localMinutes(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return get("hour") * 60 + get("minute");
}

/** A window the form may save: both ends, and not the same time. */
export const validWindow = (from: string, to: string): boolean =>
  /^\d{2}:\d{2}$/.test(from) && /^\d{2}:\d{2}$/.test(to) && from !== to;
