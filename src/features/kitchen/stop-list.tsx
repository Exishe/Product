"use client";

import { clsx } from "clsx";
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
          "inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-base font-semibold",
          count > 0 ? "border-pom-on-dark text-slip" : "border-basalt-3 text-slip",
        )}
      >
        {t("button")}
        {count > 0 && (
          <span data-testid="stop-list-count" className="num rounded-full bg-pom-on-dark px-2 text-sm font-bold text-ink">
            {count}
          </span>
        )}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="stop-list-title"
        className="ml-auto mr-0 mt-0 h-dvh max-h-none w-[min(30rem,100vw)] max-w-none bg-slip p-0 text-ink backdrop:bg-basalt/70"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
            <div>
              <h2 id="stop-list-title" className="text-2xl font-bold">
                {t("title")}
              </h2>
              <p className="mt-1 text-base text-muted">{t("hint")}</p>
            </div>
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className="min-h-12 shrink-0 rounded-chip border-2 border-line-strong px-4 font-bold"
            >
              {t("close")}
            </button>
          </div>
          {failed && (
            <p role="alert" className="mx-6 mt-4 rounded-chip bg-pom-tint px-3 py-2 text-pomegranate">
              {t("failed")}
            </p>
          )}
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {sections.length === 0 && <p className="mt-6 text-lg text-muted">{t("empty")}</p>}
            {sections.map((section) => (
              <section key={section.category} className="mt-5">
                <h3 className="mb-2 text-base font-bold uppercase tracking-wide text-muted">{section.category}</h3>
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
                            "flex min-h-16 w-full items-center justify-between gap-3 rounded-chip border px-4 py-2 text-left disabled:cursor-wait",
                            out ? "border-pomegranate bg-pom-tint" : "border-line bg-white",
                          )}
                        >
                          <span
                            lang={dish.nameLocale === boardLocale ? undefined : dish.nameLocale}
                            className={clsx("min-w-0 text-xl font-semibold [overflow-wrap:anywhere]", out && "text-pomegranate")}
                          >
                            {dish.name}
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-base font-bold">
                            <span className={out ? "text-pomegranate" : "text-tarragon"}>{out ? t("soldOut") : t("available")}</span>
                            <span
                              aria-hidden="true"
                              className={clsx(
                                "relative h-8 w-14 rounded-full transition-colors",
                                out ? "bg-pomegranate" : "bg-tarragon",
                              )}
                            >
                              <span
                                className={clsx(
                                  "absolute top-1 size-6 rounded-full bg-white transition-[left]",
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
