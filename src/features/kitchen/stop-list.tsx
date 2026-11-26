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
          "bg-basalt-3 text-slip inline-flex min-h-12 items-center gap-2 rounded-full px-4 text-[1.0625rem] font-semibold",
          count > 0 && "ring-pom-on-dark ring-2",
        )}
      >
        <Ban aria-hidden="true" className="size-5 shrink-0" />
        <span className="max-sm:sr-only">{t("button")}</span>
        {count > 0 && (
          <span
            data-testid="stop-list-count"
            className="num bg-pom-on-dark grid h-6 min-w-6 place-items-center rounded-full px-1.5 text-sm font-bold text-white"
          >
            {count}
          </span>
        )}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="stop-list-title"
        className="text-slip mt-0 mr-0 ml-auto h-dvh bg-white max-h-none w-[min(30rem,100vw)] max-w-none border-l border-(--kds-frame) p-0 backdrop:bg-black/40"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-(--kds-frame) px-6 py-4">
            <div>
              <h2 id="stop-list-title" className="text-2xl font-semibold">
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
          {failed && (
            <p
              role="alert"
              className="bg-late-on-dark mx-6 mt-4 flex items-center gap-2 rounded-xl px-3 py-2 font-semibold text-white"
            >
              <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
              {t("failed")}
            </p>
          )}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {sections.length === 0 && <p className="text-slip-dim mt-6 text-lg">{t("empty")}</p>}
            {/* One list on the drawer's white, split by hairlines. A dish on
                sale is the quiet default; only one that is out gets the red
                word and a red tint, so the drawer shows at a glance what is off. */}
            {sections.map((section) => (
              <section key={section.category} className="mt-6">
                <h3 className="text-slip-dim m-0 mb-1 text-[0.9375rem] font-semibold">{section.category}</h3>
                <ul className="m-0 grid list-none p-0">
                  {section.dishes.map((dish) => {
                    const out = soldOut.has(dish.id);
                    return (
                      <li key={dish.id} className="border-b border-(--kds-frame) last:border-b-0">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={out}
                          disabled={busyItem !== null}
                          data-testid="stop-list-dish"
                          onClick={() => void toggle(dish.id)}
                          className={clsx(
                            "-mx-3 flex min-h-14 w-[calc(100%+1.5rem)] items-center justify-between gap-3 px-3 py-2 text-left disabled:cursor-wait",
                            out && "bg-pom-tint",
                          )}
                        >
                          <span
                            lang={dish.nameLocale === boardLocale ? undefined : dish.nameLocale}
                            className={clsx(
                              "min-w-0 text-xl font-semibold [overflow-wrap:anywhere]",
                              out && "text-slip-dim line-through decoration-2",
                            )}
                          >
                            {dish.name}
                          </span>
                          <span className="flex shrink-0 items-center gap-3 text-base font-bold">
                            {out && <span className="text-pom-on-dark">{t("soldOut")}</span>}
                            <span
                              aria-hidden="true"
                              className={clsx(
                                "relative h-8 w-14 rounded-full transition-colors duration-150",
                                out ? "bg-late-on-dark" : "bg-white ring-2 ring-(--kds-edge) ring-inset",
                              )}
                            >
                              <span
                                className={clsx(
                                  "absolute top-1 left-1 size-6 rounded-full transition-transform duration-150 motion-reduce:transition-none",
                                  out ? "translate-x-6 bg-white" : "bg-slip-dim",
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
