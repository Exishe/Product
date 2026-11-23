// Promotions in the admin (ADR-070). Dates are the café's wall-clock time as
// "YYYY-MM-DDTHH:mm" (what <input type="datetime-local"> gives and what the
// database stores in promos.starts_at / ends_at); they compare as strings.
export const PROMO_LIMIT = 3;
export const LANGS = ["hy", "ru", "en"] as const;
export type Lang = (typeof LANGS)[number];
export type Lines = Partial<Record<Lang, string>>;

export type Promo = {
  id: string;
  title: Lines;
  text: Lines;
  badge: string | null;
  isOn: boolean;
  startsAt: string | null;
  endsAt: string | null;
};

const lines = (v: unknown): Lines => {
  const out: Lines = {};
  if (v && typeof v === "object")
    for (const l of LANGS) {
      const s = (v as Record<string, unknown>)[l];
      if (typeof s === "string" && s) out[l] = s;
    }
  return out;
};

/** A row of public.promos as the admin page reads it. */
export function promoFromRow(r: {
  id: string;
  title: unknown;
  body: unknown;
  badge: string | null;
  is_on: boolean;
  starts_at: string | null;
  ends_at: string | null;
}): Promo {
  return {
    id: r.id,
    title: lines(r.title),
    text: lines(r.body),
    badge: r.badge,
    isOn: r.is_on,
    startsAt: r.starts_at ? r.starts_at.slice(0, 16) : null,
    endsAt: r.ends_at ? r.ends_at.slice(0, 16) : null,
  };
}

/** The café's wall clock now, "YYYY-MM-DDTHH:mm". */
export function localNow(timeZone: string, at: number = Date.now()): string {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(at));
  const get = (type: string) => p.find((x) => x.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

/** Do guests see it now? On, and inside its window (the end is exclusive, like the database). */
export function isLiveNow(p: Pick<Promo, "isOn" | "startsAt" | "endsAt">, now: string): boolean {
  return p.isOn && (p.startsAt === null || p.startsAt <= now) && (p.endsAt === null || now < p.endsAt);
}

/** "Title" shown in lists: Armenian first, then whatever the owner wrote. */
export const titleOf = (p: Pick<Promo, "title">): string => p.title.hy ?? p.title.ru ?? p.title.en ?? "";

export const validWindow = (startsAt: string | null, endsAt: string | null): boolean =>
  startsAt === null || endsAt === null || endsAt > startsAt;
