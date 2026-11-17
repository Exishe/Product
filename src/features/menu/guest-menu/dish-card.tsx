"use client";

import { useRef } from "react";
import { useTilt } from "@/features/guest-theme/motion/tilt";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import { PlusIcon, Plate, TagChip, Txt, dishPhotoUrl } from "./ui";
import type { GuestItem } from "./view-model";

// One dish as a card (owner's pick, menu-layout.webp): the dish on a round
// plate, its name in the display face, the price, portion and tags, and a
// round "+" hanging off the card's corner. The whole card opens the dish
// sheet (a stretched button); "+" adds a simple dish at once, or opens the
// sheet when there's a choice to make. A featured dish (popular, with a
// photo) spans the row, its plate bleeding off the card's edge. Cards tilt
// towards the pointer or finger (Tilted Card).
export function DishCard({
  item,
  canOrder,
  featured = false,
  onOpen,
  onQuickAdd,
}: {
  item: GuestItem;
  canOrder: boolean;
  featured?: boolean;
  onOpen: (item: GuestItem) => void;
  onQuickAdd: (item: GuestItem, from: HTMLElement) => void;
}) {
  const { t, locale } = useGuestI18n();
  const card = useRef<HTMLElement>(null);
  useTilt(card, featured ? { max: 5, scale: 1.01 } : undefined);
  const needsChoice = item.groups.some((g) => g.min > 0);
  const showAdd = canOrder && !item.soldOut;
  const photo = item.image ? dishPhotoUrl(item.image) : null;
  const muted = item.soldOut ? "text-muted" : "";

  const facts = (
    <span className={`text-muted flex flex-wrap items-center gap-1.5 text-[0.8125rem] ${featured ? "" : "justify-center"}`}>
      {item.soldOut && <span className="text-alert font-semibold">{t("menu.soldOut")}</span>}
      {item.portion && <span>{t(`menu.units.${item.portion.unit}`, { amount: item.portion.amount })}</span>}
      {item.tags.map((tag) => (
        <TagChip key={tag} tag={tag} label={t(`menu.tags.${tag}`)} />
      ))}
    </span>
  );
  const price = (
    <span className={`num text-accent-text text-[1.0625rem] font-semibold whitespace-nowrap ${muted}`}>
      {formatAmd(item.price, locale)}
    </span>
  );

  return (
    <li
      className={featured ? "col-span-full" : "min-w-0"}
      data-testid="dish"
      data-dish-id={item.id}
      data-featured={featured || undefined}
    >
      <article
        ref={card}
        className={`group bg-surface text-ink shadow-card relative h-full border [border-color:var(--guest-card-border)] will-change-transform ${
          featured ? "rounded-feature overflow-hidden" : "rounded-card"
        }`}
      >
        <button
          type="button"
          disabled={item.soldOut}
          onClick={() => onOpen(item)}
          className={`block h-full w-full rounded-[inherit] text-left disabled:cursor-default ${
            featured ? "min-h-[15rem] p-5 pr-[44%] sm:min-h-[17rem] sm:p-7 sm:pr-[42%]" : "px-3 pt-4 pb-6 text-center sm:px-4"
          }`}
        >
          {featured ? (
            <>
              <Plate
                src={photo}
                name={item.name.text}
                size={360}
                muted={item.soldOut}
                className="pointer-events-none absolute top-[-14%] right-[-16%] w-[60%] max-w-[22rem] sm:top-[-18%] sm:right-[-10%] sm:w-[48%]"
              />
              <Txt
                value={item.name}
                locale={locale}
                className={`display-face block text-[1.75rem] leading-[1.05] [overflow-wrap:anywhere] sm:text-[2.25rem] ${muted}`}
              />
              <span className="mt-2 block">{facts}</span>
              {item.description && (
                <Txt value={item.description} locale={locale} className="text-muted mt-3 line-clamp-3 block text-sm" />
              )}
              <span className="mt-4 block pr-12">{price}</span>
            </>
          ) : (
            <>
              <Plate src={photo} name={item.name.text} size={240} muted={item.soldOut} className="mx-auto block w-[74%] max-w-[10.5rem]" />
              <Txt
                value={item.name}
                locale={locale}
                className={`display-face mt-3 block text-[1.1875rem] leading-[1.12] [overflow-wrap:anywhere] sm:text-[1.3125rem] ${muted}`}
              />
              <span className="mt-1 block">{price}</span>
              {(item.portion || item.tags.length > 0 || item.soldOut) && <span className="mt-1.5 block">{facts}</span>}
            </>
          )}
        </button>
        {showAdd && (
          <button
            type="button"
            className={`bg-accent text-on-accent ring-page absolute z-10 grid size-12 place-items-center rounded-full ring-4 active:scale-90 ${
              featured ? "right-4 bottom-4 sm:right-6 sm:bottom-6" : "-right-2 -bottom-3"
            }`}
            aria-label={t("menu.add", { name: item.name.text })}
            aria-haspopup={needsChoice ? "dialog" : undefined}
            onClick={(e) => (needsChoice ? onOpen(item) : onQuickAdd(item, e.currentTarget))}
          >
            <PlusIcon />
          </button>
        )}
      </article>
    </li>
  );
}
