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
import { ShieldAlert } from "./icons";
import { QtyPill } from "./qty-pill";
import { CloseIcon, MetaLine, isBadgeTag, orderTags, TagChip, Txt, dishPhotoUrl } from "./ui";
import type { GuestItem } from "./view-model";

const NOTE_COUNTER_FROM = 160;

// The item sheet: options with their rules, a note for the kitchen, quantity
// and an add button with the live price. A native <dialog> gives focus
// trapping, Escape and an inert page behind it. A bottom sheet on a phone, a
// centred dialog from 768 px. ADR-093 area pass (benchmark §2.2): the price
// under the 24 px title follows the chosen size; options are 52 px rows with
// 22 px controls; the allergens are plain text on the sheet, not a box; and
// everything a thumb needs is in the sticky footer: − n + on the left and
// one 56 px «Add · total» that reads «Choose …» (and scrolls there) until the
// required choices are made.
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
  const unit = unitPrice(item.price, item.groups, selection);
  const price = unit * quantity;
  // The first required group still without its choice (the add button says so).
  const missing = valid ? undefined : item.groups.find((g) => (selection[g.id]?.length ?? 0) < g.min);

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
      // A close event that arrives while the dialog is open again is stale
      // (React's dev double mount closes and reopens it): only a real close counts.
      onClose={() => !dialog.current?.open && onClose()}
      onClick={(e) => {
        if (e.target === dialog.current) onClose(); // a tap on the backdrop
      }}
      className={`bg-surface text-ink md:shadow-float rounded-t-guest-lg md:rounded-guest-lg mx-auto mt-auto mb-0 max-h-[90dvh] w-full max-w-[560px] overflow-hidden border-0 p-0 backdrop:bg-black/55 md:m-auto md:max-h-[88dvh] md:w-[calc(100%-4rem)] ${styles.sheet}`}
    >
      <div className="max-h-[90dvh] overflow-x-hidden overflow-y-auto overscroll-contain px-4 pt-0 md:max-h-[88dvh] md:px-6">
        {/* A big photo across the top with a round × floating on it; without a photo
            the × sits at the end of the name's row (ADR-095), no empty band. */}
        {(() => {
          const close = (
            <button
              type="button"
              onClick={onClose}
              aria-label={t("sheet.close")}
              className={`text-ink grid size-11 flex-none place-items-center rounded-full [&_svg]:size-4 ${
                item.image ? "bg-surface absolute top-3 right-3" : "bg-chip -mr-1"
              }`}
            >
              <CloseIcon />
            </button>
          );
          return (
            <>
              <div
                className={`relative -mx-4 overflow-hidden md:-mx-6 ${item.image ? "bg-plate aspect-[16/10]" : "h-3"}`}
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
                  className={`absolute top-2 left-1/2 h-1 w-9 -translate-x-1/2 rounded-full md:hidden ${item.image ? "bg-white/85" : "bg-line"}`}
                />
                {item.image && close}
              </div>
              <div className={`min-w-0 ${item.image ? "mt-4" : "mt-3 flex items-start gap-3"}`}>
                <h2
                  ref={title}
                  id="dish-sheet-title"
                  tabIndex={-1}
                  className={`min-w-0 outline-none ${item.image ? "" : "flex-1 pt-1.5"}`}
                >
                  <Txt
                    value={item.name}
                    locale={locale}
                    className="display-face text-headline block leading-[1.2] break-words hyphens-auto"
                  />
                </h2>
                {!item.image && close}
              </div>
            </>
          );
        })()}
        <div className="min-w-0">
          <p className="num text-accent-text mt-1 text-name font-semibold" data-testid="sheet-price">
            {formatAmd(unit, locale)}
          </p>
        </div>
        {(item.portion || item.tags.length > 0) && (
          <p className="mt-2">
            <MetaLine
              parts={[
                ...orderTags(item.tags).filter(isBadgeTag).map((tag) => (
                  <TagChip key={tag} tag={tag} label={t(`menu.tags.${tag}`)} />
                )),
                item.portion && t(`menu.units.${item.portion.unit}`, { amount: item.portion.amount }),
                ...item.tags
                  .filter((tag) => !isBadgeTag(tag))
                  .map((tag) => <TagChip key={tag} tag={tag} label={t(`menu.tags.${tag}`)} />),
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
          <p className="num text-muted mt-2 text-label" data-testid="kcal">
            {formatKcal(item.kcal, (value) => t("menu.kcal", { value }), locale)}
          </p>
        )}
        {/* Allergens as the café listed them; when it listed none, say so
            (an empty list is not "free of"), and always send serious
            allergies to the waiter. Whose data it is goes once, on its own
            line, small. */}
        <div className="text-ink mt-4 flex gap-2.5 text-body leading-[1.45]" data-testid="allergens">
          <ShieldAlert size={18} className="text-muted mt-[3px] flex-none" />
          <div className="min-w-0">
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
          <p className="text-muted mt-0.5 text-meta leading-[1.45]">{t("diet.venueNote")}</p>
          </div>
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
            <fieldset
              key={group.id}
              id={`group-${group.id}`}
              className="mt-5 min-w-0 scroll-mt-4"
              data-testid="option-group"
            >
              <legend className="mb-1 flex w-full items-center justify-between gap-3 text-name font-semibold">
                {group.name ? <Txt value={group.name} locale={locale} /> : <span />}
                <span
                  className={`text-label leading-[1.2] ${group.min > 0 ? "text-ink font-semibold" : "text-muted font-normal"}`}
                >
                  {hint}
                </span>
              </legend>
              {group.modifiers.map((m) => {
                const on = chosen.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className="border-line flex min-h-[52px] cursor-pointer items-center gap-3 border-b py-1.5 text-body has-disabled:opacity-60"
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
              rows={1}
              placeholder={t("sheet.notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-field border-line-strong bg-surface max-h-40 min-h-12 resize-none border px-3 py-2.5 text-base font-normal [field-sizing:content]"
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
              ? "bg-surface border-line sticky bottom-0 -mx-4 mt-5 border-t px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom,0px))] md:-mx-6 md:px-6 md:pb-5"
              : "pb-[calc(24px+env(safe-area-inset-bottom,0px))]"
          }
        >
          {canOrder ? (
            <div className="flex items-center gap-3">
              <QtyPill
                value={quantity}
                min={1}
                max={MAX_QUANTITY}
                size="lg"
                valueLabel={t("sheet.quantity")}
                decreaseLabel={t("sheet.decrease")}
                increaseLabel={t("sheet.increase")}
                onDecrease={() => setQuantity((n) => Math.max(1, n - 1))}
                onIncrease={() => setQuantity((n) => Math.min(MAX_QUANTITY, n + 1))}
              />
              <button
                type="button"
                aria-disabled={!valid || undefined}
                onClick={(e) => {
                  if (missing) {
                    // Not yet: show the guest which choice is missing.
                    const at = document.getElementById(`group-${missing.id}`);
                    at?.scrollIntoView({ behavior: "smooth", block: "start" });
                    at?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
                    return;
                  }
                  sparkFrom(e.currentTarget);
                  flyToCart(e.currentTarget, { photo: item.image ? dishPhotoUrl(item.image) : null });
                  onAdd({ modifierIds: selectedIds(item.groups, selection), quantity, note });
                }}
                className={`${styles.cta} flex min-h-14 min-w-0 flex-1 items-center justify-center gap-2 px-4 text-body font-semibold aria-disabled:opacity-70`}
              >
                {missing ? (
                  <span className="min-w-0 truncate">
                    {t("sheet.chooseFirst", { name: missing.name?.text ?? t("sheet.required") })}
                  </span>
                ) : (
                  <>
                    {t("sheet.add")}
                    <span aria-hidden="true">·</span>
                    <span className="num whitespace-nowrap" data-testid="sheet-total">
                      {formatAmd(price, locale)}
                    </span>
                  </>
                )}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
