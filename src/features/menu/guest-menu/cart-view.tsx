"use client";

import type { ReactNode } from "react";
import type { CartSummary, PricedLine } from "@/features/ordering/cart";
import { MAX_QUANTITY } from "@/features/ordering/cart";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import { BackIcon, MinusIcon, PlusIcon, Txt } from "./ui";
import type { GuestItem } from "./view-model";

function LineRow({
  priced,
  item,
  locked,
  onQuantity,
}: {
  priced: PricedLine;
  item: GuestItem | undefined;
  locked: boolean;
  onQuantity: (id: string, quantity: number) => void;
}) {
  const { t, locale } = useGuestI18n();
  const { line, status } = priced;
  const name = item?.name.text ?? "";
  const options = (item?.groups ?? []).flatMap((g) => g.modifiers.filter((m) => line.modifierIds.includes(m.id)));
  const [open, close] = locale === "en" ? ["“", "”"] : ["«", "»"];
  const available = status === "ok";
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-line py-3" data-testid="cart-line">
      {item ? (
        <Txt
          value={item.name}
          locale={locale}
          className={`display-face text-xl leading-tight [overflow-wrap:anywhere] ${available ? "" : "text-muted line-through"}`}
        />
      ) : (
        <span />
      )}
      <span className="num text-right font-semibold whitespace-nowrap">{available ? formatAmd(priced.total, locale) : null}</span>
      {options.length > 0 && (
        <span className="col-start-1 text-sm text-muted">
          {options.map((m, i) => (
            <span key={m.id}>
              {i > 0 ? ", " : null}
              <Txt value={m.name} locale={locale} />
            </span>
          ))}
        </span>
      )}
      {line.note && (
        <span className="col-start-1 text-sm break-words text-muted">
          {open}
          {line.note}
          {close}
        </span>
      )}
      {!available && (
        <span className="col-start-1 text-sm font-semibold text-pomegranate" role="status">
          {t("menu.soldOut")}
        </span>
      )}
      <div className="col-start-1 mt-1 flex items-center gap-3">
        {available ? (
          <span className="inline-flex items-center rounded-input border border-line-strong">
            <button
              type="button"
              className="grid size-12 place-items-center disabled:text-line-strong"
              disabled={locked}
              aria-label={line.quantity === 1 ? t("cart.remove", { name }) : t("cart.decrease", { name })}
              onClick={() => onQuantity(line.id, line.quantity - 1)}
            >
              <MinusIcon />
            </button>
            <output className="num min-w-7 text-center font-semibold">{line.quantity}</output>
            <button
              type="button"
              className="grid size-12 place-items-center disabled:text-line-strong"
              disabled={locked || line.quantity >= MAX_QUANTITY}
              aria-label={t("cart.increase", { name })}
              onClick={() => onQuantity(line.id, line.quantity + 1)}
            >
              <PlusIcon />
            </button>
          </span>
        ) : (
          <button
            type="button"
            disabled={locked}
            className="min-h-12 rounded-input border border-line-strong bg-white px-4 font-semibold"
            onClick={() => onQuantity(line.id, 0)}
          >
            {t("cart.remove", { name })}
          </button>
        )}
      </div>
    </li>
  );
}

// "Your order": lines with options, notes and steppers, the total, a line
// about paying the waiter, and the send area (the button, or why ordering is
// off right now).
export function CartView({
  summary,
  items,
  locked,
  notice,
  footer,
  onQuantity,
  onBack,
}: {
  summary: CartSummary;
  items: Record<string, GuestItem>;
  locked: boolean;
  notice: ReactNode;
  footer: ReactNode;
  onQuantity: (id: string, quantity: number) => void;
  onBack: () => void;
}) {
  const { t, locale } = useGuestI18n();
  return (
    <main className="flex-1 px-4 pb-8" data-testid="cart">
      <div className="pt-2">
        <button type="button" onClick={onBack} className="-ml-1 inline-flex min-h-12 items-center gap-1 font-semibold text-tarragon">
          <BackIcon />
          {t("cart.back")}
        </button>
      </div>
      <h2 className="display-face mt-2 mb-1 text-display-38 leading-[1.05]">{t("cart.title")}</h2>
      <ul className="mt-4">
        {summary.lines.map((p) => (
          <LineRow key={p.line.id} priced={p} item={items[p.line.itemId]} locked={locked} onQuantity={onQuantity} />
        ))}
      </ul>
      <div className="flex items-baseline justify-between py-4 text-xl font-semibold">
        <span>{t("cart.total")}</span>
        <span className="num" data-testid="cart-total">
          {formatAmd(summary.total, locale)}
        </span>
      </div>
      <p className="mb-4 text-sm text-muted">{t("cart.payNote")}</p>
      {notice && <div className="mb-4">{notice}</div>}
      {footer}
    </main>
  );
}
