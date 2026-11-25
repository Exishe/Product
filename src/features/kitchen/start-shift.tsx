"use client";

import { clsx } from "clsx";
import { Power, Volume2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { play as playLibrarySound, type SoundId } from "@/lib/sounds/library";

type WakeLock = { release: () => Promise<void>; released: boolean };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLock> } };

// What the board can sound. Each event has its own shape, so a cook knows what
// arrived without looking: a new order is two short beeps, a cancellation
// falls, and an order that mentions an allergy is a fast four-beep alarm.
export type Sound = "new" | "void" | "allergy";

// Each screen picks its pitch, so a bar tablet and a hot-line tablet next to
// each other are told apart by ear. Kept on the device, per station.
export const TONES = ["high", "mid", "low"] as const;
export type Tone = (typeof TONES)[number];
const PITCH: Record<Tone, number> = { high: 1175, mid: 880, low: 587 };

// [start offset s, pitch multiplier, length s]
const PATTERN: Record<Sound, readonly (readonly [number, number, number])[]> = {
  new: [
    [0, 1, 0.15],
    [0.18, 1, 0.15],
  ],
  void: [
    [0, 1, 0.2],
    [0.24, 2 / 3, 0.32],
  ],
  allergy: [
    [0, 1, 0.11],
    [0.14, 1.26, 0.11],
    [0.28, 1, 0.11],
    [0.42, 1.26, 0.11],
  ],
};

const toneKey = (stationId: string) => `pativ-kitchen-tone-${stationId}`;
const TONE_EVENT = "pativ-kitchen-tone";

function readTone(stationId: string): Tone {
  try {
    const v = window.localStorage.getItem(toneKey(stationId));
    return (TONES as readonly string[]).includes(v ?? "") ? (v as Tone) : "mid";
  } catch {
    return "mid";
  }
}

function subscribeTone(cb: () => void) {
  window.addEventListener(TONE_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(TONE_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

// Browsers keep audio silent until the first tap, and tablets dim and sleep
// (R17). «Սկսել հերթափոխը» is that first tap: it unlocks the sound, plays the
// new-order beep once so the cook hears the volume, and asks for a screen wake
// lock (again whenever the screen comes back into view).
export function useShift(stationId: string, orderSound: SoundId | null = null) {
  const [on, setOn] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const lock = useRef<WakeLock | null>(null);
  const tone = useSyncExternalStore(
    subscribeTone,
    () => readTone(stationId),
    () => "mid" as Tone,
  );
  const toneRef = useRef(tone);
  // The café's own new-order sound (ADR-088); null before its migration: the plain beeps.
  const orderSoundRef = useRef(orderSound);
  useEffect(() => {
    toneRef.current = tone;
    orderSoundRef.current = orderSound;
  });

  const requestWakeLock = useCallback(async () => {
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!wakeLock || (lock.current && !lock.current.released)) return;
    try {
      lock.current = await wakeLock.request("screen");
    } catch {
      // Not allowed or not supported: the setup guide turns auto-lock off instead.
    }
  }, []);

  // Called from a tap, so the browser lets the sound start.
  const unlockAudio = useCallback(() => {
    try {
      const Ctx =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        audio.current ??= new Ctx();
        void audio.current.resume();
      }
    } catch {
      audio.current = null; // no sound on this device; the board still works
    }
  }, []);

  const play = useCallback((sound: Sound, pitch: Tone = toneRef.current) => {
    const ctx = audio.current;
    if (!ctx) return;
    if (sound === "new" && orderSoundRef.current) {
      // The device's high / mid / low is a pitch multiplier of the chosen sound.
      playLibrarySound(ctx, orderSoundRef.current, { pitch: PITCH[pitch] / PITCH.mid });
      return;
    }
    for (const [offset, multiplier, length] of PATTERN[sound]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + offset;
      osc.frequency.value = PITCH[pitch] * multiplier;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
      osc.start(t);
      osc.stop(t + length + 0.01);
    }
  }, []);

  const start = useCallback(() => {
    unlockAudio();
    setOn(true);
    play("new");
    void requestWakeLock();
  }, [unlockAudio, play, requestWakeLock]);

  const chooseTone = useCallback(
    (next: Tone) => {
      try {
        window.localStorage.setItem(toneKey(stationId), next);
      } catch {
        // Private mode: the choice lasts until the page reloads.
      }
      window.dispatchEvent(new Event(TONE_EVENT));
      unlockAudio();
      play("new", next); // let the cook hear it
    },
    [stationId, unlockAudio, play],
  );

  const end = useCallback(() => {
    setOn(false);
    void audio.current?.suspend();
    void lock.current?.release().catch(() => {});
    lock.current = null;
  }, []);

  useEffect(() => {
    if (!on) return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void requestWakeLock();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [on, requestWakeLock]);

  // A sound only after the shift has started (the audio is unlocked by then).
  const notify = useCallback(
    (sound: Sound) => {
      if (on) play(sound);
    },
    [on, play],
  );

  return { on, start, end, notify, tone, chooseTone };
}

function greetingKey(hour: number): "morning" | "day" | "evening" {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "day";
  return "evening";
}

export function StartShiftOverlay({
  localHour,
  tone,
  onTone,
  onStart,
}: {
  localHour: number;
  tone: Tone;
  onTone: (tone: Tone) => void;
  onStart: () => void;
}) {
  const t = useTranslations("kitchen.shift");
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shift-greeting"
      className="bg-basalt/95 text-slip fixed inset-0 z-40 grid place-items-center overflow-y-auto px-6 py-8 text-center"
    >
      <div className="grid justify-items-center">
        <h2 id="shift-greeting" className="mb-3 text-5xl font-bold">
          {t(greetingKey(localHour))}
        </h2>
        <p className="text-slip-dim mx-auto mb-8 max-w-xl text-xl">{t("hint")}</p>
        <button
          type="button"
          autoFocus
          onClick={onStart}
          className="bg-slip inline-flex min-h-[88px] items-center gap-3 rounded-2xl px-12 text-[1.875rem] font-bold text-white"
        >
          <Power aria-hidden="true" className="size-8 shrink-0" />
          {t("start")}
        </button>
        <div role="group" aria-labelledby="shift-tone" className="mt-10 grid justify-items-center gap-3">
          <span id="shift-tone" className="flex items-center gap-2 text-xl font-semibold">
            <Volume2 aria-hidden="true" className="size-6 shrink-0" />
            {t("tone")}
          </span>
          <span className="bg-basalt-4 inline-flex rounded-full p-1">
            {TONES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={tone === option}
                data-testid={`tone-${option}`}
                onClick={() => onTone(option)}
                className={clsx(
                  "min-h-14 min-w-24 rounded-full px-4 text-lg font-semibold sm:min-w-28 sm:px-5",
                  tone === option ? "bg-basalt-3 text-slip shadow-[var(--shadow-soft)]" : "text-slip-dim",
                )}
              >
                {t(`tones.${option}`)}
              </button>
            ))}
          </span>
          <p className="text-slip-dim m-0 max-w-md text-base">{t("toneHint")}</p>
        </div>
      </div>
    </div>
  );
}
