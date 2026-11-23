"use client";

import type { PricedLine } from "@/features/ordering/cart";
import { MAX_QUANTITY } from "@/features/ordering/cart";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import { MinusIcon, Plate, PlusIcon, STEP, Txt, dishPhotoUrl } from "./ui";
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
  const step = `${STEP} ${dense ? "size-11" : "size-12"}`;
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
      className={`border-line grid gap-x-4 gap-y-1 border-b last:border-b-0 ${dense ? "py-3" : "py-5"} ${photo ? "grid-cols-[4rem_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"}`}
      data-testid={dense ? "rail-line" : "cart-line"}
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
          className={`display-face leading-tight break-words hyphens-auto ${dense ? "text-[1.125rem]" : "text-[1.375rem]"} ${available ? "" : "text-muted line-through"}`}
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
      {item?.substitution && available && (
        <span className={`text-muted ${col} text-sm font-semibold`}>
          {t("menu.withSub", { to: item.substitution.to })}
        </span>
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
              className={step}
              disabled={locked}
              aria-label={line.quantity === 1 ? t("cart.remove", { name }) : t("cart.decrease", { name })}
              onClick={() => onQuantity(line.id, line.quantity - 1)}
            >
              <MinusIcon />
            </button>
            <output className="num min-w-7 text-center font-semibold">{line.quantity}</output>
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
