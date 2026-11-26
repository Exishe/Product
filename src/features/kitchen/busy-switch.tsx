"use client";

import { clsx } from "clsx";
import { Check, CircleAlert, Hourglass, X } from "lucide-react";
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
          "inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-[1.0625rem] font-semibold",
          on ? "bg-apricot text-ink" : "bg-basalt-3 text-slip",
        )}
      >
        <Hourglass aria-hidden="true" className="size-5 shrink-0" />
        {/* Icon only on a phone; the name stays for screen readers. */}
        <span className="max-sm:sr-only">{on ? t("on", { minutes: busy.minutes ?? 0 }) : t("button")}</span>
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="busy-title"
        // A sheet as tall as what it holds, at the top right under the Busy
        // button, on the same white as the stop list's drawer.
        className="text-slip bottom-auto mt-0 mr-0 ml-auto h-auto max-h-dvh w-[min(30rem,100vw)] max-w-none rounded-bl-[1rem] border-b border-l border-(--kds-frame) bg-white p-0 backdrop:bg-black/40"
      >
        <div className="flex flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-(--kds-frame) px-6 py-4">
            <div>
              <h2 id="busy-title" className="text-2xl font-semibold">
                {t("title")}
              </h2>
              <p className="text-slip-dim mt-1 text-[1.0625rem] leading-snug">{t("hint")}</p>
            </div>
            <button
              type="button"
              aria-label={t("close")}
              title={t("close")}
              onClick={() => dialog.current?.close()}
              className="bg-basalt-3 text-slip grid size-12 shrink-0 place-items-center rounded-full"
            >
              <X aria-hidden="true" className="size-6" />
            </button>
          </div>
          <div className="grid content-start gap-4 overflow-y-auto px-6 pt-0 pb-6">
            {on && busy.until && (
              <p className="m-0 text-lg font-semibold">
                {t("until", { time: formatTime(new Date(busy.until), timeZone) })}
              </p>
            )}
            {/* Three 64 px rows on the drawer, split by hairlines, each with a
                radio mark, the current one ticked: a list like the stop list,
                not three boxes. */}
            <ul className="m-0 grid list-none border-b border-(--kds-frame) p-0">
              {CHOICES.map((m) => {
                const current = on && busy.minutes === m;
                return (
                  <li key={m} className="border-b border-(--kds-frame) last:border-b-0">
                    <button
                      type="button"
                      disabled={pending}
                      aria-pressed={current}
                      onClick={() => void choose(m)}
                      className={clsx(
                        "-mx-3 flex min-h-16 w-[calc(100%+1.5rem)] items-center justify-between gap-3 rounded-lg px-3 text-left text-xl font-semibold disabled:opacity-60",
                        current && "bg-apricot text-ink font-bold",
                      )}
                    >
                      <span className="num">{t("minutes", { minutes: m })}</span>
                      {/* A 24 px radio mark on every row, so the three read as
                          choices before one is on; the current one is filled. */}
                      <span
                        aria-hidden="true"
                        className={clsx(
                          "grid size-6 shrink-0 place-items-center rounded-full",
                          current ? "bg-ink text-apricot" : "ring-2 ring-(--kds-edge) ring-inset",
                        )}
                      >
                        {current && <Check className="size-4" strokeWidth={3} />}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {failed && (
              <p
                role="alert"
                className="bg-late-on-dark m-0 flex items-center gap-2 rounded-xl px-3 py-2 font-semibold text-white"
              >
                <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
                {t("failed")}
              </p>
            )}
            {on && (
              <button
                type="button"
                disabled={pending}
                onClick={() => void choose(null)}
                className="border-pom-on-dark text-pom-on-dark min-h-14 w-full rounded-xl border-2 bg-white px-5 text-lg font-bold disabled:opacity-60"
              >
                {t("off")}
              </button>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
