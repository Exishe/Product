import type { FloorTable } from "./floor-model";

// What the waiter's screen does about guests' calls and bill requests (ADR-088).
// Pure functions only: the screen feeds in the open requests and the time, and
// gets back what is new, what to play and what the banner shows.

export type AlertRequest = {
  id: string;
  kind: "call" | "bill";
  tableId: string;
  label: string;
  at: number; // when the guest asked
};

/** A call is repeated every 20 seconds, up to 3 more times, while nobody has answered. */
export const REPEAT_MS = 20_000;
export const MAX_REPEATS = 3;
/** A bill request sounds once, a little quieter. */
export const CALL_VOLUME = 1;
export const BILL_VOLUME = 0.6;
/** How many banners are shown at once; the rest are "and N more". */
export const MAX_BANNERS = 3;

/** The requests still open on the floor, oldest first. */
export function openRequests(tables: readonly FloorTable[]): AlertRequest[] {
  const out: AlertRequest[] = [];
  for (const t of tables) {
    if (t.call) out.push({ id: t.call.id, kind: "call", tableId: t.id, label: t.label, at: t.call.at });
    if (t.bill) out.push({ id: t.bill.id, kind: "bill", tableId: t.id, label: t.label, at: t.bill.at });
  }
  return out.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
}

export type AlertTrack = {
  /** Times the sound was played for it. */
  plays: number;
  lastPlayAt: number;
  /** The waiter closed the banner: no more sound for it. */
  closed: boolean;
};
export type AlertState = Readonly<Record<string, AlertTrack>>;

export type AlertStep = {
  state: AlertState;
  /** Requests this screen has not alerted about yet (vibrate, system notification). */
  fresh: AlertRequest[];
  /** What to play now, or null. At most one sound per step. */
  play: { volume: number } | null;
};

/**
 * One look at the open requests. A request this screen has not seen is new
 * (including one already open when the page loaded); a request that is gone is
 * forgotten, so a later request is new again. Sound is only counted when the
 * audio is unlocked, so the first tap on «Sound on» still rings what is waiting.
 */
export function stepAlerts(
  state: AlertState,
  open: readonly AlertRequest[],
  now: number,
  soundOn: boolean,
): AlertStep {
  const next: Record<string, AlertTrack> = {};
  const fresh: AlertRequest[] = [];
  for (const r of open) {
    const known = state[r.id];
    if (!known) fresh.push(r);
    next[r.id] = known ?? { plays: 0, lastPlayAt: 0, closed: false };
  }

  let volume = 0;
  if (soundOn) {
    for (const r of open) {
      const track = next[r.id]!;
      if (track.closed) continue;
      const first = track.plays === 0;
      const repeat =
        r.kind === "call" &&
        track.plays >= 1 &&
        track.plays <= MAX_REPEATS &&
        now - track.lastPlayAt >= REPEAT_MS;
      if (!first && !repeat) continue;
      volume = Math.max(volume, r.kind === "call" ? CALL_VOLUME : BILL_VOLUME);
      next[r.id] = { ...track, plays: track.plays + 1, lastPlayAt: now };
    }
  }
  return { state: next, fresh, play: volume > 0 ? { volume } : null };
}

/** The waiter closed a banner. */
export function closeAlert(state: AlertState, id: string): AlertState {
  const track = state[id];
  return track ? { ...state, [id]: { ...track, closed: true } } : state;
}

/** The banners to show: newest first, at most MAX_BANNERS, and how many more there are. */
export function bannerRows(
  open: readonly AlertRequest[],
  state: AlertState,
): { shown: AlertRequest[]; more: number } {
  const visible = open.filter((r) => !state[r.id]?.closed).sort((a, b) => b.at - a.at || a.id.localeCompare(b.id));
  return { shown: visible.slice(0, MAX_BANNERS), more: Math.max(0, visible.length - MAX_BANNERS) };
}
