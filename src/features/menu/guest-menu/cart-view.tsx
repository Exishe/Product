"use client";

import type { ReactNode } from "react";
import type { CartSummary } from "@/features/ordering/cart";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import { DOCK_SPACE } from "./guest-dock";
import type { WaitRange } from "./hints";
import { LineRow } from "./line-row";
import { BackIcon, ORDER_COLUMN } from "./ui";
import type { GuestItem } from "./view-model";

// "Your order" (ADR-094 area pass, benchmark §2.3): everything on the page's
// 16 px edge, no box around the lines. The status page's column (ORDER_COLUMN),
// and the bar above sits on the same column (guest-menu.tsx), so the café's
// name, the title, the lines and the button share one left edge. A 44 px back and the 28 px title on one
// row; the lines on hairlines, each the same grid (a 56 px photo column only
// when the dish has a photo); the total at 24 px; the usual wait and how
// paying works as two quiet lines; then the one action, «Send to the kitchen
// · total», 56 px. The bottom tabs stay (guest-menu.tsx).
export function CartView({
  summary,
  items,
  ambiguous,
  locked,
  notice,
  footer,
  wait = null,
  onQuantity,
  onBack,
}: {
  summary: CartSummary;
  items: Record<string, GuestItem>;
  /** Dishes that share a name with another dish (view-model sameNamed). */
  ambiguous: ReadonlySet<string>;
  locked: boolean;
  notice: ReactNode;
  footer: ReactNode;
  /** The café's usual wait (ADR-060), when it has enough rounds to say. */
  wait?: WaitRange | null;
  onQuantity: (id: string, quantity: number) => void;
  onBack: () => void;
}) {
  const { t, locale } = useGuestI18n();
  return (
    <main className={`mx-auto w-full ${ORDER_COLUMN} flex-1 px-4 md:px-8 ${DOCK_SPACE}`} data-testid="cart">
      <div className="-ml-3 flex items-center gap-1 pt-2 md:pt-5">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("cart.back")}
          className="text-ink hover:bg-chip grid size-11 flex-none place-items-center rounded-full"
        >
          <BackIcon />
        </button>
        <h2 className="display-face text-large leading-[1.15]">{t("cart.title")}</h2>
      </div>
      <ul className="mt-2">
        {summary.lines.map((p) => (
          <LineRow
            key={p.line.id}
            priced={p}
            item={items[p.line.itemId]}
            detail={ambiguous.has(p.line.itemId)}
            locked={locked}
            onQuantity={onQuantity}
          />
        ))}
      </ul>
      <div className="border-line flex items-baseline justify-between border-t pt-4 pb-2">
        <span className="text-name font-semibold">{t("cart.total")}</span>
        <span className="num text-headline font-bold" data-testid="cart-total">
          {formatAmd(summary.total, locale)}
        </span>
      </div>
      <div className="text-muted mb-5 grid gap-0.5 text-label leading-[1.45]">
        {wait && (
          <span className="text-ink block font-semibold" data-testid="cart-wait">
            {t(wait.low === wait.high ? "wait.usualOne" : "wait.usual", wait)}
          </span>
        )}
        <span>{t("cart.payNote")}</span>
      </div>
      {notice && <div className="mb-4">{notice}</div>}
      {footer}
    </main>
  );
}
