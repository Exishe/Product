"use client";

import type { ReactNode } from "react";
import type { CartSummary } from "@/features/ordering/cart";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import { LineRow } from "./cart-view";
import styles from "./guest.module.css";
import type { GuestItem } from "./view-model";

// "Your order" beside the menu on a desktop (the approved Desktop board): a
// rail that stays in view with the title in the display face, each chosen
// dish as a line (name, what tells it apart, price, − n +), the total, and
// the send area itself, so a desktop guest orders without leaving the menu.
// Below it the two things the phone keeps on its bottom bar: call the waiter
// and the orders already sent. A dish added on a desktop flies here (fly.ts)
// and the heading bounces as it lands. Its own file: fetched only where the
// rail is on screen (1024 px and up), never on a phone.
export function OrderRail({
  summary,
  items,
  ambiguous,
  locked,
  onQuantity,
  onOpen,
  send,
  below,
}: {
  summary: CartSummary;
  items: Record<string, GuestItem>;
  /** Dishes that share a name with another dish (view-model sameNamed). */
  ambiguous: ReadonlySet<string>;
  locked: boolean;
  onQuantity: (lineId: string, quantity: number) => void;
  /** The full order view (notes, why ordering is off). */
  onOpen: () => void;
  /** The send area (OrderSender) when this table can order. */
  send: ReactNode;
  /** Quiet actions under the order: the waiter, the orders already sent. */
  below?: ReactNode;
}) {
  const { t, locale } = useGuestI18n();
  // The rest of the button's name, after "View order" (hidden words).
  const countLabel = `, ${t("menu.items", { count: summary.count })}, `;
  return (
    <aside
      aria-labelledby="order-panel-title"
      data-fly-target="1"
      data-testid="order-rail"
      className="bg-surface rounded-card hidden max-h-[calc(100dvh-12rem)] flex-col border [border-color:var(--guest-card-border)] px-4 pt-4 pb-4 lg:flex"
    >
      <h2 id="order-panel-title" data-fly-bump="" className="display-face text-[1rem] leading-[1.2]">
        {t("cart.title")}
      </h2>
      {summary.lines.length === 0 ? (
        <p className="text-muted mt-2 text-[13px] leading-relaxed">{t("panel.empty")}</p>
      ) : (
        <>
          <ul className="-mx-4 mt-2 min-h-0 flex-1 overflow-y-auto px-4">
            {summary.lines.map((p) => (
              <LineRow
                key={p.line.id}
                priced={p}
                item={items[p.line.itemId]}
                detail={ambiguous.has(p.line.itemId)}
                locked={locked}
                dense
                onQuantity={onQuantity}
              />
            ))}
          </ul>
          <div className="border-line flex items-baseline justify-between gap-3 border-t pt-3">
            <span className="text-muted text-[13px]">{t("cart.total")}</span>
            <span className="num text-[16px] font-semibold" data-testid="rail-total">
              {formatAmd(summary.total, locale)}
            </span>
          </div>
          <p className="text-muted mt-1 mb-3 text-[12px]">{t("cart.payNote")}</p>
          {send}
          <button
            type="button"
            onClick={onOpen}
            className={
              send
                ? "text-accent-text mt-1 min-h-11 text-[13px] font-semibold"
                : `${styles.cta} flex min-h-12 w-full items-center justify-center px-5 font-semibold`
            }
          >
            {t("menu.viewOrder")}
            {/* Its full name, as on the phone's bar: "View order, N items, total". */}
            <span className="sr-only">
              {countLabel}
              <span className="num">{formatAmd(summary.total, locale)}</span>
            </span>
          </button>
        </>
      )}
      {below && <div className="border-line mt-3 grid gap-2 border-t pt-3">{below}</div>}
    </aside>
  );
}
