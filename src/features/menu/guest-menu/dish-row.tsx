"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { MAX_QUANTITY } from "@/features/ordering/cart";

import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import styles from "./guest.module.css";
import { CheckIcon, MinusIcon, PlusIcon, TagChip, Txt, dishPhotoUrl } from "./ui";
import { sizesOf, type GuestItem, type Text } from "./view-model";

// One dish as a card (design battle entry B). With a photo: on a phone the
// photo sits at the left of a row, from 768 px it runs edge to edge across the
// top of the card; `feature` makes it the large photo-top card on a phone too
// (the first pictured dish of a longer section, so the list changes pace).
// Under the name: sizes, portion and tags, two lines of description, then the
// price at the bottom left with a round "+" at the bottom right. Without a photo
// it is the same card without the picture. The card opens the dish sheet; "+"
// adds a simple dish at once or opens the sheet when there is a choice to make.
//
// Like a wine card: a dish sold in two or three sizes (glass and bottle,
// standard and mini) lists each size with its price instead of one price, and a
// wine's description («grape / region, country») is set as the region in small
// capitals over the grape.
export function DishRow({
  item,
  canOrder,
  warning,
  onOpen,
  onQuickAdd,
  feature = false,
  section = null,
  index = 0,
}: {
  item: GuestItem;
  canOrder: boolean;
  /** The large photo-top card on a phone as well. */
  feature?: boolean;
  /** What the guest's allergy filter says about this dish, if anything. */
  warning?: { text: string; strong: boolean } | null;
  onOpen: (item: GuestItem) => void;
  onQuickAdd: (item: GuestItem, from: HTMLElement, quantity?: number) => void;
  /** The section's name, shown as a small tag on the card (from 768 px). */
  section?: Text | null;
  /** Place in its section: the first cards rise in one after another. */
  index?: number;
}) {
  const { t, locale } = useGuestI18n();
  // The card's own − n + (Sweetco reference): how many to add with one tap.
  const [count, setCount] = useState(1);
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (!added) return;
    const timer = setTimeout(() => setAdded(false), 1400);
    return () => clearTimeout(timer);
  }, [added]);
  const needsChoice = item.groups.some((g) => g.min > 0);
  const muted = item.soldOut ? "text-muted" : "";
  const sizes = sizesOf(item);
  const photo = Boolean(item.image);
  const popular = item.tags.includes("popular");
  return (
    <li
      className={`bg-surface rounded-card group/card relative flex flex-col border [border-color:var(--guest-card-border)] ${styles.cardRise}`}
      style={{ "--i": Math.min(index, 8) } as CSSProperties}
      data-testid="dish"
      data-dish-id={item.id}
      data-layout="row"
      data-feature={feature || undefined}
      data-warning={warning ? (warning.strong ? "contains" : "unknown") : undefined}
    >
      <button
        type="button"
        disabled={item.soldOut}
        onClick={() => onOpen(item)}
        className={`rounded-card flex min-h-11 w-full min-w-0 overflow-hidden text-left disabled:cursor-default ${
          photo && !feature ? "max-md:flex-row md:flex-col" : "flex-col"
        }`}
      >
        {item.image && (
          <span
            className={`bg-plate relative block flex-none overflow-hidden ${
              feature
                ? "aspect-[4/3] w-full md:m-1.5 md:mb-0 md:w-[calc(100%-0.75rem)] md:rounded-[9px]"
                : "max-md:min-h-[7rem] max-md:w-28 max-md:self-stretch md:m-1.5 md:mb-0 md:aspect-[4/3] md:w-[calc(100%-0.75rem)] md:rounded-[9px]"
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
            {popular && (
              <span className="bg-accent text-on-accent absolute top-2 left-2 rounded-[6px] px-1.5 py-1 text-[10px] leading-none font-semibold">
                {t("menu.tags.popular")}
              </span>
            )}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col px-3 pt-2.5 pb-2">
          {section && (
            <Txt
              value={section}
              locale={locale}
              className="border-line text-muted mb-1.5 hidden self-start rounded-[6px] border px-1.5 py-0.5 text-[10px] leading-none md:block"
            />
          )}
          <Txt
            value={item.name}
            locale={locale}
            className={`min-w-0 text-[13px] leading-[1.3] font-semibold break-words hyphens-auto ${muted}`}
          />
          {sizes.length > 0 && (
            <span
              className={`mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] ${muted}`}
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
          {(item.soldOut || item.portion || item.tags.some((tag) => tag !== "popular" || !photo)) && (
            <span className="text-muted mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
              {item.soldOut && <span className="text-alert font-semibold">{t("menu.soldOut")}</span>}
              {item.portion && (
                <span>{t(`menu.units.${item.portion.unit}`, { amount: item.portion.amount })}</span>
              )}
              {item.tags
                .filter((tag) => tag !== "popular" || !photo)
                .map((tag) => (
                  <TagChip key={tag} tag={tag} label={t(`menu.tags.${tag}`)} />
                ))}
            </span>
          )}
          {item.origin ? (
            // Latin on every page: wine names and regions are not translated.
            <span className="text-muted mt-1 block text-[11px] leading-snug break-words" lang="en">
              <span className="block text-[10px] font-semibold tracking-[0.08em] uppercase">
                {item.origin.region}
              </span>
              <span className="block">{item.origin.grape}</span>
            </span>
          ) : (
            item.description && (
              <Txt
                value={item.description}
                locale={locale}
                className="text-muted mt-0.5 line-clamp-2 block text-[11px] leading-snug break-words"
              />
            )
          )}
          {warning && (
            <span
              className={`mt-1 block text-[11px] font-semibold ${warning.strong ? "text-alert" : "text-muted"}`}
            >
              {warning.text}
            </span>
          )}
          <span
            className={`mt-auto flex items-center pt-1 max-md:min-h-11 md:min-h-7 ${canOrder && !item.soldOut && !feature ? "max-md:pr-10" : ""}`}
          >
            {sizes.length === 0 && (
              <span className={`num text-accent-text text-[13px] font-semibold whitespace-nowrap ${muted}`}>
                {formatAmd(item.price, locale)}
              </span>
            )}
          </span>
        </span>
      </button>
      {canOrder && !item.soldOut && !feature && (
        <span className="absolute right-1 bottom-1 md:hidden">
          <button
            type="button"
            aria-label={t("menu.add", { name: item.name.text })}
            aria-haspopup={needsChoice ? "dialog" : undefined}
            onClick={(e) => (needsChoice ? onOpen(item) : onQuickAdd(item, e.currentTarget))}
            className={styles.hit}
          >
            <span className={styles.plus}>
              <PlusIcon />
            </span>
          </button>
        </span>
      )}
      {canOrder && !item.soldOut && (
        // − n + and «Ավելացնել» under the card (from 768 px; on a phone only on the large card).
        <div className={`gap-2 px-2.5 pb-2.5 ${feature ? "flex" : "hidden md:flex"}`}>
          {!needsChoice && (
            <span className="border-line-strong flex h-10 flex-none items-center rounded-[8px] border">
              <button
                type="button"
                aria-label={t("sheet.decrease")}
                disabled={count <= 1}
                onClick={() => setCount((c) => Math.max(1, c - 1))}
                className="text-ink disabled:text-line-strong grid h-full w-9 place-items-center [&_svg]:size-[14px]"
              >
                <MinusIcon />
              </button>
              <output
                className="num w-5 text-center text-[12px] font-semibold"
                aria-label={t("sheet.quantity")}
              >
                {count}
              </output>
              <button
                type="button"
                aria-label={t("sheet.increase")}
                disabled={count >= MAX_QUANTITY}
                onClick={() => setCount((c) => Math.min(MAX_QUANTITY, c + 1))}
                className="text-ink grid h-full w-9 place-items-center [&_svg]:size-[14px]"
              >
                <PlusIcon />
              </button>
            </span>
          )}
          <button
            type="button"
            aria-label={t("menu.add", { name: item.name.text })}
            aria-haspopup={needsChoice ? "dialog" : undefined}
            onClick={(e) => {
              if (needsChoice) return onOpen(item);
              onQuickAdd(item, e.currentTarget, count);
              setCount(1);
              setAdded(true);
            }}
            className={`${styles.addBtn} flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[8px] text-[12px] font-semibold`}
            data-added={added || undefined}
          >
            {added ? <CheckIcon /> : null}
            {t("sheet.add")}
          </button>
        </div>
      )}
    </li>
  );
}
