"use client";

import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import { Plate, PlusIcon, TagChip, Txt, dishPhotoUrl } from "./ui";
import type { GuestItem } from "./view-model";

// One dish as a line of a printed menu: the name in the display face with
// its price on the right, the portion and tags, two lines of description, and
// a round "+". Used for sections with few or no photos (a bar list, a wine
// card), where a grid of empty plates would only repeat the same picture; a
// dish that does have a photo shows it as a small plate at the start of its
// line. The line opens the dish sheet; "+" adds a simple dish at once or
// opens the sheet when there is a choice to make.
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
  return (
    <li
      className="relative flex break-inside-avoid items-start gap-3 border-b [border-color:color-mix(in_srgb,var(--guest-line-strong)_35%,transparent)] py-4 last:border-b-0"
      data-testid="dish"
      data-dish-id={item.id}
      data-layout="row"
      data-warning={warning ? (warning.strong ? "contains" : "unknown") : undefined}
    >
      <button
        type="button"
        disabled={item.soldOut}
        onClick={() => onOpen(item)}
        className="flex min-w-0 flex-1 items-start gap-3 rounded-[0.5rem] text-left disabled:cursor-default"
      >
        {item.image && (
          <Plate
            src={dishPhotoUrl(item.image)}
            size={64}
            muted={item.soldOut}
            className="size-16 flex-none"
          />
        )}
        <span className="block min-w-0 flex-1">
          <span className="flex items-baseline gap-3">
            <Txt
              value={item.name}
              locale={locale}
              className={`display-face min-w-0 flex-1 text-[1.3125rem] leading-[1.15] break-words hyphens-auto ${muted}`}
            />
            <span className={`num text-accent-text flex-none font-semibold whitespace-nowrap ${muted}`}>
              {formatAmd(item.price, locale)}
            </span>
          </span>
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
          {item.description && (
            <Txt
              value={item.description}
              locale={locale}
              className="text-muted mt-1 line-clamp-2 block text-[0.875rem] leading-snug break-words"
            />
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
          className="text-ink hover:bg-chip grid size-11 flex-none place-items-center rounded-full border [border-color:color-mix(in_srgb,var(--guest-line-strong)_60%,transparent)] [&_svg]:size-[18px]"
        >
          <PlusIcon />
        </button>
      )}
    </li>
  );
}
