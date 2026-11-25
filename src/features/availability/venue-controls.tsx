"use client";

import { clsx } from "clsx";
import { ChefHat, CirclePause, CirclePlay } from "lucide-react";
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

// Pause ordering and close the kitchen for today (ADR-068). Plain words, two
// rows: what guests see now, and the one or two things the owner can do.
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

  function run(action: () => Promise<ControlResult>, apply: (until: string | null) => void) {
    setFailed(false);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) return setFailed(true);
      apply(result.until);
    });
  }

  function pause(minutes: number | null) {
    run(
      () => pauseOrdering(minutes),
      () => {
        setNow(Date.now());
        setState((s) => ({
          ...s,
          paused: true,
          pausedUntil: minutes === null ? null : new Date(Date.now() + minutes * 60_000).toISOString(),
        }));
        setChoosing(false);
        setCustom("");
      },
    );
  }

  const row = "flex flex-col gap-3 border-staff-sep border-t pt-4 first:border-0 first:pt-0";
  const statusLine = "m-0 flex items-start gap-2 text-[1.0625rem] font-semibold";

  return (
    <div className="flex flex-col gap-4" data-testid="venue-controls">
      <div className={row} data-testid="control-pause">
        <p className={statusLine} role="status">
          {pausedNow ? (
            <CirclePause aria-hidden="true" className="text-pomegranate mt-0.5 size-5 shrink-0" />
          ) : (
            <CirclePlay aria-hidden="true" className="text-tarragon mt-0.5 size-5 shrink-0" />
          )}
          <span>
            {pausedNow
              ? state.pausedUntil
                ? t("pausedUntil", { time: time(state.pausedUntil) })
                : t("pausedNoEnd")
              : t("orderingOn")}
          </span>
        </p>
        {pausedNow ? (
          <div>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(resumeOrdering, () => setState((s) => ({ ...s, paused: false, pausedUntil: null })))
              }
              className={button("primary", "w-full sm:w-auto")}
            >
              {t("resume")}
            </button>
          </div>
        ) : choosing ? (
          <div className="flex flex-col gap-3">
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
                className={button("secondary")}
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
              <p className="text-pomegranate m-0 text-[0.9375rem] font-semibold">{t("minutesInvalid")}</p>
            )}
          </div>
        ) : (
          <div>
            <button
              type="button"
              disabled={pending}
              onClick={() => setChoosing(true)}
              className={button("secondary", "w-full sm:w-auto")}
            >
              <CirclePause aria-hidden="true" />
              {t("pauseOrdering")}
            </button>
          </div>
        )}
        {!pausedNow && !choosing && (
          <p className="text-staff-label2 m-0 text-[0.9375rem]">{t("pauseHint")}</p>
        )}
      </div>

      <div className={row} data-testid="control-kitchen">
        <p className={statusLine} role="status">
          <ChefHat
            aria-hidden="true"
            className={clsx("mt-0.5 size-5 shrink-0", closedNow ? "text-pomegranate" : "text-tarragon")}
          />
          <span>
            {closedNow && state.closedUntil
              ? t("closedUntil", { time: time(state.closedUntil) })
              : t("kitchenOpen")}
          </span>
        </p>
        {closedNow ? (
          <div>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () => setKitchenClosedToday(false),
                  () => setState((s) => ({ ...s, closedUntil: null })),
                )
              }
              className={button("primary", "w-full sm:w-auto")}
            >
              {t("reopen")}
            </button>
          </div>
        ) : confirmClose ? (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-[1.0625rem]">{t("closeConfirm")}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  run(
                    () => setKitchenClosedToday(true),
                    (until) => {
                      // The database works out the opening time.
                      setConfirmClose(false);
                      setNow(Date.now());
                      setState((s) => ({ ...s, closedUntil: until }));
                    },
                  )
                }
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
        ) : (
          <div>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmClose(true)}
              className={button("secondary", "w-full sm:w-auto")}
            >
              <ChefHat aria-hidden="true" />
              {t("closeKitchen")}
            </button>
          </div>
        )}
      </div>

      {failed && (
        <p role="alert" className="text-pomegranate m-0 text-[0.9375rem] font-semibold">
          {t("failed")}
        </p>
      )}
    </div>
  );
}
