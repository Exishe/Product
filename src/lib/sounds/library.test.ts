import { describe, expect, it } from "vitest";
import {
  isRecording,
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

const SYNTHESIZED = SOUND_IDS.filter((id) => !isRecording(id));

describe("sound library", () => {
  it("has twenty-one sounds with unique ids that match their descriptors", () => {
    expect(SOUND_IDS).toHaveLength(21);
    expect(new Set(SOUND_IDS).size).toBe(SOUND_IDS.length);
    for (const id of SOUND_IDS) expect(SOUNDS[id].id).toBe(id);
  });

  it.each(SYNTHESIZED)("%s lasts 0.6 to 1.6 seconds", (id) => {
    expect(soundSeconds(id)).toBeGreaterThanOrEqual(MIN_SOUND_SECONDS);
    expect(soundSeconds(id)).toBeLessThanOrEqual(MAX_SOUND_SECONDS);
  });

  it.each(SYNTHESIZED)("%s stays between 200 and 4000 Hz and at sensible levels", (id) => {
    for (const voice of SOUNDS[id].voices) {
      expect(voice.freq).toBeGreaterThanOrEqual(MIN_HZ);
      expect(voice.freq).toBeLessThanOrEqual(MAX_HZ);
      expect(voice.gain).toBeGreaterThan(0);
      expect(voice.gain).toBeLessThanOrEqual(0.6);
      expect(voice.dur).toBeGreaterThan(0);
      expect(voice.at).toBeGreaterThanOrEqual(0);
      if (voice.to !== undefined) {
        expect(voice.to).toBeGreaterThanOrEqual(MIN_HZ);
        expect(voice.to).toBeLessThanOrEqual(MAX_HZ);
      }
    }
  });

  it("has one recording: the owner's alarm clock, a short file served from /sounds/", () => {
    expect(SOUND_IDS.filter(isRecording)).toEqual(["alarmclock"]);
    const file = SOUNDS.alarmclock.file;
    expect(file?.src).toBe("/sounds/alarm-clock.mp3");
    expect(soundSeconds("alarmclock")).toBe(file?.seconds);
    expect(soundSeconds("alarmclock")).toBeLessThanOrEqual(3);
    expect(SOUNDS.alarmclock.loud).toBe(true);
  });

  it("has a loud set of six high synthesized sounds (2.5 kHz and up, or a sweep that reaches it)", () => {
    const loud = SYNTHESIZED.filter((id) => SOUNDS[id].loud);
    expect(loud).toEqual(["pager", "smoke", "whistle", "phone", "bikebell", "siren"]);
    for (const id of loud) {
      const top = Math.max(...SOUNDS[id].voices.map((voice) => Math.max(voice.freq, voice.to ?? 0)));
      expect(top).toBeGreaterThanOrEqual(1800);
    }
  });

  it("recognises ids and falls back for anything else", () => {
    expect(isSoundId("bell")).toBe(true);
    expect(isSoundId("foghorn")).toBe(false);
    expect(isSoundId(null)).toBe(false);
    expect(soundOr("gong", "bell")).toBe("gong");
    expect(soundOr(undefined, "doorbell")).toBe("doorbell");
    expect(soundOr("nope", "bell")).toBe("bell");
  });
});
