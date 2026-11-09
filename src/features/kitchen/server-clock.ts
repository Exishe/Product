// Ticket timers run on the server's clock, not the tablet's (R20): a cheap
// tablet can be minutes or hours off. We ask the server for its time a few
// times and keep the answer with the shortest round trip, NTP-style.

export type ClockSample = {
  sentAt: number; // device clock when the request left
  receivedAt: number; // device clock when the answer arrived
  serverNow: number; // server clock in the answer
};

const MAX_USEFUL_ROUND_TRIP_MS = 10_000;

// Milliseconds to add to the device clock to get server time, or null when no
// sample is usable.
export function offsetFromSamples(samples: readonly ClockSample[]): number | null {
  let best: ClockSample | null = null;
  for (const s of samples) {
    const roundTrip = s.receivedAt - s.sentAt;
    if (!Number.isFinite(s.serverNow) || !Number.isFinite(roundTrip)) continue;
    if (roundTrip < 0 || roundTrip > MAX_USEFUL_ROUND_TRIP_MS) continue;
    if (!best || roundTrip < best.receivedAt - best.sentAt) best = s;
  }
  if (!best) return null;
  return Math.round(best.serverNow - (best.sentAt + best.receivedAt) / 2);
}

// The body of GET /api/time.
export function parseServerTime(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const now = (body as { now?: unknown }).now;
  return typeof now === "number" && Number.isFinite(now) && now > 0 ? now : null;
}
