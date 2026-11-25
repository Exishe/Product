"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { MAX_QUANTITY } from "@/features/ordering/cart";

import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import styles from "./guest.module.css";
import {
  CheckIcon,
  MetaLine,
  MinusIcon,
  PlusIcon,
  TagBadge,
  TagChip,
  Txt,
  dishPhotoUrl,
  isBadgeTag,
} from "./ui";
import { sizesOf, type GuestItem, type Text } from "./view-model";

// One dish as a card (design battle entry B). With a photo: on a phone the
// photo sits at the left of a row, from 768 px it runs edge to edge across the
// top of the card; `feature` makes it the large photo-top card on a phone too
// (the first pictured dish of a longer section, so the list changes pace).
// Under the name: sizes, then one muted line of portion and tags, two lines of
// description, then the price at the bottom left with a round "+" at the bottom
// right. Without a photo it is a compact card of text with the round "+" at
// every width (guest-menu.tsx lists those after the photo cards). Cards in a
// grid row stretch to the same height, so their prices share a line. The card
// opens the dish sheet; "+" adds a simple dish at once or opens the sheet when
// there is a choice to make.
//
// Like a wine card: a dish sold in two or three sizes (glass and bottle,
// standard and mini) lists each size with its price instead of one price, and a
// wine's description («grape / region, country») is set as the region over the
// grape.
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
  // The badge tags sit on the photo's corner; without a photo they lead the meta line.
  const photoBadge = photo ? item.tags.find(isBadgeTag) : undefined;
  const metaTags = item.tags.filter((tag) => tag !== photoBadge);
  const orderable = canOrder && !item.soldOut;
  // How a card adds. − n + and «Ավելացնել» under the card: the large card on
  // a phone, and photo cards from 768 px that are at least 15rem wide (a
  // container query on the card itself). Everywhere else the round "+" at the
  // bottom right: a phone's photo row, every text card, and a photo card too
  // narrow for the pair (three across), so a button is never squeezed.
  const roundAddClass = feature
    ? "hidden md:block md:@min-[15rem]/card:hidden"
    : photo
      ? "md:@min-[15rem]/card:hidden"
      : "";
  const stepRowClass = feature
    ? "flex md:hidden md:@min-[15rem]/card:flex"
    : "hidden md:@min-[15rem]/card:flex";
  const priceRowClass = !orderable
    ? ""
    : feature
      ? "pr-10 md:min-h-11 md:@min-[15rem]/card:min-h-0"
      : photo
        ? "min-h-11 pr-10 md:@min-[15rem]/card:min-h-7"
        : "min-h-11 pr-10";
  return (
    <li
      className={`bg-surface rounded-card group/card @container/card relative flex flex-col border [border-color:var(--guest-card-border)] ${styles.cardRise}`}
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
        className={`rounded-card flex min-h-11 w-full min-w-0 flex-1 overflow-hidden text-left disabled:cursor-default ${
          photo && !feature ? "max-md:flex-row md:flex-col" : "flex-col"
        }`}
      >
        {item.image && (
          <span
            className={`bg-plate relative block flex-none overflow-hidden ${
              feature
                ? "md:rounded-guest-sm aspect-[4/3] w-full md:m-1.5 md:mb-0 md:w-[calc(100%-0.75rem)]"
                : "md:rounded-guest-sm max-md:min-h-[7rem] max-md:w-28 max-md:self-stretch md:m-1.5 md:mb-0 md:aspect-[4/3] md:w-[calc(100%-0.75rem)]"
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
            {photoBadge && (
              <span className="absolute top-2 left-2">
                <TagBadge label={t(`menu.tags.${photoBadge}`)} onPhoto />
              </span>
            )}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col px-3 pt-3 pb-2">
          {section && (
            <Txt
              value={section}
              locale={locale}
              className="border-line text-muted rounded-guest-sm mb-1.5 hidden self-start border px-2 py-1 text-[12px] leading-none md:block"
            />
          )}
          <Txt
            value={item.name}
            locale={locale}
            className={`min-w-0 text-[16px] leading-[1.3] font-semibold break-words hyphens-auto ${muted}`}
          />
          {sizes.length > 0 && (
            <span
              className={`mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[14px] ${muted}`}
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
            <span className="text-muted mt-1 block text-[12px] font-semibold">
              {t("menu.withSub", { to: item.substitution.to })}
            </span>
          )}
          <MetaLine
            className="mt-1"
            parts={[
              item.soldOut && <span className="text-alert font-semibold">{t("menu.soldOut")}</span>,
              item.portion && t(`menu.units.${item.portion.unit}`, { amount: item.portion.amount }),
              ...metaTags.map((tag) => <TagChip key={tag} tag={tag} label={t(`menu.tags.${tag}`)} />),
            ]}
          />
          {item.origin ? (
            // Latin on every page: wine names and regions are not translated.
            <span className="text-muted mt-1 block text-[14px] leading-[1.45] break-words" lang="en">
              <span className="block font-semibold">{item.origin.region}</span>
              <span className="block">{item.origin.grape}</span>
            </span>
          ) : (
            item.description && (
              <Txt
                value={item.description}
                locale={locale}
                className="text-muted mt-1 line-clamp-2 block text-[14px] leading-[1.45] break-words"
              />
            )
          )}
          {warning && (
            <span
              className={`mt-1 block text-[12px] font-semibold ${warning.strong ? "text-alert" : "text-muted"}`}
            >
              {warning.text}
            </span>
          )}
          <span className={`mt-auto flex items-center pt-2 ${priceRowClass}`}>
            {sizes.length === 0 && (
              <span className={`num text-accent-text text-[14px] font-semibold whitespace-nowrap ${muted}`}>
                {formatAmd(item.price, locale)}
              </span>
            )}
          </span>
        </span>
      </button>
      {orderable && (
        <span className={`absolute right-1 bottom-1 ${roundAddClass}`}>
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
      {orderable && (feature || photo) && (
        <div className={`gap-2 px-3 pb-3 ${stepRowClass}`}>
          {!needsChoice && (
            <span className="rounded-guest-md flex h-11 flex-none items-center border [border-color:var(--guest-line-strong)]">
              <button
                type="button"
                aria-label={t("sheet.decrease")}
                disabled={count <= 1}
                onClick={() => setCount((c) => Math.max(1, c - 1))}
                className="text-ink disabled:text-line-strong grid h-full w-11 place-items-center [&_svg]:size-[14px]"
              >
                <MinusIcon />
              </button>
              <output
                className="num w-5 text-center text-[14px] font-semibold"
                aria-label={t("sheet.quantity")}
              >
                {count}
              </output>
              <button
                type="button"
                aria-label={t("sheet.increase")}
                disabled={count >= MAX_QUANTITY}
                onClick={() => setCount((c) => Math.min(MAX_QUANTITY, c + 1))}
                className="text-ink grid h-full w-11 place-items-center [&_svg]:size-[14px]"
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
            className={`${styles.addBtn} rounded-guest-md flex h-11 min-w-0 flex-1 items-center justify-center gap-1.5 text-[14px] font-semibold`}
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
