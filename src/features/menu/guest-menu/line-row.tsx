"use client";

import type { PricedLine } from "@/features/ordering/cart";
import { MAX_QUANTITY } from "@/features/ordering/cart";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import { MinusIcon, PlusIcon, STEP, Txt, dishPhotoUrl } from "./ui";
import type { GuestItem } from "./view-model";

// One line of the order: the order view's, and the desktop rail's in a
// narrower cut (`dense`: a smaller photo and name).
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
  const step = `${STEP} size-11`;
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
      className={`border-line grid gap-x-3 gap-y-0.5 border-b last:border-b-0 ${dense ? "py-2.5" : "py-3.5"} ${photo ? (dense ? "grid-cols-[2.75rem_minmax(0,1fr)_auto]" : "grid-cols-[3.5rem_minmax(0,1fr)_auto]") : "grid-cols-[minmax(0,1fr)_auto]"}`}
      data-testid={dense ? "rail-line" : "cart-line"}
    >
      {photo && (
        <span
          className={`bg-plate rounded-guest-sm row-span-5 block overflow-hidden ${dense ? "size-11" : "size-14"}`}
        >
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
          className={`leading-tight font-semibold break-words hyphens-auto ${dense ? "text-body" : "text-name"} ${available ? "" : "text-muted line-through"}`}
        />
      ) : (
        <span />
      )}
      <span className="num text-right text-body leading-[1.45] font-semibold whitespace-nowrap">
        {available ? formatAmd(priced.total, locale) : null}
      </span>
      {detail && item?.description && (
        <Txt
          value={item.description}
          locale={locale}
          className={`text-soft ${col} text-body leading-[1.45] break-words`}
        />
      )}
      {options.length > 0 && (
        <span className={`text-muted ${col} text-body leading-[1.45]`}>
          {options.map((m, i) => (
            <span key={m.id}>
              {i > 0 ? ", " : null}
              <Txt value={m.name} locale={locale} />
            </span>
          ))}
        </span>
      )}
      {line.note && (
        <span className={`text-muted ${col} text-body leading-[1.45] break-words`}>
          {open}
          {line.note}
          {close}
        </span>
      )}
      {!available && (
        <span className={`text-alert ${col} text-meta font-semibold`} role="status">
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
            <output className="num min-w-6 text-center text-body font-semibold">{line.quantity}</output>
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
            className="rounded-pill border-line-strong bg-surface min-h-11 border px-4 text-body font-semibold"
            onClick={() => onQuantity(line.id, 0)}
          >
            {t("cart.remove", { name })}
          </button>
        )}
      </div>
    </li>
  );
}
