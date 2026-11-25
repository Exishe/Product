"use client";

import { clsx } from "clsx";
import { X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { STATE_BADGE, StateIcon } from "./floor-map";
import type { FloorTable } from "./floor-model";
import { alertEvents, freshEvents, mergeEvents, type AlertEvent, type AlertKind } from "./live-alert-model";
import styles from "./live-alert.module.css";

const SHOW_MS = 8_000;
const MAX_ROWS = 3;

// The card's frame takes the colour of its most urgent line.
const FRAME: Record<AlertKind, string> = {
  call: "border-pomegranate",
  ready: "border-tarragon",
  new: "border-amber-text",
  bill: "border-ink",
};

// [start s, frequency Hz, length s]: a call rings three times, the rest twice.
const CHIME: Record<"urgent" | "plain", readonly (readonly [number, number, number])[]> = {
  urgent: [
    [0, 1175, 0.12],
    [0.16, 1480, 0.12],
    [0.32, 1175, 0.12],
  ],
  plain: [
    [0, 880, 0.14],
    [0.18, 1175, 0.18],
  ],
};

// The live alert of the waiter app (the pop-up with a sound that ordering
// dashboards give staff): when a guest calls, a plate is ready, a guest's order
// waits to be accepted or a bill is asked for, a card drops in at the top with
// the table and what happened, the phone chimes and buzzes. A tap on a line
// opens that table; the card goes by itself after 8 seconds. What was on the
// floor when the app opened is not announced. The browser lets sound play only
// after the first tap anywhere in the app.
export function WaiterAlert({
  tables,
  onOpen,
  kinds,
}: {
  tables: readonly FloorTable[];
  onOpen: (tableId: string) => void;
  /** Only these events; calls and bills have their own banners that ring until answered (ADR-088). */
  kinds?: readonly AlertKind[];
}) {
  const t = useTranslations("waiter.alert");
  const seen = useRef<Set<string> | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const [shown, setShown] = useState<{ id: number; events: AlertEvent[] } | null>(null);

  // Unlock the sound on the first tap, click or key. A touch counts as user
  // activation only when it ends (pointerup, touchend, click), not on pointerdown.
  useEffect(() => {
    const events = ["pointerdown", "pointerup", "touchend", "click", "keydown"] as const;
    const detach = () => {
      for (const name of events) window.removeEventListener(name, unlock);
    };
    function unlock() {
      try {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return detach();
        audio.current ??= new Ctx();
        // Once the context runs, the listeners are not needed any more.
        void Promise.resolve(audio.current.resume())
          .then(() => {
            if (audio.current?.state === "running") detach();
          })
          .catch(() => {
            // Not unlocked by this event; the next one tries again.
          });
      } catch {
        // No sound on this device; the card and the buzz still come.
        detach();
      }
    }
    for (const name of events) window.addEventListener(name, unlock, { passive: true });
    return detach;
  }, []);

  useEffect(() => {
    const events = alertEvents(tables).filter((e) => !kinds || kinds.includes(e.kind));
    if (seen.current === null) {
      seen.current = new Set(events.map((e) => e.key));
      return;
    }
    const fresh = freshEvents(events, seen.current);
    for (const e of events) seen.current.add(e.key);
    if (fresh.length === 0) return;
    // The event is external (a refetch), so the card is set from this effect. Lines
    // already on the card stay on it.
    setShown((cur) => ({ id: Date.now(), events: mergeEvents(fresh, cur?.events ?? []) }));
    play(audio.current, fresh[0]?.kind === "call" ? "urgent" : "plain");
    try {
      navigator.vibrate?.(fresh[0]?.kind === "call" ? [180, 90, 180, 90, 180] : [180, 90, 180]);
    } catch {
      // Not every browser can buzz.
    }
  }, [tables, kinds]);

  useEffect(() => {
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(null), SHOW_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);

  if (!shown) return null;
  const first = shown.events[0];
  if (!first) return null;
  const rows = shown.events.slice(0, MAX_ROWS);
  const more = shown.events.length - rows.length;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-40 grid justify-items-center px-3 pt-[calc(0.5rem+env(safe-area-inset-top,0px))]">
      <div
        key={shown.id}
        role="alert"
        data-testid="waiter-alert"
        className={clsx(
          "text-ink shadow-float pointer-events-auto relative grid w-full max-w-md overflow-hidden rounded-2xl border-[3px] bg-white",
          FRAME[first.kind],
          styles.drop,
        )}
      >
        <ul className="m-0 list-none p-0">
          {rows.map((e) => (
            <li key={e.key} className="border-staff-sep border-b last:border-b-0">
              <button
                type="button"
                data-testid="waiter-alert-row"
                data-kind={e.kind}
                onClick={() => {
                  onOpen(e.tableId);
                  setShown(null);
                }}
                className="flex min-h-16 w-full items-center gap-3 py-2 pr-14 pl-3 text-left"
              >
                <span
                  aria-hidden="true"
                  className={clsx(
                    "grid size-11 shrink-0 place-items-center rounded-full",
                    STATE_BADGE[e.kind],
                  )}
                >
                  <StateIcon state={e.kind} payment={e.payment} className="size-6" />
                </span>
                <span className="min-w-0 text-[1.0625rem] leading-snug font-semibold [overflow-wrap:anywhere]">
                  {t(e.kind, { label: e.label })}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {more > 0 && (
          <p className="text-staff-label2 bg-staff-fill m-0 px-4 py-1.5 text-[0.9375rem] font-semibold">
            {t("more", { count: more })}
          </p>
        )}
        <button
          type="button"
          aria-label={t("close")}
          onClick={() => setShown(null)}
          className="text-staff-label2 hover:bg-staff-fill absolute top-2 right-2 grid size-11 place-items-center rounded-full"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
        <span
          aria-hidden="true"
          className={clsx("bg-staff-sep absolute inset-x-0 bottom-0 h-1 origin-left", styles.timer)}
        />
      </div>
    </div>
  );
}

function play(ctx: AudioContext | null, pattern: keyof typeof CHIME) {
  if (!ctx || ctx.state !== "running") return;
  const start = ctx.currentTime + 0.02;
  for (const [at, freq, len] of CHIME[pattern]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start + at);
    gain.gain.exponentialRampToValueAtTime(0.35, start + at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + at + len);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start + at);
    osc.stop(start + at + len + 0.02);
  }
}
