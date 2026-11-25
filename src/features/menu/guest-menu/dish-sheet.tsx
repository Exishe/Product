"use client";

import { flyToCart } from "@/features/guest-theme/motion/fly";
import { sparkFrom } from "@/features/guest-theme/motion/spark";
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
import { CheckIcon, CloseIcon, PlusIcon, Stepper, TagChip, Txt, dishPhotoUrl } from "./ui";
import type { GuestItem } from "./view-model";

const NOTE_COUNTER_FROM = 160;

// The item sheet: options with their rules, a note for the kitchen, quantity
// and an add button with the live price. A native <dialog> gives focus
// trapping, Escape and an inert page behind it. A bottom sheet on a phone, a
// centred dialog from 768 px.
export function DishSheet({
  item,
  canOrder,
  pairs = [],
  onAdd,
  onAddPair,
  onOpenPair,
  onClose,
}: {
  item: GuestItem;
  canOrder: boolean;
  /** "Guests here often add" (ADR-060): dishes from the café's own rounds. */
  pairs?: GuestItem[];
  onAdd: (add: { modifierIds: string[]; quantity: number; note: string }) => void;
  /** One tap adds a pair that needs no choice, as the menu's "+" does. */
  onAddPair?: (pair: GuestItem, from: HTMLElement) => void;
  onOpenPair?: (pair: GuestItem) => void;
  onClose: () => void;
}) {
  const { t, locale } = useGuestI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [selection, setSelection] = useState<Selection>(() => initialSelection(item.groups));
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [addedPairs, setAddedPairs] = useState<string[]>([]);
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
      className={`bg-surface text-ink md:shadow-float mx-auto mt-auto mb-0 max-h-[90dvh] w-full max-w-[560px] rounded-t-[20px] md:rounded-[20px] overflow-hidden border-0 p-0 backdrop:bg-black/55 md:m-auto md:max-h-[88dvh] md:w-[calc(100%-4rem)] ${styles.sheet}`}
    >
      <div className="max-h-[90dvh] overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-0 md:max-h-[88dvh] md:px-6">
        {/* A big photo across the top with a round × floating on it; without a photo
            the × sits on its own above the name. */}
        <div
          className={`relative -mx-4 overflow-hidden md:-mx-6 ${item.image ? "bg-plate aspect-[16/10]" : "flex justify-end px-4 pt-3 md:px-6"}`}
        >
          {item.image && (
            // eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp
            <img
              src={dishPhotoUrl(item.image)}
              alt=""
              width={800}
              height={500}
              className="size-full object-cover"
            />
          )}
          <span aria-hidden="true" className="absolute top-2 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-white/85 md:hidden" />
          <button
            type="button"
            onClick={onClose}
            aria-label={t("sheet.close")}
            className={`text-ink bg-surface grid size-10 flex-none place-items-center rounded-full [&_svg]:size-4 ${
              item.image ? "absolute top-3 right-3" : "relative"
            }`}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 ref={title} id="dish-sheet-title" tabIndex={-1} className="min-w-0 outline-none">
              <Txt
                value={item.name}
                locale={locale}
                className="display-face block text-[1.125rem] leading-[1.25] break-words hyphens-auto"
              />
            </h2>
            <p className="num text-accent-text mt-1 text-[15px] font-semibold">
              {formatAmd(item.price, locale)}
            </p>
          </div>
          {canOrder && (
            <Stepper
              value={quantity}
              max={MAX_QUANTITY}
              onChange={setQuantity}
              labels={{
                decrease: t("sheet.decrease"),
                increase: t("sheet.increase"),
                quantity: t("sheet.quantity"),
              }}
              button="size-10"
            />
          )}
        </div>
        <p className="text-muted mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          {item.portion && (
            <span className={styles.portion}>
              {t(`menu.units.${item.portion.unit}`, { amount: item.portion.amount })}
            </span>
          )}
          {item.tags.map((tag) => (
            <TagChip key={tag} tag={tag} label={t(`menu.tags.${tag}`)} />
          ))}
        </p>
        {item.description && (
          <Txt
            value={item.description}
            locale={locale}
            as="p"
            className="text-muted mt-2 text-[13px] leading-relaxed"
          />
        )}
        {/* Allergens as the café listed them; when it listed none, say so
            (an empty list is not "free of"), and always send serious
            allergies to the waiter. */}
        <p className="bg-chip text-muted mt-3 rounded-[12px] px-3 py-2.5 text-[12px] leading-snug" data-testid="allergens">
          {item.allergens.length > 0 ? (
            <>
              <span className="text-ink font-semibold">
                {t("diet.contains", {
                  list: item.allergens.map((a) => t(`allergens.${a}`)).join(", "),
                })}
              </span>{" "}
              {t("diet.tellWaiter")}
            </>
          ) : (
            t("diet.sheetNone")
          )}
        </p>

        {item.groups.map((group) => {
          const chosen = selection[group.id] ?? [];
          const single = group.min === 1 && group.max === 1;
          // A required single choice (a size) shows each option's own price,
          // "Mini 1 300 ֏", rather than a difference that can be negative.
          const asPrice = single && group.modifiers.some((m) => m.delta !== 0);
          const hint = [
            group.min > 0 ? t("sheet.required") : t("sheet.optional"),
            group.max > 1 ? t("sheet.upTo", { max: group.max }) : null,
          ]
            .filter(Boolean)
            .join(", ");
          return (
            <fieldset key={group.id} className="mt-5 min-w-0" data-testid="option-group">
              <legend className="mb-1 flex w-full items-center justify-between gap-3 text-[14px] font-semibold">
                {group.name ? <Txt value={group.name} locale={locale} /> : <span />}
                <span
                  className={`rounded-[8px] px-1.5 py-0.5 text-[11px] ${group.min > 0 ? "bg-[#fbe9e0] text-[#8e3a1d] font-semibold" : "text-muted font-normal"}`}
                >
                  {hint}
                </span>
              </legend>
              {group.modifiers.map((m) => {
                const on = chosen.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className="border-line flex min-h-11 items-center gap-3 border-b text-[13px] has-disabled:opacity-60"
                  >
                    <input
                      type={single ? "radio" : "checkbox"}
                      name={`group-${group.id}`}
                      value={m.id}
                      checked={on}
                      disabled={!on && group.max > 1 && chosen.length >= group.max}
                      onChange={() => setSelection((s) => toggleOption(s, group, m.id))}
                      className="accent-accent size-[18px] flex-none"
                    />
                    <Txt value={m.name} locale={locale} className="min-w-0 flex-1" />
                    {asPrice ? (
                      <span className="num text-muted text-[12px] whitespace-nowrap">
                        {formatAmd(item.price + m.delta, locale)}
                      </span>
                    ) : (
                      m.delta !== 0 && (
                        <span className="num text-muted text-[12px] whitespace-nowrap">
                          {m.delta > 0 ? "+" : "−"}
                          {formatAmd(Math.abs(m.delta), locale)}
                        </span>
                      )
                    )}
                  </label>
                );
              })}
            </fieldset>
          );
        })}

        {canOrder && (
          <label className="mt-5 grid gap-1.5 text-[14px] font-semibold" htmlFor="dish-note">
            {t("sheet.note")}
            <textarea
              id="dish-note"
              value={note}
              maxLength={MAX_NOTE}
              rows={2}
              placeholder={t("sheet.notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-field border-line-strong bg-surface min-h-[60px] resize-y border p-3 text-[13px] font-normal"
            />
            {note.length >= NOTE_COUNTER_FROM && (
              <span className="num text-muted justify-self-end text-[12px] font-normal" aria-live="polite">
                {note.length}/{MAX_NOTE}
              </span>
            )}
          </label>
        )}

        {pairs.length > 0 && (
          <section aria-labelledby="pairs-title" className="mt-5" data-testid="pairs">
            <h3 id="pairs-title" className="text-[14px] font-semibold">
              {t("pairs.title")}
            </h3>
            <ul className="-mx-4 mt-2 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1 md:-mx-6 md:px-6 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
              {pairs.map((pair) => {
                const needsChoice = pair.groups.some((g) => g.min > 0);
                const added = addedPairs.includes(pair.id);
                return (
                  <li
                    key={pair.id}
                    className="border-line bg-surface flex w-[13.5rem] flex-none snap-start items-center gap-2.5 rounded-[16px] border p-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenPair?.(pair)}
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      {pair.image && (
                        <span className="bg-plate block size-12 flex-none overflow-hidden rounded-[10px]">
                          {/* eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp */}
                          <img src={dishPhotoUrl(pair.image)} alt="" width={96} height={96} className="size-full object-cover" />
                        </span>
                      )}
                      <span className="grid min-w-0 flex-1">
                        <Txt value={pair.name} locale={locale} className="line-clamp-2 text-[13px] font-semibold break-words" />
                        <span className="num text-accent-text text-[12px] font-semibold whitespace-nowrap">
                          {formatAmd(pair.price, locale)}
                        </span>
                      </span>
                    </button>
                    {canOrder && (
                      <button
                        type="button"
                        aria-label={
                          added
                            ? t("pairs.added", { name: pair.name.text })
                            : t("menu.add", { name: pair.name.text })
                        }
                        aria-haspopup={needsChoice ? "dialog" : undefined}
                        disabled={added}
                        onClick={(e) => {
                          if (needsChoice) return onOpenPair?.(pair);
                          onAddPair?.(pair, e.currentTarget);
                          setAddedPairs((ids) => [...ids, pair.id]);
                        }}
                        className="bg-accent text-on-accent disabled:bg-chip disabled:text-ink grid size-9 flex-none place-items-center rounded-full [&_svg]:size-[14px]"
                      >
                        {added ? <CheckIcon /> : <PlusIcon />}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div
          className={
            canOrder
              ? "bg-surface border-line sticky bottom-0 -mx-4 mt-5 border-t px-4 pt-3 pb-[calc(14px+env(safe-area-inset-bottom,0px))] md:-mx-6 md:px-6 md:pb-5"
              : "pb-[calc(24px+env(safe-area-inset-bottom,0px))]"
          }
        >
          {canOrder ? (
            <div className="flex items-center gap-4">
              <p className="grid flex-none leading-tight">
                <span className="text-muted text-[12px]">{t("cart.total")}</span>
                <span
                  className="num text-[17px] font-semibold whitespace-nowrap"
                  data-testid="sheet-total"
                >
                  {formatAmd(price, locale)}
                </span>
              </p>
              <button
                type="button"
                disabled={!valid}
                onClick={(e) => {
                  sparkFrom(e.currentTarget);
                  flyToCart(e.currentTarget, { photo: item.image ? dishPhotoUrl(item.image) : null });
                  onAdd({ modifierIds: selectedIds(item.groups, selection), quantity, note });
                }}
                className={`${styles.cta} flex min-h-12 min-w-0 flex-1 items-center justify-center gap-3 px-6 text-[14px] font-semibold`}
              >
                {t("sheet.add")}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
