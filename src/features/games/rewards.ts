// Game rewards (ADR-075), the pure part: which level a score is, what the
// database sent back, and how to word a reward. No React and no Supabase here,
// so it is cheap to test and costs the guest bundle almost nothing.

/** Points per level for each game. The games count score, not levels (only the
 *  platformer has rooms, and three of them), so "level N" is a score tier. */
export const POINTS_PER_LEVEL: Record<string, number> = {
  runner: 50,
  fighter: 100,
  merge: 200,
  slice: 30,
  platformer: 300,
};

/** The most a client may report (the database refuses more). */
export const MAX_LEVEL = 100;

export function levelFor(game: string, score: number): number {
  const step = POINTS_PER_LEVEL[game];
  if (!step || !Number.isFinite(score) || score < 0) return 1;
  return Math.min(MAX_LEVEL, 1 + Math.floor(score / step));
}

export type Lines = Partial<Record<"hy" | "ru" | "en", string>>;

export type RewardClaim = {
  id: string;
  game: string;
  level: number;
  kind: "percent" | "text";
  percent: number | null;
  text: Lines;
  status: "open" | "applied" | "dismissed";
};

export type RewardOffer = {
  on: boolean;
  kind: "percent" | "text";
  level: number;
  percent: number | null;
  text: Lines;
  /** null: any game. */
  game: string | null;
  claim: RewardClaim | null;
};

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

export function parseLines(v: unknown): Lines {
  const out: Lines = {};
  if (isRecord(v))
    for (const l of ["hy", "ru", "en"] as const) {
      const s = v[l];
      if (typeof s === "string" && s.trim()) out[l] = s;
    }
  return out;
}

export function parseClaim(v: unknown): RewardClaim | null {
  if (!isRecord(v) || typeof v.id !== "string") return null;
  const kind = v.kind === "text" ? "text" : v.kind === "percent" ? "percent" : null;
  if (!kind) return null;
  const status = v.status === "applied" || v.status === "dismissed" ? v.status : "open";
  return {
    id: v.id,
    game: typeof v.game === "string" ? v.game : "",
    level: typeof v.level === "number" ? v.level : 0,
    kind,
    percent: typeof v.percent === "number" ? v.percent : null,
    text: parseLines(v.text),
    status,
  };
}

/** What api.guest_game_reward returned; anything unexpected means "no rewards". */
export function parseOffer(v: unknown): RewardOffer | null {
  if (!isRecord(v)) return null;
  const claim = parseClaim(v.claim);
  if (v.on !== true && !claim) return null;
  const kind = v.kind === "text" ? "text" : "percent";
  const level = typeof v.level === "number" ? v.level : 0;
  if (v.on === true && (level < 2 || level > 50)) return null;
  return {
    on: v.on === true,
    kind,
    level,
    percent: typeof v.percent === "number" ? v.percent : null,
    text: parseLines(v.text),
    game: typeof v.game === "string" ? v.game : null,
    claim,
  };
}

/** Is a score in this game worth a claim right now? */
export function shouldClaim(offer: RewardOffer, game: string, score: number): boolean {
  if (!offer.on || offer.claim) return false;
  if (offer.game && offer.game !== game) return false;
  return levelFor(game, score) >= offer.level;
}

/** The text in the guest's language, else Armenian (always filled in), else any. */
export function pickText(lines: Lines, locale: string): string {
  return (lines as Record<string, string | undefined>)[locale] ?? lines.hy ?? lines.en ?? lines.ru ?? "";
}

/** "10% off" or the promo text; `percentWord` words the percent in the caller's language. */
export function rewardLine(
  r: { kind: "percent" | "text"; percent: number | null; text: Lines },
  locale: string,
  percentWord: (percent: number) => string,
): string {
  return r.kind === "percent" && r.percent !== null ? percentWord(r.percent) : pickText(r.text, locale);
}
