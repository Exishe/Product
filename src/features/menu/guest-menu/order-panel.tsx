"use client";

import type { CartSummary } from "@/features/ordering/cart";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import styles from "./guest.module.css";
import { CheckIcon, CloseIcon, Plate, Txt, dishPhotoUrl } from "./ui";
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

// "Your order" beside the menu on a desktop (owner's reference, ADR-056):
// a narrow white column with the title in the display face, each chosen
// dish as a round plate with a small × to take it out and its quantity on a
// badge, then the total and a round ✓ that opens the order. A dish added on
// a desktop flies here (fly.ts) and the heading bounces as it lands.
export function OrderPanel({
  summary,
  items,
  onOpen,
  onRemove,
}: {
  summary: CartSummary;
  items: Record<string, GuestItem>;
  onOpen: () => void;
  onRemove: (lineId: string) => void;
}) {
  const { t, locale } = useGuestI18n();
  const count = t("menu.items", { count: summary.count });
  // The ✓'s name, ahead of the total (hidden words, as on the phone's bar).
  const openLabel = `${t("menu.viewOrder")}, ${count}, `;
  return (
    <aside
      aria-labelledby="order-panel-title"
      data-fly-target="1"
      className="bg-surface shadow-card rounded-feature sticky top-6 hidden max-h-[calc(100dvh-11rem)] flex-col items-center border [border-color:var(--guest-card-border)] px-4 pt-7 pb-6 lg:flex"
    >
      <h2
        id="order-panel-title"
        data-fly-bump=""
        className="display-face text-center text-[1.875rem] leading-[1.05]"
      >
        {t("cart.title")}
      </h2>
      {summary.lines.length === 0 ? (
        <p className="text-muted mt-5 text-center text-[0.8125rem] leading-relaxed">{t("panel.empty")}</p>
      ) : (
        <>
          <ul className="-mx-4 mt-6 grid min-h-0 w-[calc(100%+2rem)] flex-1 justify-items-center gap-4 overflow-y-auto px-4 pt-2 pb-3">
            {summary.lines.map((p) => {
              const item = items[p.line.itemId];
              if (!item) return null;
              const off = p.status !== "ok";
              return (
                <li key={p.line.id} className="grid w-full justify-items-center gap-2 text-center">
                  <span className="relative">
                    <Plate
                      src={item.image ? dishPhotoUrl(item.image) : null}
                      size={80}
                      muted={off}
                      className="size-[4.75rem]"
                    />
                    <button
                      type="button"
                      onClick={() => onRemove(p.line.id)}
                      aria-label={t("cart.remove", { name: item.name.text })}
                      className="bg-surface text-ink shadow-float absolute -top-1.5 left-1/2 grid size-7 -translate-x-1/2 place-items-center rounded-full [&_svg]:size-3.5"
                    >
                      <CloseIcon />
                    </button>
                    <span className="num bg-badge text-on-badge absolute -right-1 -bottom-0.5 grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-bold">
                      {p.line.quantity}
                    </span>
                  </span>
                  <Txt
                    value={item.name}
                    locale={locale}
                    className={`line-clamp-2 max-w-full text-[0.8125rem] leading-tight break-words hyphens-auto ${off ? "text-muted line-through" : "text-ink"}`}
                  />
                  <span className="num text-muted -mt-1 text-xs">
                    {off ? t("menu.soldOut") : formatAmd(p.total, locale)}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="border-line mt-4 grid w-full justify-items-center gap-0.5 border-t pt-5 text-center">
            <span className="display-face text-[1.375rem] leading-none">{t("cart.total")}</span>
            <span className="text-muted mt-1 text-xs">{count}</span>
            <span className="num mt-1 text-[1.375rem] font-semibold">{formatAmd(summary.total, locale)}</span>
          </div>
          {/* Its name, read from the hidden words, is the same as the phone's
              bar: "View order, N items, total". */}
          <button
            type="button"
            onClick={onOpen}
            title={t("menu.viewOrder")}
            className="bg-add text-on-add mt-5 grid size-14 flex-none place-items-center rounded-full shadow-[var(--guest-add-shadow)] [&_svg]:size-6"
          >
            <CheckIcon />
            <span className="sr-only">
              {openLabel}
              <span className="num">{formatAmd(summary.total, locale)}</span>
            </span>
          </button>
        </>
      )}
    </aside>
  );
}
