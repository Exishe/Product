"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

type WakeLock = { release: () => Promise<void>; released: boolean };
type WakeLockNavigator = Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLock> } };

// Browsers keep audio silent until the first tap, and tablets dim and sleep
// (R17). «Սկսել հերթափոխը» is that first tap: it unlocks the sound, plays the
// new-order beep once so the cook hears the volume, and asks for a screen wake
// lock (again whenever the screen comes back into view).
export function useShift() {
  const [on, setOn] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const lock = useRef<WakeLock | null>(null);

  const requestWakeLock = useCallback(async () => {
    const wakeLock = (navigator as WakeLockNavigator).wakeLock;
    if (!wakeLock || (lock.current && !lock.current.released)) return;
    try {
      lock.current = await wakeLock.request("screen");
    } catch {
      // Not allowed or not supported: the setup guide turns auto-lock off instead.
    }
  }, []);

  const beep = useCallback(() => {
    const ctx = audio.current;
    if (!ctx) return;
    // Two short 880 Hz tones, as in the mockup.
    for (const offset of [0, 0.18]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime + offset;
      osc.frequency.value = 880;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      osc.start(t);
      osc.stop(t + 0.16);
    }
  }, []);

  const start = useCallback(() => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctx) {
        audio.current ??= new Ctx();
        void audio.current.resume();
      }
    } catch {
      audio.current = null; // no sound on this device; the board still works
    }
    setOn(true);
    beep();
    void requestWakeLock();
  }, [beep, requestWakeLock]);

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

  // A beep only after the shift has started (the sound is unlocked by then).
  const notify = useCallback(() => {
    if (on) beep();
  }, [on, beep]);

  return { on, start, end, notify };
}

function greetingKey(hour: number): "morning" | "day" | "evening" {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "day";
  return "evening";
}

export function StartShiftOverlay({ localHour, onStart }: { localHour: number; onStart: () => void }) {
  const t = useTranslations("kitchen.shift");
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shift-greeting"
      className="fixed inset-0 z-40 grid place-items-center bg-basalt/[0.92] px-6 text-center text-slip"
    >
      <div>
        <h2 id="shift-greeting" className="mb-3 text-5xl font-bold">
          {t(greetingKey(localHour))}
        </h2>
        <p className="mx-auto mb-8 max-w-xl text-xl text-slip-dim">{t("hint")}</p>
        <button
          type="button"
          autoFocus
          onClick={onStart}
          className="min-h-[88px] rounded-sheet bg-apricot px-12 text-[1.875rem] font-bold text-ink active:translate-y-px"
        >
          {t("start")}
        </button>
      </div>
    </div>
  );
}
