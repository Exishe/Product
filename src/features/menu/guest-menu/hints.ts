// Hints from the café's own orders (api.public_menu_hints, ADR-060): dishes
// guests here order together (no longer shown: the "Goes well with" strip,
// ADR-077, carries the learned pairs), and how long a round usually takes. Both are
// optional: a café without enough orders, or a database without the
// function yet, gets none and the menu looks as before.

/** A 5-minute range in whole minutes, low <= high. */
export type WaitRange = { low: number; high: number };
export type MenuHints = { pairs: Record<string, string[]>; wait: WaitRange | null };

export const NO_HINTS: MenuHints = { pairs: {}, wait: null };
/** Shown under a dish: at most this many. */
export const MAX_PAIRS = 2;

const minutes = (x: unknown) =>
  typeof x === "number" && Number.isInteger(x) && x > 0 && x <= 180 ? x : null;

/** The function's JSON, checked: anything unexpected is left out. */
export function parseHints(raw: unknown): MenuHints {
  if (typeof raw !== "object" || raw === null) return NO_HINTS;
  const { pairs, wait } = raw as { pairs?: unknown; wait?: unknown };
  const out: Record<string, string[]> = {};
  if (typeof pairs === "object" && pairs !== null && !Array.isArray(pairs)) {
    for (const [item, others] of Object.entries(pairs)) {
      if (!Array.isArray(others)) continue;
      const ids = others.filter((o): o is string => typeof o === "string" && o !== item).slice(0, MAX_PAIRS);
      if (ids.length) out[item] = ids;
    }
  }
  let range: WaitRange | null = null;
  if (typeof wait === "object" && wait !== null) {
    const low = minutes((wait as { low?: unknown }).low);
    const high = minutes((wait as { high?: unknown }).high);
    if (low && high && high >= low) range = { low, high };
  }
  return { pairs: out, wait: range };
}

/**
 * Where a round stands against the usual wait: before the usual range ends,
 * "usual"; well past it (5 minutes after the high end), "late". Never a
 * countdown, so nothing can go negative.
 */
export function waitState(wait: WaitRange, placedAt: string, now = Date.now()): "usual" | "late" {
  const elapsed = (now - Date.parse(placedAt)) / 60_000;
  return elapsed > wait.high + 5 ? "late" : "usual";
}
