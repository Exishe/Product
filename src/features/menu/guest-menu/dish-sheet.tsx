"use client";

import { StarBorder } from "@/features/guest-theme/star-border";
import { useEffect, useRef, useState } from "react";
import { MAX_NOTE, MAX_QUANTITY } from "@/features/ordering/cart";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import {
  initialSelection,
  isSelectionValid,
  selectedIds,
  toggleOption,
  unitPrice,
  type Selection,
} from "./selection";
import styles from "./guest.module.css";
import { CloseIcon, MinusIcon, PlusIcon, TagChip, Txt, dishPhotoUrl } from "./ui";
import type { GuestItem } from "./view-model";

const NOTE_COUNTER_FROM = 160;

// The item sheet: options with their rules, a note for the kitchen, quantity
// and an add button with the live price. A native <dialog> gives focus
// trapping, Escape and an inert page behind it. A bottom sheet on a phone, a
// centred dialog from 768 px.
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
      className={`rounded-t-bottom-sheet bg-matsoni text-ink backdrop:bg-noir/55 mx-auto mt-auto mb-0 max-h-[88dvh] w-full max-w-[560px] overflow-hidden border-0 p-0 md:m-auto md:max-h-[86dvh] md:w-[calc(100%-4rem)] md:rounded-[20px] md:shadow-float ${styles.sheet}`}
    >
      <div className="max-h-[88dvh] overflow-y-auto overscroll-contain px-5 pt-6 md:max-h-[86dvh] md:px-8 md:pt-8">
        {item.image && (
          // eslint-disable-next-line @next/next/no-img-element -- public Storage URL, already sized webp
          <img
            src={dishPhotoUrl(item.image)}
            alt=""
            width={430}
            height={300}
            decoding="async"
            className="bg-mist -mx-5 -mt-6 mb-5 block aspect-[4/3] w-[calc(100%+2.5rem)] max-w-none object-cover md:-mx-8 md:-mt-8 md:aspect-[16/10] md:w-[calc(100%+4rem)]"
          />
        )}
        <div className="flex items-start justify-between gap-3">
          <h2 ref={title} id="dish-sheet-title" tabIndex={-1} className="min-w-0 outline-none">
            <Txt
              value={item.name}
              locale={locale}
              className="display-face block text-3xl leading-[1.1] [overflow-wrap:anywhere] md:text-[2.25rem]"
            />
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("sheet.close")}
            className="text-muted -mt-2 -mr-2 grid size-12 flex-none place-items-center rounded-full"
          >
            <CloseIcon />
          </button>
        </div>
        {item.description && (
          <Txt value={item.description} locale={locale} as="p" className="text-muted mt-2" />
        )}
        <p className="text-muted mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="num text-gold-deep text-base font-semibold">{formatAmd(item.price, locale)}</span>
          {item.portion && (
            <span>{t(`menu.units.${item.portion.unit}`, { amount: item.portion.amount })}</span>
          )}
          {item.tags.map((tag) => (
            <TagChip key={tag} tag={tag} label={t(`menu.tags.${tag}`)} />
          ))}
        </p>

        {item.groups.map((group) => {
          const chosen = selection[group.id] ?? [];
          const single = group.min === 1 && group.max === 1;
          const hint = [
            group.min > 0 ? t("sheet.required") : t("sheet.optional"),
            group.max > 1 ? t("sheet.upTo", { max: group.max }) : null,
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <fieldset key={group.id} className="mt-6 min-w-0" data-testid="option-group">
              <legend className="mb-2 flex w-full items-baseline justify-between gap-3 font-semibold">
                {group.name ? <Txt value={group.name} locale={locale} /> : <span />}
                <span
                  className={`text-sm ${group.min > 0 ? "text-pomegranate font-semibold" : "text-muted font-normal"}`}
                >
                  {hint}
                </span>
              </legend>
              {group.modifiers.map((m) => {
                const on = chosen.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className="border-line flex min-h-12 items-center gap-3 border-b has-disabled:opacity-60"
                  >
                    <input
                      type={single ? "radio" : "checkbox"}
                      name={`group-${group.id}`}
                      value={m.id}
                      checked={on}
                      disabled={!on && group.max > 1 && chosen.length >= group.max}
                      onChange={() => setSelection((s) => toggleOption(s, group, m.id))}
                      className="accent-tarragon size-[22px] flex-none"
                    />
                    <Txt value={m.name} locale={locale} className="min-w-0 flex-1" />
                    {m.delta !== 0 && (
                      <span className="num text-muted text-sm whitespace-nowrap">
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
              className="rounded-input border-line-strong min-h-[72px] resize-y border bg-white p-3 font-normal"
            />
            {note.length >= NOTE_COUNTER_FROM && (
              <span className="num text-muted justify-self-end text-sm font-normal" aria-live="polite">
                {note.length}/{MAX_NOTE}
              </span>
            )}
          </label>
        )}

        <div
          className={
            canOrder
              ? "bg-matsoni border-line sticky bottom-0 -mx-5 mt-6 border-t px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))] md:-mx-8 md:px-8 md:pb-6"
              : "pb-[calc(24px+env(safe-area-inset-bottom,0px))]"
          }
        >
          {canOrder ? (
            <div className="flex gap-3">
              <span className="border-line-strong inline-flex flex-none items-center rounded-full border bg-white">
                <button
                  type="button"
                  className="disabled:text-line-strong grid size-12 place-items-center"
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
                  className="disabled:text-line-strong grid size-12 place-items-center"
                  aria-label={t("sheet.increase")}
                  disabled={quantity >= MAX_QUANTITY}
                  onClick={() => setQuantity((q) => Math.min(MAX_QUANTITY, q + 1))}
                >
                  <PlusIcon />
                </button>
              </span>
              <StarBorder
                disabled={!valid}
                onClick={() => onAdd({ modifierIds: selectedIds(item.groups, selection), quantity, note })}
                color="var(--guest-champagne-light)"
                trailColor="var(--guest-champagne)"
                backgroundColor="var(--guest-noir)"
                textColor="var(--guest-ivory)"
                borderColor="color-mix(in srgb, var(--guest-champagne) 45%, transparent)"
                radius={999}
                glow={0.7}
                duration={5}
                className="flex min-h-14 min-w-0 flex-1 items-center justify-between gap-3 px-6 font-semibold"
              >
                <span>{t("sheet.add")}</span>
                <span className={`num whitespace-nowrap ${valid ? "text-champagne-light" : ""}`}>{formatAmd(price, locale)}</span>
              </StarBorder>
            </div>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
