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
  const trigger = useRef<HTMLButtonElement>(null);
  // Where the popover hangs: just under the Busy button, its right edge on
  // the button's right edge. Measured on open, so it follows the header.
  const [anchor, setAnchor] = useState({ top: 72, right: 16, left: 0, width: 0, height: 48 });
  const [open, setOpen] = useState(false);
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

  const label = (
    <>
      <Hourglass aria-hidden="true" className="size-5 shrink-0" />
      {/* Icon only on a phone; the name stays for screen readers. */}
      <span className="max-sm:sr-only">{on ? t("on", { minutes: busy.minutes ?? 0 }) : t("button")}</span>
    </>
  );

  return (
    <>
      <button
        ref={trigger}
        type="button"
        data-testid="busy-button"
        aria-haspopup="dialog"
        onClick={() => {
          setFailed(false);
          const r = trigger.current?.getBoundingClientRect();
          if (r)
            setAnchor({
              top: Math.round(r.bottom + 8),
              right: Math.max(8, Math.round(window.innerWidth - r.right)),
              left: r.left,
              width: r.width,
              height: r.height,
            });
          dialog.current?.showModal();
          setOpen(true);
        }}
        aria-expanded={open}
        className={triggerClass(on, open)}
      >
        {label}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="busy-title"
        // A popover hung under the Busy button: as tall as what it holds,
        // rounded on every corner and lifted off the board, so it reads as
        // the button's own menu, never a sheet cut off at the top. A tap on
        // the dimmed board around it closes it.
        // The dialog is the whole screen, transparent: the dimmed board, the
        // Busy button drawn again above the dim in its pressed state, and the
        // card hung under it, so the popover visibly belongs to the button.
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === e.currentTarget) dialog.current?.close();
        }}
        className="text-slip fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-transparent p-0 backdrop:bg-black/25"
      >
        <span
          aria-hidden="true"
          onClick={() => dialog.current?.close()}
          style={{ top: anchor.top - 8 - anchor.height, left: anchor.left, width: anchor.width, height: anchor.height }}
          className={clsx(triggerClass(on, true), "absolute cursor-pointer")}
        >
          {label}
        </span>
        <div
          style={{ top: anchor.top, right: anchor.right }}
          className="shadow-float absolute flex max-h-[calc(100dvh-5rem)] w-[min(28rem,calc(100vw-1rem))] flex-col overflow-hidden rounded-[1.25rem] border border-(--kds-frame) bg-white"
        >
          <div className="flex items-start justify-between gap-4 border-b border-(--kds-frame) px-6 py-4">
            <div>
              <h2 id="busy-title" className="text-2xl font-semibold [text-wrap:balance]">
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
          <div className="grid min-h-0 content-start gap-4 overflow-y-auto px-6 pt-0 pb-6">
            {on && busy.until && (
              <p className="m-0 text-lg font-semibold">
                {t("until", { time: formatTime(new Date(busy.until), timeZone) })}
              </p>
            )}
            {/* Three 64 px rows on the drawer, split by hairlines, each with a
                radio mark, the current one ticked: a list like the stop list,
                not three boxes. */}
            <ul className="m-0 grid list-none p-0">
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

// The Busy button. Open, it is pressed: the ink fill (or, while busy, the
// apricot with a white outline), lifted above the dimmed board with its popover.
function triggerClass(on: boolean, open: boolean) {
  return clsx(
    "inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-[1.0625rem] font-semibold",
    on ? "bg-apricot text-ink" : open ? "bg-slip text-basalt-3" : "bg-basalt-3 text-slip",
    open && on && "outline-2 outline-offset-2 outline-white outline-solid",
  );
}
