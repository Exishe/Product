"use client";

import { clsx } from "clsx";
import { Ban, CircleAlert, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import type { DishSection } from "./station-dishes";

// screens.md §7, "Stop list": a side drawer with today's sold-out dishes of this
// station and a switch per dish. Guests see them greyed out at once.
export function StopList({
  sections,
  soldOut,
  onToggle,
}: {
  sections: readonly DishSection[];
  soldOut: ReadonlySet<string>;
  onToggle: (itemId: string, soldOut: boolean) => Promise<boolean>;
}) {
  const t = useTranslations("kitchen.stopList");
  const boardLocale = useLocale();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const count = sections.reduce((n, s) => n + s.dishes.filter((d) => soldOut.has(d.id)).length, 0);

  async function toggle(itemId: string) {
    setBusyItem(itemId);
    setFailed(false);
    const ok = await onToggle(itemId, !soldOut.has(itemId));
    setBusyItem(null);
    if (!ok) setFailed(true);
  }

  return (
    <>
      <button
        type="button"
        data-testid="stop-list-button"
        aria-haspopup="dialog"
        onClick={() => {
          setFailed(false);
          dialog.current?.showModal();
        }}
        className={clsx(
          "inline-flex min-h-14 items-center gap-2 rounded-full bg-basalt-3 px-5 text-lg font-semibold text-slip",
          count > 0 && "ring-2 ring-pom-on-dark",
        )}
      >
        <Ban aria-hidden="true" className="size-5 shrink-0" />
        {t("button")}
        {count > 0 && (
          <span data-testid="stop-list-count" className="num grid h-7 min-w-7 place-items-center rounded-full bg-pom-on-dark px-2 text-base font-bold text-ink">
            {count}
          </span>
        )}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="stop-list-title"
        className="mt-0 mr-0 ml-auto h-dvh max-h-none w-[min(30rem,100vw)] max-w-none border-l border-basalt-3 bg-basalt-2 p-0 text-slip backdrop:bg-black/60"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-basalt-3 px-6 py-4">
            <div>
              <h2 id="stop-list-title" className="text-2xl font-bold">
                {t("title")}
              </h2>
              <p className="mt-1 text-base text-slip-dim">{t("hint")}</p>
            </div>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="inline-flex min-h-14 shrink-0 items-center gap-2 rounded-xl bg-slip px-4 text-lg font-bold text-ink"
            >
              <X aria-hidden="true" className="size-5 shrink-0" />
              {t("close")}
            </button>
          </div>
          {failed && (
            <p role="alert" className="mx-6 mt-4 flex items-center gap-2 rounded-xl bg-late-on-dark px-3 py-2 font-semibold text-white">
              <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
              {t("failed")}
            </p>
          )}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {sections.length === 0 && <p className="mt-6 text-lg text-slip-dim">{t("empty")}</p>}
            {sections.map((section) => (
              <section key={section.category} className="mt-5">
                <h3 className="mb-2 text-base font-bold text-slip-dim">{section.category}</h3>
                <ul className="m-0 grid list-none gap-2 p-0">
                  {section.dishes.map((dish) => {
                    const out = soldOut.has(dish.id);
                    return (
                      <li key={dish.id}>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={out}
                          disabled={busyItem !== null}
                          data-testid="stop-list-dish"
                          onClick={() => void toggle(dish.id)}
                          className={clsx(
                            "flex min-h-16 w-full items-center justify-between gap-3 rounded-xl border-2 px-4 py-2 text-left disabled:cursor-wait",
                            out ? "border-pom-on-dark bg-basalt-3" : "border-transparent bg-basalt-3",
                          )}
                        >
                          <span
                            lang={dish.nameLocale === boardLocale ? undefined : dish.nameLocale}
                            className={clsx("min-w-0 text-xl font-semibold [overflow-wrap:anywhere]", out && "text-slip-dim line-through decoration-2")}
                          >
                            {dish.name}
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-base font-bold">
                            <span className={out ? "text-pom-on-dark" : "text-tarragon-on-dark"}>{out ? t("soldOut") : t("available")}</span>
                            <span
                              aria-hidden="true"
                              className={clsx(
                                "relative h-8 w-14 rounded-full transition-colors duration-150",
                                out ? "bg-late-on-dark" : "bg-tarragon",
                              )}
                            >
                              <span
                                className={clsx(
                                  "absolute top-1 size-6 rounded-full bg-white transition-[left] duration-150",
                                  out ? "left-7" : "left-1",
                                )}
                              />
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </dialog>
    </>
  );
}
