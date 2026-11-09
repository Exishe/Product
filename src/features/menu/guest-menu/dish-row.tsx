"use client";

import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import { PlusIcon, Txt } from "./ui";
import type { GuestItem } from "./view-model";

// One dish as a line of a printed menu: name, dotted leader, price, a line of
// description, portion and tags, and the round apricot "+" (design/guest.html).
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
    <li className="grid grid-cols-1 gap-0.5 border-b border-line py-3" data-testid="dish" data-dish-id={item.id}>
      <button
        type="button"
        className="block min-w-0 text-left disabled:cursor-default"
        disabled={item.soldOut}
        onClick={() => onOpen(item)}
      >
        <span className="flex items-baseline gap-1.5">
          <Txt
            value={item.name}
            locale={locale}
            className={`display-face min-w-0 text-2xl leading-[1.15] [overflow-wrap:anywhere] ${muted}`}
          />
          <span aria-hidden="true" className="min-w-4 flex-1 -translate-y-[0.3em] border-b-2 border-dotted border-line-strong" />
          <span className={`num font-semibold whitespace-nowrap ${muted}`}>{formatAmd(item.price, locale)}</span>
        </span>
        {item.description && (
          <Txt value={item.description} locale={locale} as="span" className="mt-0.5 block max-w-[34ch] text-sm text-muted" />
        )}
      </button>
      <div
        className={`flex items-center justify-between gap-2 ${showAdd ? "min-h-12" : "mt-1"}`}
        hidden={!showAdd && !hasFacts && !item.soldOut}
      >
        <span className="flex flex-wrap gap-x-2 text-sm text-muted">
          {item.portion && <span>{t(`menu.units.${item.portion.unit}`, { amount: item.portion.amount })}</span>}
          {item.tags.map((tag) => (
            <span key={tag} className="font-semibold text-tarragon">
              {t(`menu.tags.${tag}`)}
            </span>
          ))}
        </span>
        {item.soldOut ? (
          <span className="text-sm font-semibold text-pomegranate">{t("menu.soldOut")}</span>
        ) : (
          showAdd && (
            <button
              type="button"
              className="grid size-12 flex-none place-items-center rounded-full bg-apricot text-ink active:bg-apricot-deep"
              aria-label={t("menu.add", { name: item.name.text })}
              aria-haspopup={needsChoice ? "dialog" : undefined}
              onClick={() => (needsChoice ? onOpen(item) : onQuickAdd(item))}
            >
              <PlusIcon />
            </button>
          )
        )}
      </div>
    </li>
  );
}
