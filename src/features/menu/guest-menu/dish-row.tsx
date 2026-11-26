"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { MAX_QUANTITY } from "@/features/ordering/cart";

import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import styles from "./guest.module.css";
import { MetaLine, isBadgeTag, orderTags, MinusIcon, PlusIcon, TagChip, Txt, dishPhotoUrl } from "./ui";
import { sizesOf, type GuestItem } from "./view-model";

// One dish (ADR-093 area pass, ADR-095). On a phone a row on the page: the
// name, sizes, one quiet meta line (portion and tags), two lines of
// description and the price on the left, a fixed 104 px square photo on the
// right. From 768 px a pictured dish stands in the grid with its photo across
// the top and the text on the photo's own left edge, when every dish of its
// section has a photo; a section that mixes pictured and photo-less dishes
// stays a list of rows on hairlines (`listed`, a 112 px photo on the right), so
// no tall card stands beside short ones. Every dish has the same shape: no
// larger "lead" card.
//
// The add control has one place (ADR-095): with a photo it sits inside the
// photo's bottom-right corner, 4 px in, ringed in the page colour; without a
// photo it sits at the right end of the price line, or of the first size's
// line when the dish has two or three prices. It is one shape everywhere: a
// round 44 px "+". Once the dish is in the order (a dish without required
// choices) it widens in 180 ms into a «− n +» pill bound to the order's
// quantity; «−» at 1 takes it out. A dish with required choices keeps the "+"
// (it opens the sheet) with the count on a small badge. Without a table the
// "+" shows in a quiet outline (page colour, hairline ring, muted glyph): the line under the café's name says how
// to order, and a tap on the "+" brings that line into view.
//
// Like a wine card: a dish sold in two or three sizes (glass and bottle,
// standard and mini) lists each size with its price instead of one price, and a
// wine's description («grape / region, country») is set as the region over the
// grape.
//
// The row is a card in the Wine theme (its burgundy cards stay); every other
// theme lays it flat on the page (globals.css), with `--dish-pad` at 0.
/** No table: a tap on a "+" brings the "order with the table's QR code" line into view and pulses it once. */
function pointToScanNote() {
  const note = document.getElementById("scan-note");
  if (!note) return;
  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: still ? "auto" : "smooth" });
  if (!still)
    note.animate(
      [{ color: "var(--guest-muted)" }, { color: "var(--guest-ink)" }, { color: "var(--guest-muted)" }],
      { duration: 1400, delay: 250, easing: "ease-in-out" },
    );
}

export function DishRow({
  item,
  canOrder,
  preview = false,
  warning,
  onOpen,
  onQuickAdd,
  onDecrease,
  inCart = 0,
  index = 0,
  listed = false,
}: {
  item: GuestItem;
  canOrder: boolean;
  /** No table: the "+" shows, dimmed, so the visitor sees how ordering works. */
  preview?: boolean;
  /** What the guest's allergy filter says about this dish, if anything. */
  warning?: { text: string; strong: boolean } | null;
  onOpen: (item: GuestItem) => void;
  onQuickAdd: (item: GuestItem, from: HTMLElement, quantity?: number) => void;
  /** One less of this dish in the order (its newest line). */
  onDecrease?: (item: GuestItem) => void;
  /** How many of this dish the order holds now. */
  inCart?: number;
  /** Place in its section: the first cards rise in one after another. */
  index?: number;
  /**
   * Keep the phone row from 768 px too (a section that mixes pictured and
   * photo-less dishes): the 112 px square photo on the right, a hairline above.
   */
  listed?: boolean;
}) {
  const { t, locale } = useGuestI18n();
  const needsChoice = item.groups.some((g) => g.min > 0);
  const muted = item.soldOut ? "text-muted" : "";
  const sizes = sizesOf(item);
  const photo = Boolean(item.image);
  // A pictured dish becomes a photo card from 768 px, unless its section is a list.
  const card = photo && !listed;
  const orderable = canOrder && !item.soldOut;
  const dimmed = !canOrder && preview && !item.soldOut;
  const control = orderable || dimmed;
  const open = orderable && !needsChoice && inCart > 0;
  const name = item.name.text;
  // Without a photo and with two or three prices, the "+" sits on the first
  // size's line: its place is measured (the name above it may wrap).
  const onSizes = control && !photo && sizes.length > 0;
  const row = useRef<HTMLLIElement>(null);
  const firstSize = useRef<HTMLSpanElement>(null);
  const [sizeTop, setSizeTop] = useState<number | null>(null);
  useLayoutEffect(() => {
    const li = row.current;
    const line = firstSize.current;
    if (!onSizes || !li || !line) return;
    const place = () => {
      const r = line.getBoundingClientRect();
      setSizeTop(Math.round(r.top - li.getBoundingClientRect().top + r.height / 2 - 22));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(li);
    return () => observer.disconnect();
  }, [onSizes, locale]);

  const addControl = (
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
          <output className={`num ${styles.addCount}`}>{inCart}</output>
        </>
      )}
      <button
        type="button"
        aria-label={t("menu.add", { name })}
        aria-haspopup={needsChoice ? "dialog" : undefined}
        aria-disabled={dimmed || (open && inCart >= MAX_QUANTITY) || undefined}
        aria-describedby={dimmed ? "scan-note" : undefined}
        onClick={(e) => {
          if (dimmed) return pointToScanNote();
          if (open && inCart >= MAX_QUANTITY) return;
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
  );

  return (
    <li
      ref={row}
      className={`bg-surface rounded-card group/card relative flex flex-col border [--dish-pad:0.75rem] [border-color:var(--guest-card-border)] ${styles.cardRise}`}
      style={{ "--i": Math.min(index, 8) } as CSSProperties}
      data-testid="dish"
      data-dish-id={item.id}
      data-layout="row"
      data-listed={listed || undefined}
      data-photo={photo || undefined}
      data-in-cart={inCart > 0 || undefined}
      data-warning={warning ? (warning.strong ? "contains" : "unknown") : undefined}
    >
      <button
        type="button"
        disabled={item.soldOut}
        onClick={() => onOpen(item)}
        className={`rounded-card flex min-h-11 w-full min-w-0 flex-1 px-[var(--dish-pad)] py-4 text-left disabled:cursor-default ${
          card
            ? "flex-row-reverse items-start gap-3 md:flex-col md:items-stretch md:gap-0 md:p-[var(--dish-pad)]"
            : photo
              ? "flex-row-reverse items-start gap-3 md:gap-4"
              : listed
                ? "flex-col"
                : "flex-col md:py-[max(0.75rem,var(--dish-pad))]"
        }`}
      >
        {item.image && (
          <span
            data-part="photo"
            className={`bg-plate rounded-guest-md relative block size-[104px] flex-none overflow-hidden ${card ? "md:aspect-[4/3] md:size-auto md:w-full" : "md:size-[112px]"}`}
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
        <span className={`flex min-w-0 flex-1 flex-col self-stretch ${card ? "md:pt-3" : ""}`}>
          <Txt
            value={item.name}
            locale={locale}
            className={`min-w-0 text-name leading-[1.3] font-semibold break-words ${onSizes ? "pr-12" : ""} ${muted}`}
          />
          {sizes.length > 0 && (
            <span
              className={`mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-body ${onSizes ? (open ? "pr-[7.5rem]" : "pr-12") : ""} ${muted}`}
              data-testid="sizes"
            >
              {sizes.map((s, i) => (
                <span key={s.id} ref={i === 0 ? firstSize : undefined} className="whitespace-nowrap">
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
              ...orderTags(item.tags).filter(isBadgeTag).map((tag) => (
                <TagChip key={tag} tag={tag} label={t(`menu.tags.${tag}`)} />
              )),
              item.portion && t(`menu.units.${item.portion.unit}`, { amount: item.portion.amount }),
              ...item.tags
                .filter((tag) => !isBadgeTag(tag))
                .map((tag) => <TagChip key={tag} tag={tag} label={t(`menu.tags.${tag}`)} />),
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
          {sizes.length === 0 && (
            <span
              className={`mt-auto flex min-h-11 items-center pt-1 ${control && !photo ? (open ? "pr-[7.5rem]" : "pr-14") : ""}`}
            >
              <span className={`num text-accent-text text-body font-semibold whitespace-nowrap ${muted}`}>
                {formatAmd(item.price, locale)}
              </span>
            </span>
          )}
        </span>
      </button>
      {control &&
        (photo ? (
          // The photo's footprint, so the control sits in its bottom-right corner.
          <span
            className={`pointer-events-none absolute top-4 right-[var(--dish-pad)] size-[104px] ${card ? "md:inset-x-[var(--dish-pad)] md:top-[var(--dish-pad)] md:aspect-[4/3] md:size-auto" : "md:size-[112px]"}`}
          >
            <span className="pointer-events-auto absolute right-1 bottom-1">{addControl}</span>
          </span>
        ) : (
          <span
            className={`absolute right-[var(--dish-pad)] ${onSizes ? "" : listed ? "bottom-4" : "bottom-4 md:bottom-[max(0.75rem,var(--dish-pad))]"}`}
            style={onSizes ? { top: sizeTop ?? 12 } : undefined}
          >
            {addControl}
          </span>
        ))}
    </li>
  );
}
