// What the guest menu watches while it is open (api.public_menu_status, ADR-068).
// The page compares the last status with the new one and reloads the menu
// only when they differ.
export type PromoLang = "hy" | "ru" | "en";
/** A live promo (ADR-070): texts by language, all optional except the Armenian title. */
export type StatusPromo = {
  id: string;
  title: Partial<Record<PromoLang, string>>;
  text: Partial<Record<PromoLang, string>>;
  badge: string | null;
};

export type MenuStatus = {
  version: number | null;
  ordering: boolean;
  paused: { until: string | null } | null;
  closed: { until: string | null } | null;
  soldOut: string[];
  hidden: string[];
  busy: number | null;
  /** Promos that are on and inside their window right now (ADR-070); empty before that migration. */
  promos: StatusPromo[];
  /** Version of the active ingredient outages (ADR-072); "" when none or before that migration. */
  outages: string;
};

type Raw = {
  version?: unknown;
  ordering?: unknown;
  paused?: { until?: unknown } | null;
  closed?: { until?: unknown } | null;
  sold_out?: unknown;
  hidden_categories?: unknown;
  kitchen_busy?: { expected_wait_minutes?: unknown } | null;
  promos?: unknown;
  outages?: unknown;
};

const ids = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").sort() : [];
const until = (v: { until?: unknown } | null | undefined) =>
  v ? { until: typeof v.until === "string" ? v.until : null } : null;

const LANGS: PromoLang[] = ["hy", "ru", "en"];
const lines = (v: unknown): Partial<Record<PromoLang, string>> => {
  const out: Partial<Record<PromoLang, string>> = {};
  if (v && typeof v === "object")
    for (const l of LANGS) {
      const s = (v as Record<string, unknown>)[l];
      if (typeof s === "string" && s.trim()) out[l] = s;
    }
  return out;
};
const promos = (v: unknown): StatusPromo[] =>
  Array.isArray(v)
    ? v.flatMap((p: unknown) => {
        const r = p && typeof p === "object" ? (p as Record<string, unknown>) : null;
        const title = lines(r?.title);
        if (!r || typeof r.id !== "string" || Object.keys(title).length === 0) return [];
        return [
          {
            id: r.id,
            title,
            text: lines(r.text),
            badge: typeof r.badge === "string" && r.badge.trim() ? r.badge : null,
          },
        ];
      })
    : [];

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
    promos: promos(r.promos),
    outages: typeof r.outages === "string" ? r.outages : "",
  };
}

export const sameStatus = (a: MenuStatus, b: MenuStatus): boolean => JSON.stringify(a) === JSON.stringify(b);

export const POLL_MS = 10_000;
/** After an error (offline, function not deployed yet) wait longer, up to a minute. */
export const backoffMs = (failures: number): number => Math.min(POLL_MS * 2 ** Math.min(failures, 3), 60_000);
