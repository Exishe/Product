"use client";

import { clsx } from "clsx";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { formatTime } from "@/lib/format/date";
import { isBusy, type BusyState } from "./board-data";

const CHOICES = [20, 30, 45] as const;

// "Kitchen busy" (ADR-033): guests see an expected wait of 20, 30 or 45
// minutes; it switches itself off after an hour.
export function BusySwitch({
  busy,
  now,
  timeZone,
  onSet,
}: {
  busy: BusyState;
  now: number;
  timeZone: string;
  onSet: (minutes: (typeof CHOICES)[number] | null) => Promise<boolean>;
}) {
  const t = useTranslations("kitchen.busy");
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const on = isBusy(busy, now);

  async function choose(minutes: (typeof CHOICES)[number] | null) {
    setPending(true);
    setFailed(false);
    const ok = await onSet(minutes);
    setPending(false);
    if (ok) dialog.current?.close();
    else setFailed(true);
  }

  return (
    <>
      <button
        type="button"
        data-testid="busy-button"
        aria-haspopup="dialog"
        onClick={() => {
          setFailed(false);
          dialog.current?.showModal();
        }}
        className={clsx(
          "min-h-11 rounded-full border px-4 text-base font-semibold",
          on ? "border-apricot bg-apricot text-ink" : "border-basalt-3 text-slip",
        )}
      >
        {on ? t("on", { minutes: busy.minutes ?? 0 }) : t("button")}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="busy-title"
        className="m-auto w-[min(34rem,calc(100vw-2rem))] rounded-sheet bg-slip p-6 text-ink backdrop:bg-basalt/70"
      >
        <h2 id="busy-title" className="text-2xl font-bold">
          {t("title")}
        </h2>
        <p className="mt-2 text-lg text-muted">{t("hint")}</p>
        {on && busy.until && (
          <p className="mt-2 text-lg font-semibold">{t("until", { time: formatTime(new Date(busy.until), timeZone) })}</p>
        )}
        <div className="mt-5 grid grid-cols-3 gap-3">
          {CHOICES.map((m) => (
            <button
              key={m}
              type="button"
              disabled={pending}
              aria-pressed={on && busy.minutes === m}
              onClick={() => void choose(m)}
              className={clsx(
                "min-h-[72px] rounded-chip border-2 text-xl font-bold disabled:opacity-60",
                on && busy.minutes === m ? "border-apricot bg-apricot text-ink" : "border-ink bg-white text-ink",
              )}
            >
              {t("minutes", { minutes: m })}
            </button>
          ))}
        </div>
        {failed && (
          <p role="alert" className="mt-4 rounded-chip bg-pom-tint px-3 py-2 text-pomegranate">
            {t("failed")}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-between gap-3">
          {on && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void choose(null)}
              className="min-h-14 rounded-chip border-2 border-pomegranate px-5 text-lg font-bold text-pomegranate disabled:opacity-60"
            >
              {t("off")}
            </button>
          )}
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="ml-auto min-h-14 rounded-chip border-2 border-line-strong px-5 text-lg font-bold"
          >
            {t("close")}
          </button>
        </div>
      </dialog>
    </>
  );
}
