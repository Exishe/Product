// A small library of notification sounds, synthesized in the browser with Web
// Audio (ADR-088): no files, no downloads, no licences. Each sound is a plain
// description (voices with a start, a pitch and a length) so it can be unit
// tested; `play` turns the description into oscillators and gain envelopes.

export const SOUND_IDS = [
  "bell",
  "chime",
  "doorbell",
  "marimba",
  "triple",
  "pop",
  "alarm",
  "gong",
  "service",
  "timer",
  "xylophone",
  "harp",
  "ship",
  "coin",
] as const;
export type SoundId = (typeof SOUND_IDS)[number];

export const DEFAULT_ORDER_SOUND: SoundId = "bell";
export const DEFAULT_CALL_SOUND: SoundId = "doorbell";

export const isSoundId = (value: unknown): value is SoundId =>
  typeof value === "string" && (SOUND_IDS as readonly string[]).includes(value);

/** A stored value, or the default when it is missing (a database without the migration) or unknown. */
export const soundOr = (value: unknown, fallback: SoundId): SoundId => (isSoundId(value) ? value : fallback);

export type Voice = {
  /** Seconds after the start of the sound. */
  at: number;
  /** Carrier frequency, Hz. */
  freq: number;
  /** Seconds from the start of this voice until it has faded out. */
  dur: number;
  /** Peak level, 0..1, before the master volume. */
  gain: number;
  wave: "sine" | "triangle";
  /** Optional simple FM: a modulator at `freq * ratio` bends the carrier by `index * freq` Hz. */
  fm?: { ratio: number; index: number };
};

export type SoundDescriptor = { id: SoundId; voices: readonly Voice[] };

export const MIN_SOUND_SECONDS = 0.6;
export const MAX_SOUND_SECONDS = 1.6;
export const MIN_HZ = 200;
export const MAX_HZ = 4000;

const v = (
  at: number,
  freq: number,
  dur: number,
  gain: number,
  wave: Voice["wave"] = "sine",
  fm?: Voice["fm"],
): Voice => ({ at, freq, dur, gain, wave, fm });

export const SOUNDS: Readonly<Record<SoundId, SoundDescriptor>> = {
  // One bright bell: FM with an inharmonic ratio, plus a quiet upper partial.
  bell: { id: "bell", voices: [v(0, 880, 1.4, 0.5, "sine", { ratio: 3.5, index: 1.6 }), v(0, 1320, 0.8, 0.18)] },
  // Two rising tones.
  chime: { id: "chime", voices: [v(0, 784, 0.55, 0.45), v(0.2, 1175, 1.0, 0.45)] },
  // Ding, then a lower dong.
  doorbell: {
    id: "doorbell",
    voices: [v(0, 988, 0.6, 0.5, "sine", { ratio: 2, index: 0.6 }), v(0.5, 740, 1.1, 0.5, "sine", { ratio: 2, index: 0.6 })],
  },
  // Three soft wooden notes going up.
  marimba: {
    id: "marimba",
    voices: [
      v(0, 659, 0.4, 0.5),
      v(0, 2636, 0.1, 0.1),
      v(0.22, 784, 0.4, 0.5),
      v(0.22, 3136, 0.1, 0.1),
      v(0.44, 988, 0.7, 0.5),
      v(0.44, 3952, 0.1, 0.1),
    ],
  },
  // Three short, round beeps.
  triple: { id: "triple", voices: [v(0, 1047, 0.15, 0.5, "triangle"), v(0.25, 1047, 0.15, 0.5, "triangle"), v(0.5, 1047, 0.2, 0.5, "triangle")] },
  // One soft drop, for a quiet room.
  pop: { id: "pop", voices: [v(0, 600, 0.6, 0.55), v(0, 1200, 0.2, 0.15)] },
  // Urgent: two tones, twice. Made for calls.
  alarm: {
    id: "alarm",
    voices: [
      v(0, 880, 0.2, 0.5, "triangle"),
      v(0.22, 1175, 0.2, 0.5, "triangle"),
      v(0.44, 880, 0.2, 0.5, "triangle"),
      v(0.66, 1175, 0.3, 0.5, "triangle"),
    ],
  },
  // A low, long bell.
  gong: { id: "gong", voices: [v(0, 262, 1.6, 0.6, "sine", { ratio: 1.41, index: 2 }), v(0, 392, 1.0, 0.25)] },
  // The bell on a restaurant counter: one bright, ringing "ding".
  service: {
    id: "service",
    voices: [v(0, 2093, 1.5, 0.45, "sine", { ratio: 2.76, index: 0.8 }), v(0, 4000, 0.3, 0.06)],
  },
  // A kitchen timer going off: quick bursts of the same short beep.
  timer: {
    id: "timer",
    voices: [0, 0.1, 0.2, 0.3, 0.5, 0.6, 0.7, 0.8].map((at) => v(at, 1400, 0.07, 0.45, "triangle")),
  },
  // Four bright notes going up.
  xylophone: {
    id: "xylophone",
    voices: [v(0, 1047, 0.3, 0.45), v(0.12, 1319, 0.3, 0.45), v(0.24, 1568, 0.3, 0.45), v(0.36, 2093, 0.6, 0.45)],
  },
  // A soft rising arpeggio.
  harp: {
    id: "harp",
    voices: [523, 659, 784, 1047, 1319, 1568].map((freq, i) => v(i * 0.07, freq, 0.8, 0.3, "triangle")),
  },
  // Two strokes of a ship's bell.
  ship: {
    id: "ship",
    voices: [
      v(0, 523, 0.9, 0.5, "sine", { ratio: 2.4, index: 1.2 }),
      v(0.35, 523, 1.1, 0.5, "sine", { ratio: 2.4, index: 1.2 }),
    ],
  },
  // A quick two-note "coin".
  coin: { id: "coin", voices: [v(0, 988, 0.08, 0.45, "triangle"), v(0.08, 1319, 0.55, 0.45, "triangle")] },
};

/** Length of a sound in seconds. */
export const soundSeconds = (id: SoundId): number =>
  Math.max(...SOUNDS[id].voices.map((voice) => voice.at + voice.dur));

export type PlayOptions = {
  /** 0..1, default 1. */
  volume?: number;
  /** Pitch multiplier, default 1 (the kitchen's high / mid / low). */
  pitch?: number;
  /** Seconds from now; default 0. */
  delay?: number;
};

const ATTACK = 0.012;
const FLOOR = 0.0001;

/**
 * Schedules a sound on a running audio context. Returns its length in
 * seconds. Never throws: a broken audio stack is silence, not a crashed screen.
 */
export function play(ctx: AudioContext, id: SoundId, options: PlayOptions = {}): number {
  const descriptor = SOUNDS[id];
  const volume = Math.min(1, Math.max(0, options.volume ?? 1));
  const pitch = options.pitch && options.pitch > 0 ? options.pitch : 1;
  const start = ctx.currentTime + (options.delay ?? 0);
  try {
    const master = ctx.createGain();
    master.gain.value = volume;
    // Loud in a noisy café without clipping when voices overlap.
    const limiter = ctx.createDynamicsCompressor();
    master.connect(limiter);
    limiter.connect(ctx.destination);
    for (const voice of descriptor.voices) {
      const t = start + voice.at;
      const end = t + voice.dur;
      const freq = voice.freq * pitch;
      const osc = ctx.createOscillator();
      osc.type = voice.wave;
      osc.frequency.value = freq;
      const env = ctx.createGain();
      env.gain.setValueAtTime(FLOOR, t);
      env.gain.exponentialRampToValueAtTime(voice.gain, t + ATTACK);
      env.gain.exponentialRampToValueAtTime(FLOOR, end);
      osc.connect(env);
      env.connect(master);
      if (voice.fm) {
        const mod = ctx.createOscillator();
        mod.frequency.value = freq * voice.fm.ratio;
        const depth = ctx.createGain();
        depth.gain.setValueAtTime(freq * voice.fm.index, t);
        depth.gain.exponentialRampToValueAtTime(FLOOR, end); // a bell loses its metal as it rings out
        mod.connect(depth);
        depth.connect(osc.frequency);
        mod.start(t);
        mod.stop(end + 0.02);
      }
      osc.start(t);
      osc.stop(end + 0.02);
    }
  } catch {
    // no sound on this device
  }
  return soundSeconds(id);
}

/** A running audio context for a tap handler (unlocks the sound on phones and tablets), or null. */
export function unlockedContext(existing: AudioContext | null): AudioContext | null {
  if (existing) {
    void existing.resume();
    return existing;
  }
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}
