"use client";

import { clsx } from "clsx";
import { ChevronDown, ChevronRight, Layers } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { AllDayRow } from "./board-model";

// «Ընդհանուր քանակ» (a kitchen's "all day"): one bar along the bottom of the
// board with the total of every dish still to cook in New and Cooking, biggest
// batch first, and the options under it. The dishes scroll sideways behind a
// fade and snap to a whole chip, so none looks cut. The board shows it only while there
// is something to cook. Tapping a dish outlines the tickets that
// have it; tapping it again clears that. The strip folds away, and each
// screen remembers whether it was open.

// Under a dish, its first two option groups in full; the rest is «+N», so no
// phrase is ever cut mid-word.
const SHOWN_VARIANTS = 2;

const OPEN_EVENT = "pativ-kitchen-all-day";

// Inside the breakdown an option is part of a phrase («2 առանց սոխի»), so it
// starts in lower case like the «առանց հավելման» beside it.
// A variant can be several options («Առանց սոխի, Առանց վարունգի»): each one.
const lowerFirst = (text: string, locale: string) =>
  text
    .split(", ")
    .map((part) => part.charAt(0).toLocaleLowerCase(locale) + part.slice(1))
    .join(", ");

function readOpen(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== "closed";
  } catch {
    return true;
  }
}

function subscribeOpen(cb: () => void) {
  window.addEventListener(OPEN_EVENT, cb);
  return () => window.removeEventListener(OPEN_EVENT, cb);
}

export function AllDayStrip({
  stationId,
  rows,
  selected,
  onSelect,
}: {
  stationId: string;
  rows: readonly AllDayRow[];
  selected: string | null;
  onSelect: (key: string | null) => void;
}) {
  const t = useTranslations("kitchen.allDay");
  const boardLocale = useLocale();
  const storageKey = `pativ-kitchen-all-day-${stationId}`;
  const open = useSyncExternalStore(
    subscribeOpen,
    () => readOpen(storageKey),
    () => true,
  );
  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, open ? "closed" : "open");
    } catch {
      // Private mode: stays as it is.
    }
    window.dispatchEvent(new Event(OPEN_EVENT));
    if (open) onSelect(null);
  }, [open, storageKey, onSelect]);
  const total = rows.reduce((sum, r) => sum + r.quantity, 0);

  // While dishes hide past the right edge, the edge fades and a round «>»
  // sits there: the strip says it scrolls, and a mouse can move it. Once it
  // has moved, the left edge fades too, so the dish cut there reads as "back
  // this way".
  const list = useRef<HTMLUListElement>(null);
  const [more, setMore] = useState(false);
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const check = () => {
      setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
      setMoved(el.scrollLeft > 4);
    };
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      ro.disconnect();
    };
  }, [rows, open]);

  return (
    <section
      aria-labelledby="all-day-title"
      data-testid="all-day"
      // A 56 px bar along the bottom of the board: the toggle with its name and
      // total, then the dishes, scrolling sideways behind a fade.
      className="bg-basalt-2 flex min-h-14 items-center gap-3 border-t border-(--kds-frame) py-1 pr-0 pl-4 lg:pl-6"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="all-day-list"
        onClick={toggle}
        className="bg-basalt-3 text-slip inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full pr-3 pl-4 text-[1.0625rem] font-semibold"
      >
        <Layers aria-hidden="true" className="size-5 shrink-0" />
        <span id="all-day-title" className="max-sm:sr-only">
          {t("title")}
        </span>
        <b
          data-testid="all-day-total"
          className="num bg-basalt-4 grid h-8 min-w-8 place-items-center rounded-full px-2"
        >
          {total}
        </b>
        <ChevronDown
          aria-hidden="true"
          className={clsx("size-5 shrink-0 transition-transform duration-200", !open && "rotate-180")}
        />
      </button>
      <div id="all-day-list" hidden={!open} className="relative min-w-0 flex-1">
        {rows.length > 0 && (
          // Plain text on the bar, as on Fresh KDS: «6× Լահմաջո» with its
          // options in grey under it, split by 1 px hairlines, no boxes.
          <ul
            ref={list}
            className={clsx(
              "m-0 flex [scrollbar-width:none] snap-x list-none overflow-x-auto scroll-px-0 p-0 pr-16",
              more && !moved && "[mask-image:linear-gradient(to_right,#000_calc(100%-7rem),transparent_calc(100%-3.5rem))]",
              more && moved && "[mask-image:linear-gradient(to_right,transparent,#000_3rem,#000_calc(100%-7rem),transparent_calc(100%-3.5rem))]",
              !more && moved && "[mask-image:linear-gradient(to_right,transparent,#000_3rem)]",
            )}
          >
            {rows.map((r) => {
              const on = selected === r.key;
              return (
                <li
                  key={r.key}
                  className="flex shrink-0 snap-start items-center before:mx-1 before:h-8 before:w-px before:bg-(--kds-frame) first:before:hidden"
                >
                  <button
                    type="button"
                    aria-pressed={on}
                    data-testid="all-day-row"
                    onClick={() => onSelect(on ? null : r.key)}
                    className={clsx(
                      "grid min-h-12 grid-cols-1 content-center rounded-lg px-3 py-1 text-left whitespace-nowrap",
                      on ? "bg-slip text-white" : "text-slip",
                    )}
                  >
                    <span className="flex min-w-0 items-baseline gap-1.5 text-[1.0625rem] leading-tight font-bold">
                      <span data-testid="all-day-qty" className="num">
                        {t("quantity", { quantity: r.quantity })}
                      </span>
                      <span
                        data-testid="all-day-name"
                        lang={r.nameLocale === boardLocale ? undefined : r.nameLocale}
                        className="max-w-80 min-w-0 truncate"
                      >
                        {r.name}
                      </span>
                    </span>
                    {r.variants.length > 0 && (
                      <span
                        className={clsx(
                          "text-[0.9375rem] leading-tight font-medium",
                          on ? "text-white" : "text-slip-dim",
                        )}
                      >
                        {r.variants
                          .slice(0, SHOWN_VARIANTS)
                          .map((v) =>
                            v.text
                              ? `${v.quantity} ${lowerFirst(v.text, r.nameLocale)}`
                              : t("plain", { quantity: v.quantity }),
                          )
                          .join(" · ")}
                        {r.variants.length > SHOWN_VARIANTS && (
                          <>
                            <span aria-hidden="true" className="num font-bold">
                              {" · "}
                              {t("moreVariants", { count: r.variants.length - SHOWN_VARIANTS })}
                            </span>
                            <span className="sr-only">
                              {" "}
                              {t("moreVariantsLabel", { count: r.variants.length - SHOWN_VARIANTS })}
                            </span>
                          </>
                        )}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {more && (
          <button
            type="button"
            aria-label={t("next")}
            title={t("next")}
            onClick={() => list.current?.scrollBy({ left: list.current.clientWidth * 0.7, behavior: "smooth" })}
            className="bg-basalt-3 text-slip absolute top-1/2 right-3 grid size-11 -translate-y-1/2 place-items-center rounded-full border border-(--kds-frame) shadow-float"
          >
            <ChevronRight aria-hidden="true" className="size-6" />
          </button>
        )}
      </div>
    </section>
  );
}
