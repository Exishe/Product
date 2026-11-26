"use client";

import { clsx } from "clsx";
import { CirclePause, CirclePlay } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useId, useState, useTransition } from "react";
import { button, fieldLabel, input, textAction } from "@/features/admin-ui/styles";
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

  const row = "flex flex-col gap-3 border-staff-sep border-t pt-5 first:border-0 first:pt-0";
  const statusLine = "m-0 flex items-start gap-2 text-name";
  const segment = (on: boolean, alert = false) =>
    clsx(
      "flex min-h-11 items-center justify-center gap-2 rounded-full px-3 text-label font-semibold transition-colors duration-150 disabled:cursor-not-allowed motion-reduce:transition-none [&_svg]:size-[1.125rem] [&_svg]:shrink-0",
      on ? "text-ink bg-white shadow-sm" : "text-staff-label2",
      on && alert && "[&_svg]:text-pomegranate",
      on && !alert && "[&_svg]:text-tarragon",
    );

  return (
    <div className="flex flex-col gap-4" data-testid="venue-controls">
      <div className={row} data-testid="control-pause">
        {/* One segmented switch (ADR-093): taking orders or paused. Paused
            first asks for how long; taking orders again resumes at once. The
            switch is the state, so the only line with it is the one under it:
            until when, or what guests can do now. */}
        <div
          role="group"
          aria-label={t("segmentLabel")}
          className="bg-staff-fill grid grid-cols-2 gap-1 rounded-full p-1 sm:max-w-md"
        >
          <button
            type="button"
            aria-pressed={!pausedNow && !choosing}
            disabled={pending}
            onClick={() =>
              pausedNow
                ? run(resumeOrdering, () => setState((s) => ({ ...s, paused: false, pausedUntil: null })))
                : setChoosing(false)
            }
            className={segment(!pausedNow && !choosing)}
          >
            <CirclePlay aria-hidden="true" />
            {t("segOn")}
          </button>
          <button
            type="button"
            aria-pressed={pausedNow || choosing}
            disabled={pending}
            onClick={() => !pausedNow && setChoosing(true)}
            className={segment(pausedNow || choosing, true)}
          >
            <CirclePause aria-hidden="true" />
            {t("segPaused")}
          </button>
        </div>
        {choosing && !pausedNow && (
          <div className="flex flex-col gap-3">
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
        {!choosing && (
          <p role="status" className={clsx("m-0 text-label", pausedNow ? "text-ink font-semibold" : "text-staff-label2")}>
            {pausedNow
              ? state.pausedUntil
                ? t("pausedUntil", { time: time(state.pausedUntil) })
                : t("pausedNoEnd")
              : t("orderingOn")}
          </p>
        )}
      </div>

      <div className={row} data-testid="control-kitchen">
        {/* One row like every other row action: the state on the left (a
            dot, not a second chef's hat) and the one thing to do on the right. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className={clsx(statusLine, "min-w-0 flex-1 basis-48")} role="status">
            <span
              aria-hidden="true"
              className={clsx(
                "mt-[0.45em] size-2.5 shrink-0 rounded-full",
                closedNow ? "bg-pomegranate" : "bg-tarragon",
              )}
            />
            <span>
              {closedNow && state.closedUntil
                ? t("closedUntil", { time: time(state.closedUntil) })
                : t("kitchenOpen")}
            </span>
          </p>
          {closedNow ? (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(
                  () => setKitchenClosedToday(false),
                  () => setState((s) => ({ ...s, closedUntil: null })),
                )
              }
              className={textAction("ink", "-mr-2")}
            >
              {t("reopen")}
            </button>
          ) : (
            !confirmClose && (
              <button
                type="button"
                disabled={pending}
                onClick={() => setConfirmClose(true)}
                className={textAction("ink", "-mr-2")}
              >
                {t("closeToday")}
              </button>
            )
          )}
        </div>
        {!closedNow && confirmClose && (
          <div className="flex flex-col gap-3">
            <p className="m-0 text-name">{t("closeConfirm")}</p>
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
