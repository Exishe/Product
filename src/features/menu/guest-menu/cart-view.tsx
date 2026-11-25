"use client";

import type { ReactNode } from "react";
import type { CartSummary } from "@/features/ordering/cart";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import type { WaitRange } from "./hints";
import { LineRow } from "./line-row";
import { BackIcon } from "./ui";
import type { GuestItem } from "./view-model";

// "Your order": lines with options, notes and steppers, the total, a line
// about paying the waiter, and the send area (the button, or why ordering is
// off right now).
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
    <main className="mx-auto w-full max-w-[720px] flex-1 px-4 pb-12 md:px-8" data-testid="cart">
      <div className="flex items-center gap-2 pt-2 md:pt-5">
        <button
          type="button"
          onClick={onBack}
          aria-label={t("cart.back")}
          className="text-ink hover:bg-chip grid size-11 flex-none place-items-center rounded-full"
        >
          <BackIcon />
        </button>
        <h2 className="display-face text-[1.125rem] leading-[1.2]">{t("cart.title")}</h2>
      </div>
      <ul className="bg-surface rounded-card mt-2 border [border-color:var(--guest-card-border)] px-3.5">
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
      <div className="flex items-baseline justify-between px-1 pt-4 pb-3">
        <span className="text-[14px]">{t("cart.total")}</span>
        <span className="num text-[18px] font-semibold" data-testid="cart-total">
          {formatAmd(summary.total, locale)}
        </span>
      </div>
      <div className="bg-chip text-muted mb-4 grid gap-1.5 rounded-[12px] px-3.5 py-3 text-[12px] leading-snug">
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
