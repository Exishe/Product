"use client";

import type { ReactNode } from "react";
import type { CartSummary, PricedLine } from "@/features/ordering/cart";
import { MAX_QUANTITY } from "@/features/ordering/cart";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import type { WaitRange } from "./hints";
import { BackIcon, MinusIcon, Plate, PlusIcon, STEP, Txt, dishPhotoUrl } from "./ui";
import type { GuestItem } from "./view-model";

function LineRow({
  priced,
  item,
  detail,
  locked,
  onQuantity,
}: {
  priced: PricedLine;
  item: GuestItem | undefined;
  /** Another dish has this name: its description tells the two apart. */
  detail: boolean;
  locked: boolean;
  onQuantity: (id: string, quantity: number) => void;
}) {
  const { t, locale } = useGuestI18n();
  const { line, status } = priced;
  const name = item?.name.text ?? "";
  const options = (item?.groups ?? []).flatMap((g) =>
    g.modifiers.filter((m) => line.modifierIds.includes(m.id)),
  );
  const [open, close] = locale === "en" ? ["“", "”"] : ["«", "»"];
  const available = status === "ok";
  // A plate only for a real photo: an empty plate per line tells the guest
  // nothing, so photoless lines read like a receipt.
  const photo = item?.image ? dishPhotoUrl(item.image) : null;
  const col = photo ? "col-start-2" : "col-start-1";
  return (
    <li
      className={`border-line grid gap-x-4 gap-y-1 border-b py-5 last:border-b-0 ${photo ? "grid-cols-[4rem_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"}`}
      data-testid="cart-line"
    >
      {photo && (
        <span className="row-span-5">
          <Plate src={photo} size={64} muted={!available} className="size-16" />
        </span>
      )}
      {item ? (
        <Txt
          value={item.name}
          locale={locale}
          className={`display-face text-[1.375rem] leading-tight break-words hyphens-auto ${available ? "" : "text-muted line-through"}`}
        />
      ) : (
        <span />
      )}
      <span className="num text-right font-semibold whitespace-nowrap">
        {available ? formatAmd(priced.total, locale) : null}
      </span>
      {detail && item?.description && (
        <Txt value={item.description} locale={locale} className={`text-soft ${col} text-sm break-words`} />
      )}
      {options.length > 0 && (
        <span className={`text-muted ${col} text-sm`}>
          {options.map((m, i) => (
            <span key={m.id}>
              {i > 0 ? ", " : null}
              <Txt value={m.name} locale={locale} />
            </span>
          ))}
        </span>
      )}
      {line.note && (
        <span className={`text-muted ${col} text-sm break-words`}>
          {open}
          {line.note}
          {close}
        </span>
      )}
      {!available && (
        <span className={`text-alert ${col} text-sm font-semibold`} role="status">
          {t("menu.soldOut")}
        </span>
      )}
      <div className={`${col} mt-1 flex items-center gap-3`}>
        {available ? (
          <span className="inline-flex items-center gap-1">
            <button
              type="button"
              className={`${STEP} size-12`}
              disabled={locked}
              aria-label={line.quantity === 1 ? t("cart.remove", { name }) : t("cart.decrease", { name })}
              onClick={() => onQuantity(line.id, line.quantity - 1)}
            >
              <MinusIcon />
            </button>
            <output className="num min-w-7 text-center font-semibold">{line.quantity}</output>
            <button
              type="button"
              className={`${STEP} size-12`}
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
            className="rounded-pill border-line-strong bg-surface min-h-12 border px-5 font-semibold"
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
