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
import { CheckIcon, CloseIcon, Plate, PlusIcon, Stepper, TagChip, Txt, dishPhotoUrl } from "./ui";
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
      className={`rounded-t-feature bg-surface text-ink md:rounded-feature md:shadow-float mx-auto mt-auto mb-0 max-h-[90dvh] w-full max-w-[600px] overflow-hidden border-0 p-0 backdrop:bg-black/55 md:m-auto md:max-h-[88dvh] md:w-[calc(100%-4rem)] ${styles.sheet}`}
    >
      <div className="max-h-[90dvh] overflow-x-hidden overflow-y-auto overscroll-contain px-5 pt-0 md:max-h-[88dvh] md:px-9">
        {/* A big photo across the top with a round × floating on it; without a photo
            the × sits on its own above the name. */}
        <div
          className={`relative -mx-5 overflow-hidden md:-mx-9 ${item.image ? "bg-plate aspect-[4/3] md:aspect-[16/10]" : "px-5 pt-5 md:px-9 md:pt-7"}`}
        >
          {item.image && (
            // eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp
            <img
              src={dishPhotoUrl(item.image)}
              alt=""
              width={800}
              height={600}
              className="size-full object-cover"
            />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label={t("sheet.close")}
            className={`text-ink bg-surface shadow-card grid size-12 flex-none place-items-center rounded-full ${
              item.image ? "absolute top-4 left-4 md:top-5 md:left-5" : "relative"
            }`}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="mt-5 flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 ref={title} id="dish-sheet-title" tabIndex={-1} className="min-w-0 outline-none">
              <Txt
                value={item.name}
                locale={locale}
                className="display-face block text-[1.375rem] leading-[1.2] break-words hyphens-auto md:text-[1.5rem]"
              />
            </h2>
            <p className="num text-accent-text mt-1 text-[1.125rem] font-semibold">
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
              button="size-11"
            />
          )}
        </div>
        <p className="text-muted mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem]">
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
            className="text-muted mt-3 text-[0.9375rem] leading-relaxed"
          />
        )}
        {/* Allergens as the café listed them; when it listed none, say so
            (an empty list is not "free of"), and always send serious
            allergies to the waiter. */}
        <p className="text-muted mt-3 text-[0.875rem] leading-snug" data-testid="allergens">
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
            <fieldset key={group.id} className="mt-6 min-w-0" data-testid="option-group">
              <legend className="mb-2 flex w-full items-baseline justify-between gap-3 font-semibold">
                {group.name ? <Txt value={group.name} locale={locale} /> : <span />}
                <span
                  className={`text-sm ${group.min > 0 ? "text-alert font-semibold" : "text-muted font-normal"}`}
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
                      className="accent-accent size-[22px] flex-none"
                    />
                    <Txt value={m.name} locale={locale} className="min-w-0 flex-1" />
                    {asPrice ? (
                      <span className="num text-muted text-sm whitespace-nowrap">
                        {formatAmd(item.price + m.delta, locale)}
                      </span>
                    ) : (
                      m.delta !== 0 && (
                        <span className="num text-muted text-sm whitespace-nowrap">
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
          <label className="mt-6 grid gap-1.5 font-semibold" htmlFor="dish-note">
            {t("sheet.note")}
            <textarea
              id="dish-note"
              value={note}
              maxLength={MAX_NOTE}
              rows={2}
              placeholder={t("sheet.notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-field border-line-strong bg-surface min-h-[72px] resize-y border p-3 font-normal"
            />
            {note.length >= NOTE_COUNTER_FROM && (
              <span className="num text-muted justify-self-end text-sm font-normal" aria-live="polite">
                {note.length}/{MAX_NOTE}
              </span>
            )}
          </label>
        )}

        {pairs.length > 0 && (
          <section aria-labelledby="pairs-title" className="mt-5" data-testid="pairs">
            <h3 id="pairs-title" className="text-muted text-[0.8125rem] font-semibold">
              {t("pairs.title")}
            </h3>
            <ul className="mt-1">
              {pairs.map((pair) => {
                const needsChoice = pair.groups.some((g) => g.min > 0);
                const added = addedPairs.includes(pair.id);
                return (
                  <li
                    key={pair.id}
                    className="border-line flex items-center gap-3 border-b py-2 last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenPair?.(pair)}
                      className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
                    >
                      {pair.image && (
                        <Plate src={dishPhotoUrl(pair.image)} size={44} className="size-11 flex-none" />
                      )}
                      <Txt
                        value={pair.name}
                        locale={locale}
                        className="min-w-0 flex-1 font-semibold break-words"
                      />
                      <span className="num text-accent-text flex-none text-sm font-semibold whitespace-nowrap">
                        {formatAmd(pair.price, locale)}
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
                        className="text-ink hover:bg-chip disabled:bg-chip grid size-11 flex-none place-items-center rounded-full border [border-color:color-mix(in_srgb,var(--guest-line-strong)_60%,transparent)] [&_svg]:size-[18px]"
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
              ? "bg-surface sticky bottom-0 -mx-5 mt-6 px-5 pt-3 pb-[calc(16px+env(safe-area-inset-bottom,0px))] md:-mx-9 md:px-9 md:pb-7"
              : "pb-[calc(24px+env(safe-area-inset-bottom,0px))]"
          }
        >
          {canOrder ? (
            <div className="flex items-center gap-4">
              <p className="grid flex-none leading-tight">
                <span className="text-muted text-[0.8125rem]">{t("cart.total")}</span>
                <span
                  className="num text-[1.375rem] font-semibold whitespace-nowrap"
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
                className={`${styles.cta} flex min-h-14 min-w-0 flex-1 items-center justify-center gap-3 px-6 font-semibold`}
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
