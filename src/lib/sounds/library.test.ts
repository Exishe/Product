import { describe, expect, it } from "vitest";
import {
  isSoundId,
  MAX_HZ,
  MAX_SOUND_SECONDS,
  MIN_HZ,
  MIN_SOUND_SECONDS,
  SOUND_IDS,
  SOUNDS,
  soundOr,
  soundSeconds,
} from "./library";

describe("sound library", () => {
  it("has eight sounds with unique ids that match their descriptors", () => {
    expect(SOUND_IDS).toHaveLength(14);
    expect(new Set(SOUND_IDS).size).toBe(SOUND_IDS.length);
    for (const id of SOUND_IDS) expect(SOUNDS[id].id).toBe(id);
  });

  it.each(SOUND_IDS)("%s lasts 0.6 to 1.6 seconds", (id) => {
    expect(soundSeconds(id)).toBeGreaterThanOrEqual(MIN_SOUND_SECONDS);
    expect(soundSeconds(id)).toBeLessThanOrEqual(MAX_SOUND_SECONDS);
  });

  it.each(SOUND_IDS)("%s stays between 200 and 4000 Hz and at sensible levels", (id) => {
    for (const voice of SOUNDS[id].voices) {
      expect(voice.freq).toBeGreaterThanOrEqual(MIN_HZ);
      expect(voice.freq).toBeLessThanOrEqual(MAX_HZ);
      expect(voice.gain).toBeGreaterThan(0);
      expect(voice.gain).toBeLessThanOrEqual(0.6);
      expect(voice.dur).toBeGreaterThan(0);
      expect(voice.at).toBeGreaterThanOrEqual(0);
    }
  });

  it("recognises ids and falls back for anything else", () => {
    expect(isSoundId("bell")).toBe(true);
    expect(isSoundId("siren")).toBe(false);
    expect(isSoundId(null)).toBe(false);
    expect(soundOr("gong", "bell")).toBe("gong");
    expect(soundOr(undefined, "doorbell")).toBe("doorbell");
    expect(soundOr("nope", "bell")).toBe("bell");
  });
});
