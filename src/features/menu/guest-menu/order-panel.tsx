"use client";

import type { ReactNode } from "react";
import { MAX_QUANTITY, type CartSummary } from "@/features/ordering/cart";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import styles from "./guest.module.css";
import { MinusIcon, Plate, PlusIcon, STEP, Txt, dishPhotoUrl } from "./ui";
import type { GuestItem } from "./view-model";

// The main action on the menu: "View order", with the chosen dishes' plates,
// the count and the total. On phones and tablets it sits on the bottom bar;
// on a desktop it ends the order panel. It appears when the first dish goes
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

// "Your order" beside the menu on a desktop (the approved Desktop board): a
// rail that stays in view with the title in the display face, each chosen
// dish as a line (name, what tells it apart, price, − n +), the total, and
// the send area itself, so a desktop guest orders without leaving the menu.
// Below it the two things the phone keeps on its bottom bar: call the waiter
// and the orders already sent. A dish added on a desktop flies here (fly.ts)
// and the heading bounces as it lands.
export function OrderPanel({
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
  return (
    <aside
      aria-labelledby="order-panel-title"
      data-fly-target="1"
      data-testid="order-rail"
      className="bg-surface shadow-card rounded-feature hidden max-h-[calc(100dvh-10rem)] flex-col border [border-color:var(--guest-card-border)] px-5 pt-6 pb-5 lg:flex"
    >
      <h2 id="order-panel-title" data-fly-bump="" className="display-face text-[1.875rem] leading-[1.05]">
        {t("cart.title")}
      </h2>
      {summary.lines.length === 0 ? (
        <p className="text-muted mt-3 text-[0.875rem] leading-relaxed">{t("panel.empty")}</p>
      ) : (
        <>
          <ul className="-mx-5 mt-3 min-h-0 flex-1 overflow-y-auto px-5">
            {summary.lines.map((p) => {
              const item = items[p.line.itemId];
              if (!item) return null;
              const off = p.status !== "ok";
              const name = item.name.text;
              const options = item.groups.flatMap((g) =>
                g.modifiers.filter((m) => p.line.modifierIds.includes(m.id)),
              );
              return (
                <li
                  key={p.line.id}
                  className="border-line grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 border-b py-3 last:border-b-0"
                  data-testid="rail-line"
                >
                  <Txt
                    value={item.name}
                    locale={locale}
                    className={`display-face text-[1.125rem] leading-tight break-words hyphens-auto ${off ? "text-muted line-through" : ""}`}
                  />
                  <span className="num text-right text-[0.9375rem] font-semibold whitespace-nowrap">
                    {off ? null : formatAmd(p.total, locale)}
                  </span>
                  {ambiguous.has(item.id) && item.description && (
                    <Txt
                      value={item.description}
                      locale={locale}
                      className="text-soft col-span-2 text-[0.8125rem] leading-snug break-words"
                    />
                  )}
                  {options.length > 0 && (
                    <span className="text-muted col-span-2 text-[0.8125rem] leading-snug">
                      {options.map((m, i) => (
                        <span key={m.id}>
                          {i > 0 ? ", " : null}
                          <Txt value={m.name} locale={locale} />
                        </span>
                      ))}
                    </span>
                  )}
                  {off ? (
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => onQuantity(p.line.id, 0)}
                      className="rounded-pill border-line-strong text-alert col-span-2 min-h-11 justify-self-start border px-4 text-sm font-semibold"
                    >
                      {t("menu.soldOut")} · {t("cart.remove", { name })}
                    </button>
                  ) : (
                    <span className="col-span-2 mt-1 inline-flex items-center gap-1">
                      <button
                        type="button"
                        className={`${STEP} size-11`}
                        disabled={locked}
                        aria-label={
                          p.line.quantity === 1 ? t("cart.remove", { name }) : t("cart.decrease", { name })
                        }
                        onClick={() => onQuantity(p.line.id, p.line.quantity - 1)}
                      >
                        <MinusIcon />
                      </button>
                      <output className="num min-w-7 text-center font-semibold">{p.line.quantity}</output>
                      <button
                        type="button"
                        className={`${STEP} size-11`}
                        disabled={locked || p.line.quantity >= MAX_QUANTITY}
                        aria-label={t("cart.increase", { name })}
                        onClick={() => onQuantity(p.line.id, p.line.quantity + 1)}
                      >
                        <PlusIcon />
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="border-line-strong/50 flex items-baseline justify-between gap-3 border-t pt-4">
            <span className="display-face text-[1.375rem] leading-none">{t("cart.total")}</span>
            <span className="num text-[1.25rem] font-semibold" data-testid="rail-total">
              {formatAmd(summary.total, locale)}
            </span>
          </div>
          <p className="text-muted mt-1 mb-3 text-[0.8125rem]">
            {t("menu.items", { count: summary.count })} · {t("cart.payNote")}
          </p>
          {send}
          <button
            type="button"
            onClick={onOpen}
            className={
              send
                ? "text-accent-text mt-1 min-h-11 text-sm font-semibold"
                : `${styles.cta} flex min-h-12 w-full items-center justify-center px-5 font-semibold`
            }
          >
            {t("menu.viewOrder")}
            {/* Its full name, as on the phone's bar: "View order, N items, total". */}
            <span className="sr-only">
              , {t("menu.items", { count: summary.count })},{" "}
              <span className="num">{formatAmd(summary.total, locale)}</span>
            </span>
          </button>
        </>
      )}
      {below && <div className="border-line mt-3 grid gap-2 border-t pt-3">{below}</div>}
    </aside>
  );
}
