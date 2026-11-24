"use client";

import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import styles from "./guest.module.css";
import { PlusIcon, TagChip, Txt, dishPhotoUrl } from "./ui";
import { sizesOf, type GuestItem } from "./view-model";

// One dish as a line of a printed menu: the name in the display face with
// its price on the right, the portion and tags, two lines of description, and
// a round "+". Used for sections with few or no photos (a bar list, a wine
// card), where a grid of empty plates would only repeat the same picture; a
// dish that does have a photo shows it as a small plate at the start of its
// line. The line opens the dish sheet; "+" adds a simple dish at once or
// opens the sheet when there is a choice to make.
//
// Like a wine card: a dish sold in two or three sizes (glass and bottle,
// standard and mini) lists each size with its price on one line instead of
// one price on the right, and a wine's description («grape / region,
// country») is set as the region in small capitals over the grape.
export function DishRow({
  item,
  canOrder,
  warning,
  onOpen,
  onQuickAdd,
}: {
  item: GuestItem;
  canOrder: boolean;
  /** What the guest's allergy filter says about this dish, if anything. */
  warning?: { text: string; strong: boolean } | null;
  onOpen: (item: GuestItem) => void;
  onQuickAdd: (item: GuestItem, from: HTMLElement) => void;
}) {
  const { t, locale } = useGuestI18n();
  const needsChoice = item.groups.some((g) => g.min > 0);
  const muted = item.soldOut ? "text-muted" : "";
  const sizes = sizesOf(item);
  // A dish with a photo shows it as a rounded square at the start of its card;
  // one without stays a plain line.
  const photo = Boolean(item.image);
  const price = (
    <span className={`num text-accent-text flex-none font-semibold whitespace-nowrap ${muted}`}>
      {formatAmd(item.price, locale)}
    </span>
  );
  return (
    <li
      className={`bg-surface shadow-card rounded-card relative flex items-start gap-3 border [border-color:var(--guest-card-border)] ${
        photo ? "p-3" : "p-4"
      }`}
      data-testid="dish"
      data-dish-id={item.id}
      data-layout="row"
      data-warning={warning ? (warning.strong ? "contains" : "unknown") : undefined}
    >
      <button
        type="button"
        disabled={item.soldOut}
        onClick={() => onOpen(item)}
        className="flex min-h-11 min-w-0 flex-1 items-start gap-3 self-stretch rounded-[0.5rem] text-left disabled:cursor-default"
      >
        {item.image && (
          <span className="bg-plate block size-24 flex-none overflow-hidden rounded-[0.875rem]">
            {/* eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp */}
            <img
              src={dishPhotoUrl(item.image)}
              alt=""
              width={400}
              height={300}
              loading="lazy"
              className={`size-full object-cover ${item.soldOut ? "opacity-50 grayscale" : ""}`}
            />
          </span>
        )}
        <span className="block min-w-0 flex-1">
          <span className="flex items-baseline gap-3">
            <Txt
              value={item.name}
              locale={locale}
              className={`display-face min-w-0 flex-1 text-[1.0625rem] leading-[1.2] break-words hyphens-auto ${muted}`}
            />
            {sizes.length === 0 && price}
          </span>
          {sizes.length > 0 && (
            <span
              className={`text-accent-text mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-[0.9375rem] ${muted}`}
              data-testid="sizes"
            >
              {sizes.map((s) => (
                <span key={s.id} className="whitespace-nowrap">
                  <Txt value={s.name} locale={locale} className="text-muted" />{" "}
                  <span className="num font-semibold">{formatAmd(s.price, locale)}</span>
                </span>
              ))}
            </span>
          )}
          {(item.soldOut || item.portion || item.tags.length > 0) && (
            <span className="text-muted mt-1 flex flex-wrap items-center gap-1.5 text-[0.8125rem]">
              {item.soldOut && <span className="text-alert font-semibold">{t("menu.soldOut")}</span>}
              {item.portion && (
                <span>{t(`menu.units.${item.portion.unit}`, { amount: item.portion.amount })}</span>
              )}
              {item.tags.map((tag) => (
                <TagChip key={tag} tag={tag} label={t(`menu.tags.${tag}`)} />
              ))}
            </span>
          )}
          {item.origin ? (
            // Latin on every page: wine names and regions are not translated.
            <span className="text-muted mt-1 block text-[0.875rem] leading-snug break-words" lang="en">
              <span className="block text-[0.75rem] font-semibold tracking-[0.08em] uppercase">
                {item.origin.region}
              </span>
              <span className="block">{item.origin.grape}</span>
            </span>
          ) : (
            item.description && (
              <Txt
                value={item.description}
                locale={locale}
                className="text-muted mt-1 line-clamp-2 block text-[0.875rem] leading-snug break-words"
              />
            )
          )}
          {warning && (
            <span
              className={`mt-1.5 block text-[0.8125rem] font-semibold ${warning.strong ? "text-alert" : "text-muted"}`}
            >
              {warning.text}
            </span>
          )}
        </span>
      </button>
      {canOrder && !item.soldOut && (
        <button
          type="button"
          aria-label={t("menu.add", { name: item.name.text })}
          aria-haspopup={needsChoice ? "dialog" : undefined}
          onClick={(e) => (needsChoice ? onOpen(item) : onQuickAdd(item, e.currentTarget))}
          className={styles.plus}
        >
          <PlusIcon />
        </button>
      )}
    </li>
  );
}
