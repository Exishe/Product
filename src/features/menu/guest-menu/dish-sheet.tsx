"use client";

import { flyToCart } from "@/features/guest-theme/motion/fly";
import { sparkFrom } from "@/features/guest-theme/motion/spark";
import { useEffect, useRef, useState } from "react";
import type { Track } from "@/features/analytics/track";
import { MAX_NOTE, MAX_QUANTITY } from "@/features/ordering/cart";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import { formatKcal } from "./kcal";
import {
  initialSelection,
  isSelectionValid,
  selectedIds,
  toggleOption,
  unitPrice,
  type Selection,
} from "./selection";
import styles from "./guest.module.css";
import { CloseIcon, MetaLine, Stepper, TagChip, Txt, dishPhotoUrl } from "./ui";
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
  track,
}: {
  item: GuestItem;
  canOrder: boolean;
  onAdd: (add: { modifierIds: string[]; quantity: number; note: string }) => void;
  onClose: () => void;
  /** Anonymous event tracking (ADR-072); absent in tests. */
  track?: Track;
}) {
  const { t, locale } = useGuestI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [selection, setSelection] = useState<Selection>(() => initialSelection(item.groups));
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const valid = isSelectionValid(item.groups, selection);
  const price = unitPrice(item.price, item.groups, selection) * quantity;

  // The sheet is keyed by dish, so this runs once per opening: a view.
  useEffect(() => {
    track?.("item_view", item.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      className={`bg-surface text-ink md:shadow-float rounded-t-guest-lg md:rounded-guest-lg mx-auto mt-auto mb-0 max-h-[90dvh] w-full max-w-[560px] overflow-hidden border-0 p-0 backdrop:bg-black/55 md:m-auto md:max-h-[88dvh] md:w-[calc(100%-4rem)] ${styles.sheet}`}
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
          <span
            aria-hidden="true"
            className="absolute top-2 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full bg-white/85 md:hidden"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={t("sheet.close")}
            className={`text-ink bg-surface grid size-11 flex-none place-items-center rounded-full [&_svg]:size-4 ${
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
                className="display-face block text-[1.375rem] leading-[1.2] break-words hyphens-auto"
              />
            </h2>
            <p className="num text-accent-text mt-1 text-name font-semibold">
              {formatAmd(item.price, locale)}
            </p>
          </div>
          {canOrder && (
            <div className="flex flex-none items-center gap-1">
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
            </div>
          )}
        </div>
        {(item.portion || item.tags.length > 0) && (
          <p className="mt-2">
            <MetaLine
              parts={[
                item.portion && t(`menu.units.${item.portion.unit}`, { amount: item.portion.amount }),
                ...item.tags.map((tag) => <TagChip key={tag} tag={tag} label={t(`menu.tags.${tag}`)} />),
              ]}
            />
          </p>
        )}
        {item.description && (
          <Txt
            value={item.description}
            locale={locale}
            as="p"
            className="text-muted mt-2 text-body leading-[1.45]"
          />
        )}
        {item.kcal !== null && (
          <p className="num text-muted mt-2 text-meta" data-testid="kcal">
            {formatKcal(item.kcal, (value) => t("menu.kcal", { value }), locale)}
          </p>
        )}
        {/* Allergens as the café listed them; when it listed none, say so
            (an empty list is not "free of"), and always send serious
            allergies to the waiter. Whose data it is goes once, on its own
            line, small. */}
        <div
          className="bg-chip text-ink rounded-guest-md mt-4 px-3 py-3 text-body leading-[1.45]"
          data-testid="allergens"
        >
          {item.allergens.length > 0 ? (
            <p>
              <span className="font-semibold">
                {t("diet.contains", {
                  list: item.allergens.map((a) => t(`allergens.${a}`)).join(", "),
                })}
              </span>{" "}
              {t("diet.tellWaiter")}
            </p>
          ) : (
            <p>{item.allergensConfirmed ? t("diet.sheetNoneDeclared") : t("diet.sheetNone")}</p>
          )}
          <p className="text-muted mt-1 text-meta">{t("diet.venueNote")}</p>
        </div>

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
              <legend className="mb-1 flex w-full items-center justify-between gap-3 text-name font-semibold">
                {group.name ? <Txt value={group.name} locale={locale} /> : <span />}
                <span
                  className={`text-meta leading-none ${group.min > 0 ? "bg-chip text-ink rounded-guest-sm px-2 py-1 font-semibold" : "text-muted font-normal"}`}
                >
                  {hint}
                </span>
              </legend>
              {group.modifiers.map((m) => {
                const on = chosen.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className="border-line flex min-h-11 items-center gap-3 border-b text-body has-disabled:opacity-60"
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
                      <span className="num text-muted text-body whitespace-nowrap">
                        {formatAmd(item.price + m.delta, locale)}
                      </span>
                    ) : (
                      m.delta !== 0 && (
                        <span className="num text-muted text-body whitespace-nowrap">
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
          <label className="mt-5 grid gap-1.5 text-name font-semibold" htmlFor="dish-note">
            {t("sheet.note")}
            <textarea
              id="dish-note"
              value={note}
              maxLength={MAX_NOTE}
              rows={2}
              placeholder={t("sheet.notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-field border-line-strong bg-surface min-h-16 resize-y border px-3 py-2.5 text-base font-normal"
            />
            {note.length >= NOTE_COUNTER_FROM && (
              <span className="num text-muted justify-self-end text-meta font-normal" aria-live="polite">
                {note.length}/{MAX_NOTE}
              </span>
            )}
          </label>
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
                <span className="text-muted text-meta">{t("cart.total")}</span>
                <span className="num text-name font-semibold whitespace-nowrap" data-testid="sheet-total">
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
                className={`${styles.cta} flex min-h-12 min-w-0 flex-1 items-center justify-center gap-3 px-6 text-body font-semibold`}
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
