"use client";

import type { CartSummary } from "@/features/ordering/cart";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import styles from "./guest.module.css";
import { Plate, dishPhotoUrl, initial } from "./ui";
import type { GuestItem } from "./view-model";

// The main action on the menu: "View order", with the chosen dishes' plates,
// the count and the total, 56 px tall. On phones and tablets it sits inside
// the bottom panel, right on the tabs (guest-dock.tsx); a desktop has the
// order rail instead (order-rail.tsx). A line without a photo gets a plain
// disc with the dish's first letter, as in the order list (line-row.tsx); the
// only count is «N dishes» beside them. It appears when the
// first dish goes in, with one sweep of light round its edge (.ready), then
// rests plain.
export function CartBar({
  summary,
  items,
  onOpen,
  plates: showPlates = true,
  className = "",
}: {
  summary: CartSummary;
  items: Record<string, GuestItem>;
  onOpen: () => void;
  /** The order panel lists the plates itself. */
  plates?: boolean;
  className?: string;
}) {
  const { t, locale } = useGuestI18n();
  const plates = (showPlates ? summary.lines : [])
    .slice(-3)
    .flatMap((p) => {
      const item = items[p.line.itemId];
      return item ? [{ item, line: p.line }] : [];
    });
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${styles.cta} ${styles.ready} pointer-events-auto flex min-h-14 w-full items-center gap-3 py-1.5 pr-5 text-left text-body font-semibold ${plates.length ? "pl-2" : "pl-5"} ${className}`}
    >
      <span aria-hidden="true" className="flex flex-none -space-x-3">
        {plates.map(({ item, line }) =>
          item.image ? (
            <Plate
              key={line.id}
              src={dishPhotoUrl(item.image)}
              size={36}
              className="size-9 ring-2 ring-[var(--guest-add)]"
            />
          ) : (
            <span
              key={line.id}
              className="bg-chip text-muted display-face grid size-9 place-items-center rounded-full text-name leading-none ring-2 ring-[var(--guest-add)]"
            >
              {initial(item.name.text, locale)}
            </span>
          ),
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        {t("menu.viewOrder")}
        <small className="text-meta font-normal opacity-80">
          {t("menu.items", { count: summary.count })}
        </small>
      </span>
      <span className="num text-body whitespace-nowrap">{formatAmd(summary.total, locale)}</span>
    </button>
  );
}
