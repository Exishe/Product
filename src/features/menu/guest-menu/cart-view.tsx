"use client";

import type { ReactNode } from "react";
import type { CartSummary, PricedLine } from "@/features/ordering/cart";
import { MAX_QUANTITY } from "@/features/ordering/cart";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import type { WaitRange } from "./hints";
import { BackIcon, MinusIcon, PlusIcon, STEP, Txt, dishPhotoUrl } from "./ui";
import type { GuestItem } from "./view-model";

// One line of the order: the order view's, and the desktop rail's in a
// narrower cut (`dense`: no plate, smaller name, 44 px buttons).
export function LineRow({
  priced,
  item,
  detail,
  locked,
  dense = false,
  onQuantity,
}: {
  priced: PricedLine;
  item: GuestItem | undefined;
  /** Another dish has this name: its description tells the two apart. */
  detail: boolean;
  locked: boolean;
  dense?: boolean;
  onQuantity: (id: string, quantity: number) => void;
}) {
  const { t, locale } = useGuestI18n();
  const { line, status } = priced;
  const step = `${STEP} size-10`;
  const name = item?.name.text ?? "";
  const options = (item?.groups ?? []).flatMap((g) =>
    g.modifiers.filter((m) => line.modifierIds.includes(m.id)),
  );
  const [open, close] = locale === "en" ? ["“", "”"] : ["«", "»"];
  const available = status === "ok";
  // A plate only for a real photo: an empty plate per line tells the guest
  // nothing, so photoless lines read like a receipt.
  const photo = !dense && item?.image ? dishPhotoUrl(item.image) : null;
  const col = photo ? "col-start-2" : "col-start-1";
  return (
    <li
      className={`border-line grid gap-x-3 gap-y-0.5 border-b last:border-b-0 ${dense ? "py-2.5" : "py-3.5"} ${photo ? "grid-cols-[3.5rem_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"}`}
      data-testid={dense ? "rail-line" : "cart-line"}
    >
      {photo && (
        <span className="bg-plate row-span-5 block size-14 overflow-hidden rounded-[10px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp */}
          <img
            src={photo}
            alt=""
            width={112}
            height={112}
            className={`size-full object-cover ${available ? "" : "opacity-50 grayscale"}`}
          />
        </span>
      )}
      {item ? (
        <Txt
          value={item.name}
          locale={locale}
          className={`leading-tight font-semibold break-words hyphens-auto ${dense ? "text-[12px]" : "text-[13px]"} ${available ? "" : "text-muted line-through"}`}
        />
      ) : (
        <span />
      )}
      <span className="num text-right text-[12px] font-semibold whitespace-nowrap">
        {available ? formatAmd(priced.total, locale) : null}
      </span>
      {detail && item?.description && (
        <Txt value={item.description} locale={locale} className={`text-soft ${col} text-[11px] break-words`} />
      )}
      {options.length > 0 && (
        <span className={`text-muted ${col} text-[11px]`}>
          {options.map((m, i) => (
            <span key={m.id}>
              {i > 0 ? ", " : null}
              <Txt value={m.name} locale={locale} />
            </span>
          ))}
        </span>
      )}
      {line.note && (
        <span className={`text-muted ${col} text-[11px] break-words`}>
          {open}
          {line.note}
          {close}
        </span>
      )}
      {!available && (
        <span className={`text-alert ${col} text-[11px] font-semibold`} role="status">
          {t("menu.soldOut")}
        </span>
      )}
      <div className={`${col} mt-1 flex items-center gap-3`}>
        {available ? (
          <span className="inline-flex items-center gap-1">
            <button
              type="button"
              className={step}
              disabled={locked}
              aria-label={line.quantity === 1 ? t("cart.remove", { name }) : t("cart.decrease", { name })}
              onClick={() => onQuantity(line.id, line.quantity - 1)}
            >
              <MinusIcon />
            </button>
            <output className="num min-w-6 text-center text-[13px] font-semibold">{line.quantity}</output>
            <button
              type="button"
              className={step}
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
            className="rounded-pill border-line-strong bg-surface min-h-11 border px-4 text-[12px] font-semibold"
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
        <span className="text-[13px]">{t("cart.total")}</span>
        <span className="num text-[18px] font-semibold" data-testid="cart-total">
          {formatAmd(summary.total, locale)}
        </span>
      </div>
      <div className="bg-chip text-muted mb-4 grid gap-1.5 rounded-[10px] px-3.5 py-3 text-[11px] leading-snug">
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
