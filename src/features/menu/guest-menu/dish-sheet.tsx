"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_NOTE, MAX_QUANTITY } from "@/features/ordering/cart";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import { initialSelection, isSelectionValid, selectedIds, toggleOption, unitPrice, type Selection } from "./selection";
import styles from "./guest.module.css";
import { CloseIcon, MinusIcon, PlusIcon, Txt } from "./ui";
import type { GuestItem } from "./view-model";

const NOTE_COUNTER_FROM = 160;

// The item sheet: options with their rules, a note for the kitchen, quantity
// and an add button with the live price. A native <dialog> gives focus
// trapping, Escape and an inert page behind it.
export function DishSheet({
  item,
  canOrder,
  onAdd,
  onClose,
}: {
  item: GuestItem;
  canOrder: boolean;
  onAdd: (add: { modifierIds: string[]; quantity: number; note: string }) => void;
  onClose: () => void;
}) {
  const { t, locale } = useGuestI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [selection, setSelection] = useState<Selection>(() => initialSelection(item.groups));
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const valid = isSelectionValid(item.groups, selection);
  const price = unitPrice(item.price, item.groups, selection) * quantity;

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    d.showModal();
    title.current?.focus();
    const root = document.documentElement;
    const previous = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = previous;
      if (d.open) d.close();
    };
  }, []);

  return (
    <dialog
      ref={dialog}
      aria-labelledby="dish-sheet-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === dialog.current) onClose(); // a tap on the backdrop
      }}
      className={`mx-auto mt-auto mb-0 max-h-[88dvh] w-full max-w-[430px] overflow-hidden rounded-t-bottom-sheet border-0 bg-matsoni p-0 text-ink backdrop:bg-ink/45 ${styles.sheet}`}
    >
      <div className="max-h-[88dvh] overflow-y-auto overscroll-contain px-4 pt-6">
        <div className="flex items-start justify-between gap-3">
          <h2 ref={title} id="dish-sheet-title" tabIndex={-1} className="min-w-0 outline-none">
            <Txt value={item.name} locale={locale} className="display-face block text-3xl leading-[1.1] [overflow-wrap:anywhere]" />
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("sheet.close")}
            className="-mt-2 -mr-2 grid size-12 flex-none place-items-center rounded-full text-muted"
          >
            <CloseIcon />
          </button>
        </div>
        {item.description && <Txt value={item.description} locale={locale} as="p" className="mt-2 text-muted" />}
        <p className="mt-1 flex flex-wrap gap-x-2 text-sm text-muted">
          <span className="num font-semibold text-ink">{formatAmd(item.price, locale)}</span>
          {item.portion && <span>{t(`menu.units.${item.portion.unit}`, { amount: item.portion.amount })}</span>}
        </p>

        {item.groups.map((group) => {
          const chosen = selection[group.id] ?? [];
          const single = group.min === 1 && group.max === 1;
          const hint = [group.min > 0 ? t("sheet.required") : t("sheet.optional"), group.max > 1 ? t("sheet.upTo", { max: group.max }) : null]
            .filter(Boolean)
            .join(", ");
          return (
            <fieldset key={group.id} className="mt-6 min-w-0" data-testid="option-group">
              <legend className="mb-2 flex w-full items-baseline justify-between gap-3 font-semibold">
                {group.name ? <Txt value={group.name} locale={locale} /> : <span />}
                <span className={`text-sm ${group.min > 0 ? "font-semibold text-pomegranate" : "font-normal text-muted"}`}>{hint}</span>
              </legend>
              {group.modifiers.map((m) => {
                const on = chosen.includes(m.id);
                return (
                  <label key={m.id} className="flex min-h-12 items-center gap-3 border-b border-line has-disabled:opacity-60">
                    <input
                      type={single ? "radio" : "checkbox"}
                      name={`group-${group.id}`}
                      value={m.id}
                      checked={on}
                      disabled={!on && group.max > 1 && chosen.length >= group.max}
                      onChange={() => setSelection((s) => toggleOption(s, group, m.id))}
                      className="size-[22px] flex-none accent-tarragon"
                    />
                    <Txt value={m.name} locale={locale} className="min-w-0 flex-1" />
                    {m.delta !== 0 && (
                      <span className="num text-sm whitespace-nowrap text-muted">
                        {m.delta > 0 ? "+" : "−"}
                        {formatAmd(Math.abs(m.delta), locale)}
                      </span>
                    )}
                  </label>
                );
              })}
            </fieldset>
          );
        })}

        {canOrder && (
          <label className="mt-6 grid gap-1.5 font-semibold" htmlFor="dish-note">
            {t("sheet.note")}
            <textarea
              id="dish-note"
              value={note}
              maxLength={MAX_NOTE}
              rows={2}
              placeholder={t("sheet.notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-[72px] resize-y rounded-input border border-line-strong bg-white p-3 font-normal"
            />
            {note.length >= NOTE_COUNTER_FROM && (
              <span className="num justify-self-end text-sm font-normal text-muted" aria-live="polite">
                {note.length}/{MAX_NOTE}
              </span>
            )}
          </label>
        )}

        <div
          className={
            canOrder
              ? "sticky bottom-0 -mx-4 mt-6 bg-matsoni px-4 pt-2 pb-[calc(16px+env(safe-area-inset-bottom,0px))]"
              : "pb-[calc(24px+env(safe-area-inset-bottom,0px))]"
          }
        >
          {canOrder ? (
            <div className="flex gap-3">
              <span className="inline-flex flex-none items-center rounded-input border border-line-strong">
                <button
                  type="button"
                  className="grid size-12 place-items-center disabled:text-line-strong"
                  aria-label={t("sheet.decrease")}
                  disabled={quantity <= 1}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  <MinusIcon />
                </button>
                <output className="num min-w-7 text-center font-semibold" aria-label={t("sheet.quantity")}>
                  {quantity}
                </output>
                <button
                  type="button"
                  className="grid size-12 place-items-center disabled:text-line-strong"
                  aria-label={t("sheet.increase")}
                  disabled={quantity >= MAX_QUANTITY}
                  onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
                >
                  <PlusIcon />
                </button>
              </span>
              <button
                type="button"
                disabled={!valid}
                onClick={() => onAdd({ modifierIds: selectedIds(item.groups, selection), quantity, note })}
                className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 rounded-sheet bg-apricot px-4 font-semibold text-ink disabled:bg-mist disabled:text-muted"
              >
                <span>{t("sheet.add")}</span>
                <span className="num whitespace-nowrap">{formatAmd(price, locale)}</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
