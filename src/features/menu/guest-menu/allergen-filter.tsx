"use client";

import { useEffect, useRef, useState } from "react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { ALLERGENS, type Allergen } from "./allergens";
import { DIET_FILTERS, type DietFilter } from "./diet-filter";
import styles from "./guest.module.css";
import { CheckIcon, CloseIcon } from "./ui";

// Filters: "show only" chips (vegetarian, spicy, new, chef's pick, contains
// nuts), then "what do you avoid?": the 14 EU allergens as toggles. Loaded on the first
// tap of the Filters button (not part of the menu's first load). A native
// <dialog>: focus stays inside, Escape closes it. The choice applies as the
// guest taps; "Done" just closes.
export function AllergenFilter({
  avoid,
  onChange,
  diet,
  onDiet,
  onClose,
}: {
  avoid: readonly Allergen[];
  onChange: (avoid: Allergen[]) => void;
  diet: readonly DietFilter[];
  onDiet: (diet: DietFilter[]) => void;
  onClose: () => void;
}) {
  const { t } = useGuestI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const [chosen, setChosen] = useState<Allergen[]>([...avoid]);
  const [shownOnly, setShownOnly] = useState<DietFilter[]>([...diet]);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    d.showModal();
    return () => {
      if (d.open) d.close();
    };
  }, []);

  const toggle = (a: Allergen) => {
    const next = ALLERGENS.filter((x) => (x === a ? !chosen.includes(x) : chosen.includes(x)));
    setChosen(next);
    onChange(next);
  };

  const toggleDiet = (f: DietFilter) => {
    const next = DIET_FILTERS.filter((x) => (x === f ? !shownOnly.includes(x) : shownOnly.includes(x)));
    setShownOnly(next);
    onDiet(next);
  };
  const chipClass =
    "rounded-pill bg-surface aria-pressed:bg-accent aria-pressed:text-on-accent inline-flex min-h-11 items-center gap-1.5 border [border-color:var(--guest-line-strong)] px-4 text-label font-semibold aria-pressed:border-transparent";

  return (
    <dialog
      ref={dialog}
      aria-labelledby="avoid-title"
      // Only a real close counts (a stale event after React's dev double mount doesn't).
      onClose={(e) => !e.currentTarget.open && onClose()}
      onClick={(e) => {
        if (e.target === dialog.current) onClose();
      }}
      className={`rounded-t-feature bg-surface text-ink md:rounded-feature md:shadow-float mx-auto mt-auto mb-0 max-h-[90dvh] w-full max-w-[600px] overflow-y-auto border-0 p-0 backdrop:bg-black/55 md:m-auto ${styles.sheet}`}
    >
      <div className="px-5 pt-5 md:px-8 md:pt-7">
        <div className="flex items-start justify-between gap-4">
          <h2 id="avoid-title" className="display-face text-[1.25rem] leading-[1.2]">
            {t("diet.filtersTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("sheet.close")}
            className="bg-chip grid size-11 flex-none place-items-center rounded-full"
          >
            <CloseIcon />
          </button>
        </div>
        <h3 className="mt-5 text-name font-semibold">{t("diet.showOnly")}</h3>
        <ul className="mt-2 flex flex-wrap gap-2" data-testid="diet-chips">
          {DIET_FILTERS.map((f) => {
            const on = shownOnly.includes(f);
            return (
              <li key={f}>
                <button type="button" aria-pressed={on} onClick={() => toggleDiet(f)} className={chipClass}>
                  {on && <CheckIcon />}
                  {t(`diet.chip.${f}`)}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-muted mt-2 text-label leading-[1.4]">{t("diet.nutsHint")}</p>
        <h3 id="avoid-heading" className="mt-6 text-name font-semibold">
          {t("diet.title")}
        </h3>
        <p className="text-muted mt-1 text-label leading-[1.4]">{t("diet.hint")}</p>
        <ul className="mt-3 flex flex-wrap gap-2">
          {ALLERGENS.map((a) => {
            const on = chosen.includes(a);
            return (
              <li key={a}>
                <button type="button" aria-pressed={on} onClick={() => toggle(a)} className={chipClass}>
                  {on && <CheckIcon />}
                  {/* The names are lower case for sentences («contains gluten»); a chip starts with a capital. */}
                  <span className="inline-block first-letter:uppercase">{t(`allergens.${a}`)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-5 text-body leading-[1.45]">
          <p className="font-semibold">{t("diet.tellWaiter")}</p>
          <p className="text-muted mt-0.5 text-meta leading-[1.45]">{t("diet.venueNote")}</p>
        </div>
        {/* Always in reach: the footer stays at the bottom while the chips scroll. */}
        <div className="bg-surface border-line sticky bottom-0 -mx-5 mt-5 flex flex-wrap gap-3 border-t px-5 pt-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] md:-mx-8 md:px-8 md:pb-6">
          <button
            type="button"
            onClick={onClose}
            className={`${styles.cta} flex min-h-14 flex-1 items-center justify-center px-6 font-semibold`}
          >
            {t("diet.done")}
          </button>
          {(chosen.length > 0 || shownOnly.length > 0) && (
            <button
              type="button"
              onClick={() => {
                setChosen([]);
                onChange([]);
                setShownOnly([]);
                onDiet([]);
              }}
              className="rounded-pill min-h-14 border [border-color:var(--guest-line-strong)] px-5 font-semibold"
            >
              {t("diet.showAll")}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
