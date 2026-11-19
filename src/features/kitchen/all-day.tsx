"use client";

import { clsx } from "clsx";
import { ChevronDown, Layers } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useSyncExternalStore } from "react";
import type { AllDayRow } from "./board-model";

// «Ընդհանուր քանակ» (a kitchen's "all day"): one strip under the header with
// the total of every dish still to cook in New and Cooking, biggest batch
// first, and the options under it. Tapping a dish outlines the tickets that
// have it; tapping it again clears that. The strip folds away, and each
// screen remembers whether it was open.

const OPEN_EVENT = "pativ-kitchen-all-day";

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

  return (
    <section
      aria-labelledby="all-day-title"
      data-testid="all-day"
      className="bg-basalt-2 flex min-w-0 items-start gap-3 px-4 py-2 lg:px-6"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="all-day-list"
        onClick={toggle}
        className="bg-basalt-3 text-slip inline-flex min-h-14 shrink-0 items-center gap-2 rounded-full px-4 text-lg font-semibold"
      >
        <Layers aria-hidden="true" className="size-5 shrink-0" />
        <span id="all-day-title">{t("title")}</span>
        <b
          data-testid="all-day-total"
          className="num bg-basalt-4 grid h-9 min-w-9 place-items-center rounded-full px-2"
        >
          {total}
        </b>
        <ChevronDown
          aria-hidden="true"
          className={clsx("size-5 shrink-0 transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      <div id="all-day-list" hidden={!open} className="min-w-0 flex-1">
        {rows.length === 0 ? (
          <p className="text-slip-dim m-0 flex min-h-14 items-center text-lg">{t("empty")}</p>
        ) : (
          <ul className="m-0 flex [scrollbar-color:var(--color-basalt-4)_transparent] list-none gap-2 overflow-x-auto p-0 pb-1">
            {rows.map((r) => {
              const on = selected === r.key;
              return (
                <li key={r.key} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={on}
                    data-testid="all-day-row"
                    onClick={() => onSelect(on ? null : r.key)}
                    className={clsx(
                      "grid min-h-14 max-w-80 content-center rounded-2xl px-4 py-1 text-left",
                      on ? "bg-slip text-white" : "bg-basalt-3 text-slip",
                    )}
                  >
                    <span className="flex items-baseline gap-2 text-xl leading-tight font-bold">
                      <span data-testid="all-day-qty" className="num text-2xl">
                        {t("quantity", { quantity: r.quantity })}
                      </span>
                      <span
                        data-testid="all-day-name"
                        lang={r.nameLocale === boardLocale ? undefined : r.nameLocale}
                        className="min-w-0 truncate"
                      >
                        {r.name}
                      </span>
                    </span>
                    {r.variants.length > 0 && (
                      <span
                        className={clsx(
                          "truncate text-base font-semibold",
                          on ? "text-white" : "text-slip-dim",
                        )}
                      >
                        {r.variants
                          .map((v) =>
                            v.text ? `${v.quantity} ${v.text}` : t("plain", { quantity: v.quantity }),
                          )
                          .join(" · ")}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
