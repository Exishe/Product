"use client";

import { type CSSProperties } from "react";
import { MAX_QUANTITY } from "@/features/ordering/cart";

import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import styles from "./guest.module.css";
import { MetaLine, MinusIcon, PlusIcon, TagChip, Txt, dishPhotoUrl } from "./ui";
import { sizesOf, type GuestItem, type Text } from "./view-model";

// One dish (ADR-093 area pass, benchmark §2.2). On a phone a row on the page:
// the name, sizes, one quiet meta line (portion and tags), two lines of
// description and the price on the left, a fixed 104 px square photo on the
// right, and the add control at the bottom right, over the photo's corner.
// `feature` makes it the large photo-top card (the first pictured dish of a
// longer section, so the list changes pace). From 768 px every pictured dish
// is a card with its photo across the top. Without a photo: the same text,
// no photo column at all.
//
// The add control is one shape everywhere: a round 44 px "+". Once the dish
// is in the order (a dish without required choices) it widens in 180 ms into
// a «− n +» pill bound to the order's quantity, so the row itself says it is
// in the order and how many; «−» at 1 takes it out. A dish with required
// choices keeps the "+" (it opens the sheet) with the count on a small badge.
// Without a table the "+" shows dimmed and does nothing: the line under the
// café's name says how to order.
//
// Like a wine card: a dish sold in two or three sizes (glass and bottle,
// standard and mini) lists each size with its price instead of one price, and a
// wine's description («grape / region, country») is set as the region over the
// grape.
export function DishRow({
  item,
  canOrder,
  preview = false,
  warning,
  onOpen,
  onQuickAdd,
  onDecrease,
  inCart = 0,
  feature = false,
  section = null,
  index = 0,
}: {
  item: GuestItem;
  canOrder: boolean;
  /** No table: the "+" shows, dimmed, so the visitor sees how ordering works. */
  preview?: boolean;
  /** The large photo-top card on a phone as well. */
  feature?: boolean;
  /** What the guest's allergy filter says about this dish, if anything. */
  warning?: { text: string; strong: boolean } | null;
  onOpen: (item: GuestItem) => void;
  onQuickAdd: (item: GuestItem, from: HTMLElement, quantity?: number) => void;
  /** One less of this dish in the order (its newest line). */
  onDecrease?: (item: GuestItem) => void;
  /** How many of this dish the order holds now. */
  inCart?: number;
  /** The section's name, shown as a small tag on the card (from 768 px). */
  section?: Text | null;
  /** Place in its section: the first cards rise in one after another. */
  index?: number;
}) {
  const { t, locale } = useGuestI18n();
  const needsChoice = item.groups.some((g) => g.min > 0);
  const muted = item.soldOut ? "text-muted" : "";
  const sizes = sizesOf(item);
  const photo = Boolean(item.image);
  const orderable = canOrder && !item.soldOut;
  const dimmed = !canOrder && preview && !item.soldOut;
  const open = orderable && !needsChoice && inCart > 0;
  const name = item.name.text;
  // The row on a phone: photo on the right (not for the large card).
  const side = photo && !feature;
  return (
    <li
      className={`bg-surface rounded-card group/card @container/card relative flex flex-col border [border-color:var(--guest-card-border)] ${styles.cardRise}`}
      style={{ "--i": Math.min(index, 8) } as CSSProperties}
      data-testid="dish"
      data-dish-id={item.id}
      data-layout="row"
      data-feature={feature || undefined}
      data-in-cart={inCart > 0 || undefined}
      data-warning={warning ? (warning.strong ? "contains" : "unknown") : undefined}
    >
      <button
        type="button"
        disabled={item.soldOut}
        onClick={() => onOpen(item)}
        className={`rounded-card flex min-h-11 w-full min-w-0 flex-1 overflow-hidden text-left disabled:cursor-default ${
          side ? "max-md:flex-row-reverse max-md:items-start max-md:gap-3 md:flex-col" : "flex-col"
        }`}
      >
        {item.image && (
          <span
            className={`bg-plate relative block flex-none overflow-hidden ${
              feature
                ? "max-md:rounded-guest-md md:rounded-guest-sm aspect-[4/3] w-full md:m-1.5 md:mb-0 md:w-[calc(100%-0.75rem)]"
                : "max-md:rounded-guest-md md:rounded-guest-sm max-md:mt-2 max-md:size-[104px] md:m-1.5 md:mb-0 md:aspect-[4/3] md:w-[calc(100%-0.75rem)]"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp */}
            <img
              src={dishPhotoUrl(item.image)}
              alt=""
              width={600}
              height={450}
              loading="lazy"
              className={`absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover/card:scale-[1.04] motion-reduce:transition-none ${item.soldOut ? "opacity-50 grayscale" : ""}`}
            />
          </span>
        )}
        <span
          className={`flex min-w-0 flex-1 flex-col px-3 pt-3 pb-2 max-md:px-0 ${side ? "max-md:pt-2" : ""}`}
        >
          {section && (
            <Txt
              value={section}
              locale={locale}
              className="border-line text-muted rounded-guest-sm mb-1.5 hidden self-start border px-2 py-1 text-meta leading-none md:block"
            />
          )}
          <Txt
            value={item.name}
            locale={locale}
            className={`min-w-0 text-name leading-[1.3] font-semibold break-words ${muted}`}
          />
          {sizes.length > 0 && (
            <span
              className={`mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-body ${muted}`}
              data-testid="sizes"
            >
              {sizes.map((s) => (
                <span key={s.id} className="whitespace-nowrap">
                  <Txt value={s.name} locale={locale} className="text-muted" />{" "}
                  <span className="num text-accent-text font-semibold">{formatAmd(s.price, locale)}</span>
                </span>
              ))}
            </span>
          )}
          {item.substitution && (
            <span className="text-muted mt-1 block text-label font-semibold">
              {t("menu.withSub", { to: item.substitution.to })}
            </span>
          )}
          <MetaLine
            className="mt-1"
            parts={[
              item.soldOut && <span className="text-alert font-semibold">{t("menu.soldOut")}</span>,
              item.portion && t(`menu.units.${item.portion.unit}`, { amount: item.portion.amount }),
              ...item.tags.map((tag) => <TagChip key={tag} tag={tag} label={t(`menu.tags.${tag}`)} />),
            ]}
          />
          {item.origin ? (
            // Latin on every page: wine names and regions are not translated.
            <span className="text-muted mt-1 block text-body leading-[1.45] break-words" lang="en">
              <span className="block font-semibold">{item.origin.region}</span>
              <span className="block">{item.origin.grape}</span>
            </span>
          ) : (
            item.description && (
              <Txt
                value={item.description}
                locale={locale}
                className="text-muted mt-1 line-clamp-2 block text-body leading-[1.45] break-words"
              />
            )
          )}
          {warning && (
            <span
              className={`mt-1 block text-label font-semibold ${warning.strong ? "text-alert" : "text-muted"}`}
            >
              {warning.text}
            </span>
          )}
          <span
            className={`mt-auto flex min-h-11 items-center pt-2 ${
              orderable || dimmed ? (side ? "md:pr-[7.5rem]" : "pr-[7.5rem]") : ""
            }`}
          >
            {sizes.length === 0 && (
              <span className={`num text-accent-text text-body font-semibold whitespace-nowrap ${muted}`}>
                {formatAmd(item.price, locale)}
              </span>
            )}
          </span>
        </span>
      </button>
      {(orderable || dimmed) && (
        <span className="absolute right-1 bottom-1 max-md:right-0 max-md:bottom-2">
          <span className={styles.addCtl} data-open={open || undefined} data-dimmed={dimmed || undefined}>
            {open && (
              <>
                <button
                  type="button"
                  aria-label={inCart === 1 ? t("cart.remove", { name }) : t("cart.decrease", { name })}
                  onClick={() => onDecrease?.(item)}
                  className={styles.addStep}
                >
                  <MinusIcon />
                </button>
                <output className={`num ${styles.addCount}`}>
                  {inCart}
                </output>
              </>
            )}
            <button
              type="button"
              aria-label={t("menu.add", { name })}
              aria-haspopup={needsChoice ? "dialog" : undefined}
              aria-disabled={dimmed || (open && inCart >= MAX_QUANTITY) || undefined}
              onClick={(e) => {
                if (dimmed || (open && inCart >= MAX_QUANTITY)) return;
                if (needsChoice) onOpen(item);
                else onQuickAdd(item, e.currentTarget);
              }}
              className={open ? styles.addStep : styles.hit}
            >
              {open ? (
                <PlusIcon />
              ) : (
                <span className={styles.plus}>
                  <PlusIcon />
                </span>
              )}
            </button>
            {needsChoice && inCart > 0 && orderable && (
              <span aria-hidden="true" className={`num ${styles.addBadge}`}>
                {inCart}
              </span>
            )}
          </span>
        </span>
      )}
    </li>
  );
}
