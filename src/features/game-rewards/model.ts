import { parseLines, type Lines } from "@/features/games/rewards";

// The owner's game-reward settings (ADR-072), shared by the admin page, the
// form and the server action. The same limits are enforced in Postgres.
export const LEVEL_RANGE = { min: 2, max: 50 } as const;
export const PERCENT_RANGE = { min: 1, max: 50 } as const;
export const TEXT_MAX = 80;
export const GAME_IDS = ["runner", "fighter", "merge", "slice", "platformer"] as const;
export type GameChoice = (typeof GAME_IDS)[number];

export type RewardSettings = {
  on: boolean;
  kind: "percent" | "text";
  level: number;
  percent: number | null;
  text: Lines;
  /** null: any game. */
  game: GameChoice | null;
};

export const DEFAULT_SETTINGS: RewardSettings = {
  on: false,
  kind: "percent",
  level: 5,
  percent: 10,
  text: {},
  game: null,
};

/** A row of public.game_reward_settings; no row means off, with the defaults. */
export function settingsFromRow(
  r: {
    game_rewards_on: boolean;
    reward_kind: string;
    reward_level: number;
    reward_percent: number | null;
    reward_text: unknown;
    reward_game: string | null;
  } | null,
): RewardSettings {
  if (!r) return DEFAULT_SETTINGS;
  return {
    on: r.game_rewards_on,
    kind: r.reward_kind === "text" ? "text" : "percent",
    level: r.reward_level,
    percent: r.reward_percent ?? DEFAULT_SETTINGS.percent,
    text: parseLines(r.reward_text),
    game: (GAME_IDS as readonly string[]).includes(r.reward_game ?? "") ? (r.reward_game as GameChoice) : null,
  };
}

export type Problem = "level" | "percent" | "text" | "tooLong";

/** What is wrong with the draft, as keys for the form to word. */
export function problems(s: RewardSettings): Problem[] {
  const out: Problem[] = [];
  if (!Number.isInteger(s.level) || s.level < LEVEL_RANGE.min || s.level > LEVEL_RANGE.max) out.push("level");
  if (s.kind === "percent") {
    if (s.percent === null || !Number.isInteger(s.percent) || s.percent < PERCENT_RANGE.min || s.percent > PERCENT_RANGE.max)
      out.push("percent");
  } else {
    if (!s.text.hy?.trim()) out.push("text");
    if (Object.values(s.text).some((v) => (v ?? "").trim().length > TEXT_MAX)) out.push("tooLong");
  }
  return out;
}

export const sameSettings = (a: RewardSettings, b: RewardSettings) => JSON.stringify(a) === JSON.stringify(b);
