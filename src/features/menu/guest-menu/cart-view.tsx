"use client";

import type { ReactNode } from "react";
import type { CartSummary, PricedLine } from "@/features/ordering/cart";
import { MAX_QUANTITY } from "@/features/ordering/cart";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import { BackIcon, MinusIcon, Plate, PlusIcon, Txt, dishPhotoUrl } from "./ui";
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
    <li className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-b border-line py-4" data-testid="cart-line">
      <span className="row-span-4">
        {item && (
          <Plate src={item.image ? dishPhotoUrl(item.image) : null} name={item.name.text} size={56} muted={!available} className="size-14" />
        )}
      </span>
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
        <span className="col-start-2 text-sm text-muted">
          {options.map((m, i) => (
            <span key={m.id}>
              {i > 0 ? ", " : null}
              <Txt value={m.name} locale={locale} />
            </span>
          ))}
        </span>
      )}
      {line.note && (
        <span className="col-start-2 text-sm break-words text-muted">
          {open}
          {line.note}
          {close}
        </span>
      )}
      {!available && (
        <span className="col-start-2 text-sm font-semibold text-alert" role="status">
          {t("menu.soldOut")}
        </span>
      )}
      <div className="col-start-2 mt-1 flex items-center gap-3">
        {available ? (
          <span className="inline-flex items-center rounded-pill border border-line-strong bg-surface">
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
            className="min-h-12 rounded-pill border border-line-strong bg-surface px-5 font-semibold"
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
    <main className="mx-auto w-full max-w-[720px] flex-1 px-4 pb-12 md:px-8" data-testid="cart">
      <div className="pt-3 md:pt-6">
        <button type="button" onClick={onBack} className="-ml-1 inline-flex min-h-12 items-center gap-1 font-semibold text-accent-text">
          <BackIcon />
          {t("cart.back")}
        </button>
      </div>
      <h2 className="display-face mt-2 mb-1 text-[2.75rem] leading-[1.02] md:text-[3.5rem]">{t("cart.title")}</h2>
      <ul className="mt-4 border-t border-line">
        {summary.lines.map((p) => (
          <LineRow key={p.line.id} priced={p} item={items[p.line.itemId]} locked={locked} onQuantity={onQuantity} />
        ))}
      </ul>
      <div className="flex items-baseline justify-between py-5 text-xl font-semibold">
        <span className="display-face text-2xl">{t("cart.total")}</span>
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
