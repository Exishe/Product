"use client";

import type { CartSummary } from "@/features/ordering/cart";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import styles from "./guest.module.css";
import { Plate, dishPhotoUrl } from "./ui";
import type { GuestItem } from "./view-model";

// The main action on the menu: "View order", with the chosen dishes' plates,
// the count and the total. On phones and tablets it sits on the bottom bar;
// a desktop has the order rail instead (order-rail.tsx). It appears when the first dish goes
// in, with one sweep of light round its edge (.ready), then rests plain.
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
    .map((p) => items[p.line.itemId])
    .filter((i): i is GuestItem => Boolean(i));
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`${styles.cta} ${styles.ready} shadow-float pointer-events-auto flex min-h-14 w-full items-center gap-3 py-2 pr-5 text-left font-semibold ${plates.length ? "pl-2.5" : "pl-6"} ${className}`}
    >
      <span aria-hidden="true" className="flex flex-none -space-x-3">
        {plates.map((i) => (
          <Plate
            key={i.id}
            src={i.image ? dishPhotoUrl(i.image) : null}
            size={40}
            className="size-10 ring-2 ring-[var(--guest-on-accent)]"
          />
        ))}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        {t("menu.viewOrder")}
        <small className="text-sm font-normal opacity-80">{t("menu.items", { count: summary.count })}</small>
      </span>
      <span className="num text-lg whitespace-nowrap">{formatAmd(summary.total, locale)}</span>
    </button>
  );
}
