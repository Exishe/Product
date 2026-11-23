import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, problems, sameSettings, settingsFromRow } from "./model";

describe("settingsFromRow", () => {
  it("is off with defaults when there is no row", () => {
    expect(settingsFromRow(null)).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.on).toBe(false);
  });
  it("reads a row and drops an unknown game", () => {
    const s = settingsFromRow({
      game_rewards_on: true,
      reward_kind: "text",
      reward_level: 4,
      reward_percent: null,
      reward_text: { hy: "Սուրճ", en: "" },
      reward_game: "chess",
    });
    expect(s).toMatchObject({ on: true, kind: "text", level: 4, text: { hy: "Սուրճ" }, game: null });
  });
});

describe("problems", () => {
  const ok = { ...DEFAULT_SETTINGS, on: true };
  it("accepts the defaults", () => expect(problems(ok)).toEqual([]));
  it("checks the level and percent ranges", () => {
    expect(problems({ ...ok, level: 1 })).toEqual(["level"]);
    expect(problems({ ...ok, level: 51 })).toEqual(["level"]);
    expect(problems({ ...ok, percent: 0 })).toEqual(["percent"]);
    expect(problems({ ...ok, percent: 51 })).toEqual(["percent"]);
    expect(problems({ ...ok, percent: null })).toEqual(["percent"]);
  });
  it("needs Armenian text for a text reward and caps its length", () => {
    expect(problems({ ...ok, kind: "text", text: { en: "Free coffee" } })).toEqual(["text"]);
    expect(problems({ ...ok, kind: "text", text: { hy: "Ա".repeat(81) } })).toEqual(["tooLong"]);
    expect(problems({ ...ok, kind: "text", text: { hy: "Սուրճ նվեր" } })).toEqual([]);
  });
  it("compares drafts", () => {
    expect(sameSettings(ok, { ...ok })).toBe(true);
    expect(sameSettings(ok, { ...ok, level: 6 })).toBe(false);
  });
});
