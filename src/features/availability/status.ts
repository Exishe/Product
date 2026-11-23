// What the guest menu watches while it is open (api.public_menu_status, ADR-068).
// The page compares the last status with the new one and reloads the menu
// only when they differ.
export type MenuStatus = {
  version: number | null;
  ordering: boolean;
  paused: { until: string | null } | null;
  closed: { until: string | null } | null;
  soldOut: string[];
  hidden: string[];
  busy: number | null;
};

type Raw = {
  version?: unknown;
  ordering?: unknown;
  paused?: { until?: unknown } | null;
  closed?: { until?: unknown } | null;
  sold_out?: unknown;
  hidden_categories?: unknown;
  kitchen_busy?: { expected_wait_minutes?: unknown } | null;
};

const ids = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").sort() : [];
const until = (v: { until?: unknown } | null | undefined) =>
  v ? { until: typeof v.until === "string" ? v.until : null } : null;

/** Reads either api.public_menu_status or the same fields of api.public_menu; tolerant of missing ones. */
export function parseStatus(raw: unknown, fallbackVersion: number | null = null): MenuStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Raw;
  return {
    version: typeof r.version === "number" ? r.version : fallbackVersion,
    ordering: r.ordering !== false,
    paused: until(r.paused),
    closed: until(r.closed),
    soldOut: ids(r.sold_out),
    hidden: ids(r.hidden_categories),
    busy:
      r.kitchen_busy && typeof r.kitchen_busy.expected_wait_minutes === "number"
        ? r.kitchen_busy.expected_wait_minutes
        : r.kitchen_busy
          ? 0
          : null,
  };
}

export const sameStatus = (a: MenuStatus, b: MenuStatus): boolean => JSON.stringify(a) === JSON.stringify(b);

export const POLL_MS = 10_000;
/** After an error (offline, function not deployed yet) wait longer, up to a minute. */
export const backoffMs = (failures: number): number => Math.min(POLL_MS * 2 ** Math.min(failures, 3), 60_000);
