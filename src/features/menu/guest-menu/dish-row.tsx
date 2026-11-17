"use client";

import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import { PlusIcon, TagChip, Txt, dishPhotoUrl } from "./ui";
import type { GuestItem } from "./view-model";

// One dish as a line of a printed menu: name, dotted leader and price, a line
// or two of description, portion and tag chips. On the right, the photo (when
// the café added one) with the round noir "+" on its corner, so a dish takes
// one compact row. From 768 px the rows stand in two columns.
export function DishRow({
  item,
  canOrder,
  onOpen,
  onQuickAdd,
}: {
  item: GuestItem;
  canOrder: boolean;
  onOpen: (item: GuestItem) => void;
  onQuickAdd: (item: GuestItem) => void;
}) {
  const { t, locale } = useGuestI18n();
  const needsChoice = item.groups.some((g) => g.min > 0);
  const muted = item.soldOut ? "text-muted" : "";
  const showAdd = canOrder && !item.soldOut;
  const hasFacts = item.portion !== null || item.tags.length > 0;
  return (
    <li
      className="border-line flex items-center gap-4 border-b py-4"
      data-testid="dish"
      data-dish-id={item.id}
    >
      <button
        type="button"
        className="block min-w-0 flex-1 text-left disabled:cursor-default"
        disabled={item.soldOut}
        onClick={() => onOpen(item)}
      >
        <span className="flex items-baseline gap-1.5">
          <Txt
            value={item.name}
            locale={locale}
            className={`display-face min-w-0 text-[1.375rem] leading-[1.15] [overflow-wrap:anywhere] ${muted}`}
          />
          <span
            aria-hidden="true"
            className="border-champagne/55 min-w-4 flex-1 -translate-y-[0.3em] border-b border-dotted"
          />
          <span className={`num font-semibold tracking-tight whitespace-nowrap ${muted}`}>
            {formatAmd(item.price, locale)}
          </span>
        </span>
        {item.description && (
          <Txt
            value={item.description}
            locale={locale}
            as="span"
            className="text-muted mt-0.5 line-clamp-2 block text-sm"
          />
        )}
        {(hasFacts || item.soldOut) && (
          <span className="text-muted mt-1.5 flex flex-wrap items-center gap-1.5 text-sm">
            {item.soldOut && <span className="text-pomegranate font-semibold">{t("menu.soldOut")}</span>}
            {item.portion && (
              <span>{t(`menu.units.${item.portion.unit}`, { amount: item.portion.amount })}</span>
            )}
            {item.tags.map((tag) => (
              <TagChip key={tag} tag={tag} label={t(`menu.tags.${tag}`)} />
            ))}
          </span>
        )}
      </button>
      {(item.image || showAdd) && (
        <div className="relative flex-none">
          {item.image && (
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              disabled={item.soldOut}
              onClick={() => onOpen(item)}
              className="block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- public Storage URL, already sized webp */}
              <img
                src={dishPhotoUrl(item.image)}
                alt=""
                width={88}
                height={88}
                loading="lazy"
                decoding="async"
                className={`bg-mist ring-line size-[88px] rounded-xl object-cover ring-1 md:size-24 ${item.soldOut ? "opacity-50 grayscale" : ""}`}
              />
            </button>
          )}
          {showAdd && (
            <button
              type="button"
              className={`bg-noir text-champagne-light grid size-12 place-items-center rounded-full shadow-[0_4px_12px_-4px_color-mix(in_srgb,var(--guest-noir)_50%,transparent)] transition-transform active:scale-90 ${
                item.image ? "ring-matsoni absolute -right-1.5 -bottom-1.5 ring-4" : ""
              }`}
              aria-label={t("menu.add", { name: item.name.text })}
              aria-haspopup={needsChoice ? "dialog" : undefined}
              onClick={() => (needsChoice ? onOpen(item) : onQuickAdd(item))}
            >
              <PlusIcon />
            </button>
          )}
        </div>
      )}
    </li>
  );
}
