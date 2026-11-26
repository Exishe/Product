"use client";

import type { ReactNode } from "react";
import type { CartSummary } from "@/features/ordering/cart";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import { LineRow } from "./line-row";
import styles from "./guest.module.css";
import type { GuestItem } from "./view-model";

// "Your order" beside the menu on a desktop (the approved Desktop board): a
// rail that stays in view with the title in the display face, each chosen
// dish as a line (name, what tells it apart, price, − n +), the total, and
// the send area itself, so a desktop guest orders without leaving the menu.
// One primary action, «Send to the kitchen · total»; the full order view is
// a quiet link beside the title. On the page, not in a box (ADR-095). Under the total a "goes well with" idea
// when there is one. Below it the two things the phone keeps on its bottom
// bar, as plain 48 px rows on hairlines: the waiter and «Track your order». A dish added on a desktop flies here (fly.ts)
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
  ideas,
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
  /** A "goes well with" idea under the total (suggestions.tsx). */
  ideas?: ReactNode;
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
      className="hidden max-h-[calc(100dvh-8rem)] flex-col pb-4 lg:flex"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="order-panel-title" data-fly-bump="" className="display-face text-heading leading-[1.2]">
          {t("cart.title")}
        </h2>
        {summary.lines.length > 0 && (
          <button
            type="button"
            onClick={onOpen}
            className="text-accent-text min-h-11 text-label font-semibold whitespace-nowrap underline-offset-4 hover:underline"
          >
            {t("menu.viewOrder")}
            {/* Its full name, as on the phone's bar: "View order, N items, total". */}
            <span className="sr-only">
              {countLabel}
              <span className="num">{formatAmd(summary.total, locale)}</span>
            </span>
          </button>
        )}
      </div>
      {summary.lines.length === 0 ? (
        <p className="text-muted mt-2 text-body leading-[1.45]">{t("panel.empty")}</p>
      ) : (
        <>
          <ul className="mt-1 min-h-0 flex-1 overflow-y-auto">
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
            <span className="text-body">{t("cart.total")}</span>
            <span className="num text-heading font-bold" data-testid="rail-total">
              {formatAmd(summary.total, locale)}
            </span>
          </div>
          <p className="text-muted mt-1 mb-3 text-label">{t("cart.payNote")}</p>
          {send ?? (
            <button
              type="button"
              onClick={onOpen}
              className={`${styles.cta} flex min-h-14 w-full items-center justify-center px-5 font-semibold`}
            >
              {t("menu.viewOrder")}
            </button>
          )}
          {ideas && <div className="border-line mt-3 border-t pt-1 empty:hidden">{ideas}</div>}
        </>
      )}
      {below && <div className="border-line mt-3 grid border-t pt-1">{below}</div>}
    </aside>
  );
}
