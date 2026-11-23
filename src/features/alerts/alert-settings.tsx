"use client";

import { useId, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { button, fieldLabel, input } from "@/features/admin-ui/styles";
import { saveAlertSettings } from "./actions";
import { CALLS_RANGE, OVERDUE_RANGE, type AlertSettings } from "./model";

const whole = (v: string): number | null => (/^\d{1,3}$/.test(v.trim()) ? Number(v.trim()) : null);

// The two limits, in plain words. Saving is one button; the fields show what is wrong.
export function AlertSettingsForm({ initial }: { initial: AlertSettings }) {
  const t = useTranslations("alerts.settings");
  const [minutes, setMinutes] = useState(String(initial.overdueMinutes));
  const [calls, setCalls] = useState(String(initial.repeatCalls));
  const [saved, setSaved] = useState<"idle" | "ok" | "failed">("idle");
  const [pending, startTransition] = useTransition();
  const minutesId = useId();
  const callsId = useId();

  const m = whole(minutes);
  const c = whole(calls);
  const minutesOk = m !== null && m >= OVERDUE_RANGE.min && m <= OVERDUE_RANGE.max;
  const callsOk = c !== null && c >= CALLS_RANGE.min && c <= CALLS_RANGE.max;
  const unchanged = m === initial.overdueMinutes && c === initial.repeatCalls;

  function save() {
    if (!minutesOk || !callsOk || m === null || c === null) return;
    setSaved("idle");
    startTransition(async () => setSaved((await saveAlertSettings(m, c)) ? "ok" : "failed"));
  }

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="alert-settings"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <label htmlFor={minutesId} className="flex flex-col gap-1.5">
        <span className={fieldLabel}>{t("minutesLabel")}</span>
        <input
          id={minutesId}
          inputMode="numeric"
          autoComplete="off"
          value={minutes}
          onChange={(e) => {
            setMinutes(e.target.value);
            setSaved("idle");
          }}
          aria-invalid={!minutesOk}
          aria-describedby={`${minutesId}-hint`}
          className={`${input} num sm:max-w-40`}
          data-testid="alert-minutes"
        />
        <span
          id={`${minutesId}-hint`}
          className={
            minutesOk
              ? "text-staff-label2 text-[0.9375rem]"
              : "text-pomegranate text-[0.9375rem] font-semibold"
          }
        >
          {t("minutesHint", { min: OVERDUE_RANGE.min, max: OVERDUE_RANGE.max })}
        </span>
      </label>
      <label htmlFor={callsId} className="flex flex-col gap-1.5">
        <span className={fieldLabel}>{t("callsLabel")}</span>
        <input
          id={callsId}
          inputMode="numeric"
          autoComplete="off"
          value={calls}
          onChange={(e) => {
            setCalls(e.target.value);
            setSaved("idle");
          }}
          aria-invalid={!callsOk}
          aria-describedby={`${callsId}-hint`}
          className={`${input} num sm:max-w-40`}
          data-testid="alert-calls"
        />
        <span
          id={`${callsId}-hint`}
          className={
            callsOk ? "text-staff-label2 text-[0.9375rem]" : "text-pomegranate text-[0.9375rem] font-semibold"
          }
        >
          {t("callsHint", { min: CALLS_RANGE.min, max: CALLS_RANGE.max })}
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || !minutesOk || !callsOk || unchanged}
          className={button("primary", "w-full sm:w-auto")}
          data-testid="alert-save"
        >
          {t("save")}
        </button>
        <p role="status" className="m-0 text-[0.9375rem] font-semibold">
          {saved === "ok" && <span className="text-tarragon">{t("saved")}</span>}
          {saved === "failed" && <span className="text-pomegranate">{t("failed")}</span>}
        </p>
      </div>
    </form>
  );
}
