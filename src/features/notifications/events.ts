// The alerts an owner can switch per channel; the same list as
// private.alert_events() in the database (ADR-040: order.placed is off by default).
export const ALERT_EVENTS = [
  "order.placed",
  "order.overdue",
  "station.offline",
  "order.comped",
  "day.summary",
] as const;
export type AlertEvent = (typeof ALERT_EVENTS)[number];

// Message keys can't contain dots.
export const eventKey = (e: AlertEvent): string => e.replace(".", "_");

export function telegramLink(bot: string, code: string, group = false): string {
  return `https://t.me/${bot}?${group ? "startgroup" : "start"}=${encodeURIComponent(code)}`;
}
