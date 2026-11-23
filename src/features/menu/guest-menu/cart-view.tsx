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
      <div className="pt-3 md:pt-6">
        <button
          type="button"
          onClick={onBack}
          className="text-ink inline-flex min-h-12 items-center gap-3 font-semibold"
        >
          <span
            aria-hidden="true"
            className="bg-surface shadow-card grid size-12 place-items-center rounded-full"
          >
            <BackIcon />
          </span>
          {t("cart.back")}
        </button>
      </div>
      <h2 className="display-face mt-4 mb-1 text-[3rem] leading-[1.02] md:text-[4rem]">{t("cart.title")}</h2>
      <ul className="rounded-feature bg-surface shadow-card mt-5 border [border-color:var(--guest-card-border)] px-4 sm:px-6">
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
      <div className="flex items-baseline justify-between px-1 pt-6 pb-4 text-2xl font-semibold">
        <span className="display-face text-[1.75rem]">{t("cart.total")}</span>
        <span className="num" data-testid="cart-total">
          {formatAmd(summary.total, locale)}
        </span>
      </div>
      <p className="text-muted mb-4 text-sm">
        {wait && (
          <span className="text-ink block font-semibold" data-testid="cart-wait">
            {t(wait.low === wait.high ? "wait.usualOne" : "wait.usual", wait)}
          </span>
        )}
        {t("cart.payNote")}
      </p>
      {notice && <div className="mb-4">{notice}</div>}
      {footer}
    </main>
  );
}
