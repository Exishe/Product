"use client";

import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import styles from "./guest.module.css";
import { PlusIcon, TagChip, Txt, dishPhotoUrl } from "./ui";
import { sizesOf, type GuestItem } from "./view-model";

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
}: {
  item: GuestItem;
  canOrder: boolean;
  /** The large photo-top card on a phone as well. */
  feature?: boolean;
  /** What the guest's allergy filter says about this dish, if anything. */
  warning?: { text: string; strong: boolean } | null;
  onOpen: (item: GuestItem) => void;
  onQuickAdd: (item: GuestItem, from: HTMLElement) => void;
}) {
  const { t, locale } = useGuestI18n();
  const needsChoice = item.groups.some((g) => g.min > 0);
  const muted = item.soldOut ? "text-muted" : "";
  const sizes = sizesOf(item);
  const photo = Boolean(item.image);
  const popular = item.tags.includes("popular");
  return (
    <li
      className="bg-surface rounded-card relative flex border [border-color:var(--guest-card-border)]"
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
                ? "aspect-[4/3] w-full"
                : "max-md:min-h-[7rem] max-md:w-28 max-md:self-stretch md:aspect-[4/3] md:w-full"
            }`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp */}
            <img
              src={dishPhotoUrl(item.image)}
              alt=""
              width={600}
              height={450}
              loading="lazy"
              className={`absolute inset-0 size-full object-cover ${item.soldOut ? "opacity-50 grayscale" : ""}`}
            />
            {popular && (
              <span className="bg-accent text-on-accent absolute top-2 left-2 rounded-[6px] px-1.5 py-1 text-[10px] leading-none font-semibold">
                {t("menu.tags.popular")}
              </span>
            )}
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col px-3 pt-2.5 pb-2">
          <Txt
            value={item.name}
            locale={locale}
            className={`min-w-0 text-[13px] leading-[1.3] font-semibold break-words hyphens-auto ${muted}`}
          />
          {sizes.length > 0 && (
            <span className={`mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] ${muted}`} data-testid="sizes">
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
            <span className={`mt-1 block text-[11px] font-semibold ${warning.strong ? "text-alert" : "text-muted"}`}>
              {warning.text}
            </span>
          )}
          <span className={`mt-auto flex min-h-11 items-center pt-1 ${canOrder && !item.soldOut ? "pr-10" : ""}`}>
            {sizes.length === 0 && (
              <span className={`num text-accent-text text-[13px] font-semibold whitespace-nowrap ${muted}`}>
                {formatAmd(item.price, locale)}
              </span>
            )}
          </span>
        </span>
      </button>
      {canOrder && !item.soldOut && (
        <button
          type="button"
          aria-label={t("menu.add", { name: item.name.text })}
          aria-haspopup={needsChoice ? "dialog" : undefined}
          onClick={(e) => (needsChoice ? onOpen(item) : onQuickAdd(item, e.currentTarget))}
          className={`${styles.hit} absolute right-1 bottom-1`}
        >
          <span className={styles.plus}>
            <PlusIcon />
          </span>
        </button>
      )}
    </li>
  );
}
