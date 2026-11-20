"use client";

import { useEffect, useRef, useState } from "react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { normalizeForSearch } from "@/lib/format/search";
import styles from "./guest.module.css";
import { CloseIcon, Txt } from "./ui";
import type { GuestCategory } from "./view-model";

// Every section of a long menu on one sheet (a bar list with 39 sections):
// opened from the first button of the section tabs, so any section is two
// taps away. A field narrows the list in any script («вино», "gin"); the
// section under the tabs is marked. Loaded on the first tap, like the dish
// sheet. A native <dialog>: focus stays inside, Escape closes it.
export function SectionList({
  categories,
  current,
  onPick,
  onClose,
}: {
  categories: readonly GuestCategory[];
  current: string | null;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { t, locale } = useGuestI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    d.showModal();
    // The current section in view, without moving the page behind.
    d.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "center" });
    return () => {
      if (d.open) d.close();
    };
  }, []);

  const q = normalizeForSearch(query);
  const shown = q ? categories.filter((c) => c.search.includes(q)) : categories;

  return (
    <dialog
      ref={dialog}
      aria-labelledby="sections-title"
      data-testid="section-list"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
      className={`rounded-t-feature bg-surface text-ink md:rounded-feature md:shadow-float mx-auto mt-auto mb-0 max-h-[88dvh] w-full max-w-[720px] overflow-hidden border-0 p-0 backdrop:bg-black/55 md:m-auto ${styles.sheet}`}
    >
      <div className="flex max-h-[88dvh] flex-col">
        <div className="px-5 pt-5 md:px-8 md:pt-7">
          <div className="flex items-start justify-between gap-4">
            <h2 id="sections-title" className="display-face text-[2rem] leading-[1.05]">
              {t("menu.categories")}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("sheet.close")}
              className="bg-chip grid size-12 flex-none place-items-center rounded-full"
            >
              <CloseIcon />
            </button>
          </div>
          {categories.length > 12 && (
            <>
              <label className="sr-only" htmlFor="section-search">
                {t("menu.sectionSearch")}
              </label>
              <input
                id="section-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("menu.sectionSearch")}
                autoComplete="off"
                enterKeyHint="search"
                className="bg-surface placeholder:text-muted focus:border-accent-text rounded-pill mt-4 min-h-12 w-full border [border-color:var(--guest-line-strong)] px-5"
              />
            </>
          )}
        </div>
        <ul className="mt-3 grid min-h-0 flex-1 gap-x-6 overflow-y-auto overscroll-contain px-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))] sm:grid-cols-2 md:px-8 md:pb-8">
          {shown.map((c) => (
            <li
              key={c.id}
              className="border-t [border-color:color-mix(in_srgb,var(--guest-line-strong)_35%,transparent)] first:border-t-0 sm:[&:nth-child(2)]:border-t-0"
            >
              <a
                href={`#cat-${c.id}`}
                aria-current={c.id === current ? "true" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  onPick(c.id);
                }}
                className="aria-[current=true]:text-accent-text flex min-h-12 items-baseline justify-between gap-3 py-3 aria-[current=true]:font-semibold"
              >
                {c.name ? (
                  <Txt
                    value={c.name}
                    locale={locale}
                    className="display-face min-w-0 text-[1.25rem] leading-tight break-words"
                  />
                ) : null}
                <span className="num text-muted flex-none text-sm">{c.items.length}</span>
              </a>
            </li>
          ))}
          {shown.length === 0 && (
            <li className="text-muted py-8 text-center sm:col-span-2" role="status">
              {t("menu.noSection")}
            </li>
          )}
        </ul>
      </div>
    </dialog>
  );
}
