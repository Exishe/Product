"use client";

import { clsx } from "clsx";
import { CircleOff, CirclePause, CirclePlay } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition } from "react";
import { button, fieldLabel, input } from "@/features/admin-ui/styles";
import { formatTime } from "@/lib/format/date";
import { pauseOrdering, resumeOrdering, setKitchenClosedToday, type ControlResult } from "./actions";

export type VenueState = {
  paused: boolean;
  pausedUntil: string | null;
  closedUntil: string | null;
};

const QUICK = [10, 20, 30] as const;

type Mode = "on" | "paused" | "closed";

// Guest ordering in one control (ADR-068, ADR-094): taking orders, paused for
// a while, or closed for today, as three segments on one grey track, and one
// sentence under it that says what guests get now. Paused first asks for how
// long, closed asks once to confirm; Taking orders undoes either at once.
export function VenueControls({ initial, timeZone }: { initial: VenueState; timeZone: string }) {
  const t = useTranslations("admin.controls");
  const [state, setState] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [choosing, setChoosing] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [custom, setCustom] = useState("");
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const customId = useId();

  // A timed pause or closing ends by itself: keep the words true.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 20_000);
    return () => clearInterval(timer);
  }, []);

  const pausedNow = state.paused && (state.pausedUntil === null || Date.parse(state.pausedUntil) > now);
  const closedNow = state.closedUntil !== null && Date.parse(state.closedUntil) > now;
  const time = (iso: string) => formatTime(new Date(iso), timeZone);
  const customMinutes = /^\d{1,3}$/.test(custom.trim()) ? Number(custom.trim()) : null;
  const customOk = customMinutes !== null && customMinutes >= 1 && customMinutes <= 720;
  const mode: Mode = closedNow ? "closed" : pausedNow ? "paused" : "on";
  // The segment that looks chosen: a pending choice shows at once.
  const shown: Mode = confirmClose ? "closed" : choosing ? "paused" : mode;

  // Runs the steps in order and stops at the first one that fails.
  function run(steps: { action: () => Promise<ControlResult>; apply: (until: string | null) => void }[]) {
    setFailed(false);
    startTransition(async () => {
      for (const step of steps) {
        const result = await step.action();
        if (!result.ok) return setFailed(true);
        step.apply(result.until);
      }
    });
  }

  const reopen = {
    action: () => setKitchenClosedToday(false),
    apply: () => setState((s) => ({ ...s, closedUntil: null })),
  };
  const resume = {
    action: resumeOrdering,
    apply: () => setState((s) => ({ ...s, paused: false, pausedUntil: null })),
  };

  function takeOrders() {
    setChoosing(false);
    setConfirmClose(false);
    run([...(closedNow ? [reopen] : []), ...(pausedNow ? [resume] : [])]);
  }

  function pause(minutes: number | null) {
    run([
      {
        action: () => pauseOrdering(minutes),
        apply: () => {
          setNow(Date.now());
          setState((s) => ({
            ...s,
            paused: true,
            pausedUntil: minutes === null ? null : new Date(Date.now() + minutes * 60_000).toISOString(),
          }));
          setChoosing(false);
          setCustom("");
        },
      },
      // A pause replaces a closed kitchen: the owner chose "for a while".
      ...(closedNow ? [reopen] : []),
    ]);
  }

  function closeToday() {
    run([
      {
        action: () => setKitchenClosedToday(true),
        apply: (until) => {
          // The database works out the opening time.
          setConfirmClose(false);
          setNow(Date.now());
          setState((s) => ({ ...s, closedUntil: until }));
        },
      },
    ]);
  }

  const segments: { key: Mode; label: string; icon: typeof CirclePlay; onClick: () => void }[] = [
    { key: "on", label: t("segOn"), icon: CirclePlay, onClick: takeOrders },
    {
      key: "paused",
      label: t("segPaused"),
      icon: CirclePause,
      onClick: () => {
        setConfirmClose(false);
        if (mode !== "paused") setChoosing(true);
      },
    },
    {
      key: "closed",
      label: t("segClosed"),
      icon: CircleOff,
      onClick: () => {
        setChoosing(false);
        if (mode !== "closed") setConfirmClose(true);
      },
    },
  ];

  const status =
    mode === "closed" && state.closedUntil
      ? t("closedUntil", { time: time(state.closedUntil) })
      : mode === "paused"
        ? state.pausedUntil
          ? t("pausedUntil", { time: time(state.pausedUntil) })
          : t("pausedNoEnd")
        : t("orderingOn");

  return (
    <div className="flex flex-col gap-3" data-testid="venue-controls">
      <div className="flex flex-col gap-3" data-testid="control-pause">
        <div
          role="group"
          aria-label={t("segmentLabel")}
          className="bg-staff-fill flex gap-0.5 rounded-full p-0.5 sm:grid sm:max-w-xl sm:grid-cols-3"
        >
          {segments.map(({ key, label, icon: Icon, onClick }) => {
            const on = shown === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                disabled={pending}
                onClick={onClick}
                data-testid={`venue-${key}`}
                className={clsx(
                  "flex min-h-11 min-w-0 flex-auto items-center justify-center gap-1.5 rounded-full px-2 text-label leading-tight font-semibold whitespace-nowrap transition-colors duration-150 disabled:cursor-not-allowed motion-reduce:transition-none sm:gap-2 sm:px-3",
                  on ? "text-ink bg-white shadow-sm" : "text-staff-label2 hover:text-ink",
                )}
              >
                {/* The icons only where they fit beside the words. */}
                <Icon
                  aria-hidden="true"
                  className={clsx(
                    "hidden size-[1.125rem] shrink-0 sm:block",
                    on && (key === "on" ? "text-tarragon" : "text-pomegranate"),
                  )}
                />
                <span className="min-w-0 text-center">{label}</span>
              </button>
            );
          })}
        </div>

        {choosing && mode !== "paused" && (
          <div className="flex flex-col gap-3 pt-1">
            <p className="text-staff-label2 m-0 text-label">{t("pauseHint")}</p>
            <p className={clsx(fieldLabel, "m-0")}>{t("howLong")}</p>
            <div className="flex flex-wrap gap-2">
              {QUICK.map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={pending}
                  onClick={() => pause(m)}
                  className={button("tinted", "min-w-24 flex-1 sm:flex-none")}
                >
                  {t("minutes", { count: m })}
                </button>
              ))}
              <button
                type="button"
                disabled={pending}
                onClick={() => pause(null)}
                className={button("tinted", "flex-1 sm:flex-none")}
              >
                {t("untilResume")}
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label htmlFor={customId} className="flex min-w-32 flex-1 flex-col gap-1.5 sm:max-w-48">
                <span className={fieldLabel}>{t("otherMinutes")}</span>
                <input
                  id={customId}
                  inputMode="numeric"
                  autoComplete="off"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  aria-invalid={custom !== "" && !customOk}
                  className={clsx(input, "num")}
                />
              </label>
              <button
                type="button"
                disabled={pending || !customOk}
                onClick={() => customMinutes !== null && pause(customMinutes)}
                className={button("tinted")}
              >
                {t("pause")}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setChoosing(false)}
                className={button("plain", "min-h-11")}
              >
                {t("cancel")}
              </button>
            </div>
            {custom !== "" && !customOk && (
              <p className="text-pomegranate m-0 text-label font-semibold">{t("minutesInvalid")}</p>
            )}
          </div>
        )}

        {confirmClose && mode !== "closed" && (
          <div className="flex flex-col gap-3 pt-1" data-testid="control-kitchen">
            <p className="m-0 text-name">{t("closeConfirm")}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={closeToday}
                className={button("destructive", "flex-1 sm:flex-none")}
              >
                {t("closeYes")}
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmClose(false)}
                className={button("tinted", "flex-1 sm:flex-none")}
              >
                {t("cancel")}
              </button>
            </div>
          </div>
        )}

        {!choosing && !confirmClose && (
          <p
            role="status"
            className={clsx("m-0 text-label", mode === "on" ? "text-staff-label2" : "text-ink font-semibold")}
          >
            {status}
          </p>
        )}
      </div>

      {failed && (
        <p role="alert" className="text-pomegranate m-0 text-label font-semibold">
          {t("failed")}
        </p>
      )}
    </div>
  );
}
