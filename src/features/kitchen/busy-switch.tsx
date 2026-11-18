"use client";

import { clsx } from "clsx";
import { Check, CircleAlert, Hourglass } from "lucide-react";
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
          "inline-flex min-h-14 items-center gap-2 rounded-full px-5 text-lg font-semibold",
          on ? "bg-apricot text-ink" : "bg-basalt-3 text-slip",
        )}
      >
        <Hourglass aria-hidden="true" className="size-5 shrink-0" />
        {on ? t("on", { minutes: busy.minutes ?? 0 }) : t("button")}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="busy-title"
        className="bg-basalt-2 text-slip shadow-float m-auto w-[min(34rem,calc(100vw-2rem))] rounded-2xl p-6 backdrop:bg-black/40"
      >
        <h2 id="busy-title" className="text-2xl font-bold">
          {t("title")}
        </h2>
        <p className="text-slip-dim mt-2 text-lg">{t("hint")}</p>
        {on && busy.until && (
          <p className="mt-2 text-lg font-semibold">
            {t("until", { time: formatTime(new Date(busy.until), timeZone) })}
          </p>
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
                "inline-flex min-h-[72px] items-center justify-center gap-2 rounded-xl text-xl font-bold disabled:opacity-60",
                on && busy.minutes === m ? "bg-apricot text-ink" : "bg-basalt-3 text-slip",
              )}
            >
              {on && busy.minutes === m && <Check aria-hidden="true" className="size-6 shrink-0" />}
              {t("minutes", { minutes: m })}
            </button>
          ))}
        </div>
        {failed && (
          <p
            role="alert"
            className="bg-late-on-dark mt-4 flex items-center gap-2 rounded-xl px-3 py-2 font-semibold text-white"
          >
            <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
            {t("failed")}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-between gap-3">
          {on && (
            <button
              type="button"
              disabled={pending}
              onClick={() => void choose(null)}
              className="border-pom-on-dark text-pom-on-dark min-h-14 rounded-xl border-2 px-5 text-lg font-bold disabled:opacity-60"
            >
              {t("off")}
            </button>
          )}
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="bg-slip ml-auto min-h-14 rounded-xl px-6 text-lg font-bold text-white"
          >
            {t("close")}
          </button>
        </div>
      </dialog>
    </>
  );
}
