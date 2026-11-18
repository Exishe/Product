"use client";

import { ThemedStarBorder } from "@/features/guest-theme/themed-star-border";
import type { CartSummary } from "@/features/ordering/cart";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { formatAmd } from "@/lib/format/money";
import { CloseIcon, Plate, Txt, dishPhotoUrl } from "./ui";
import type { GuestItem } from "./view-model";

// The main action on the menu: "View order", with the chosen dishes' plates,
// the count and the total. On phones and tablets it sits on the bottom bar;
// on a desktop it ends the order panel.
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
  const plates = (showPlates ? summary.lines : []).slice(-3).map((p) => items[p.line.itemId]).filter((i): i is GuestItem => Boolean(i));
  return (
    <ThemedStarBorder
      onClick={onOpen}
      className={`pointer-events-auto flex min-h-14 w-full items-center gap-3 py-2 pr-5 text-left font-semibold ${plates.length ? "pl-2.5" : "pl-6"} ${className}`}
    >
      <span aria-hidden="true" className="flex flex-none -space-x-3">
        {plates.map((i) => (
          <Plate
            key={i.id}
            src={i.image ? dishPhotoUrl(i.image) : null}
            name={i.name.text}
            size={40}
            className="ring-accent size-10 ring-2"
          />
        ))}
      </span>
      <span className="flex min-w-0 flex-1 flex-col leading-tight">
        {t("menu.viewOrder")}
        <small className="text-sm font-normal opacity-80">{t("menu.items", { count: summary.count })}</small>
      </span>
      <span className="num text-lg whitespace-nowrap">{formatAmd(summary.total, locale)}</span>
    </ThemedStarBorder>
  );
}

// "Your order" beside the menu on a desktop (owner's pick, the left screen of
// menu-layout.webp): each chosen dish on its round plate with its quantity,
// a × to take it out, the total and the main action. A dish added on a
// desktop flies here (fly.ts) and the heading bounces as it lands.
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
  return (
    <aside
      aria-labelledby="order-panel-title"
      data-fly-target="1"
      className="bg-surface shadow-card rounded-feature sticky top-6 hidden max-h-[calc(100dvh-8rem)] flex-col border [border-color:var(--guest-card-border)] p-6 lg:flex"
    >
      <h2 id="order-panel-title" data-fly-bump="" className="display-face text-center text-[2rem] leading-none">
        {t("cart.title")}
      </h2>
      {summary.lines.length === 0 ? (
        <p className="text-muted mt-6 text-center text-sm">{t("panel.empty")}</p>
      ) : (
        <>
          <ul className="-mx-2 mt-5 grid min-h-0 flex-1 gap-1 overflow-y-auto px-2 py-1">
            {summary.lines.map((p) => {
              const item = items[p.line.itemId];
              if (!item) return null;
              const off = p.status !== "ok";
              return (
                <li key={p.line.id} className="flex items-center gap-3 py-1.5">
                  <span className="relative flex-none">
                    <Plate src={item.image ? dishPhotoUrl(item.image) : null} name={item.name.text} size={56} muted={off} className="size-14" />
                    <span className="num bg-accent text-on-accent absolute -right-1 -bottom-1 grid size-6 place-items-center rounded-full text-xs font-bold">
                      {p.line.quantity}
                    </span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <Txt value={item.name} locale={locale} className={`display-face block leading-tight [overflow-wrap:anywhere] ${off ? "text-muted line-through" : ""}`} />
                    <span className="num text-muted text-sm">{off ? t("menu.soldOut") : formatAmd(p.total, locale)}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(p.line.id)}
                    aria-label={t("cart.remove", { name: item.name.text })}
                    className="text-muted hover:text-ink grid size-10 flex-none place-items-center rounded-full"
                  >
                    <CloseIcon />
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-line mt-4 flex items-baseline justify-between border-t pt-4">
            <span className="display-face text-xl">{t("cart.total")}</span>
            <span className="num text-lg font-semibold">{formatAmd(summary.total, locale)}</span>
          </div>
          <CartBar summary={summary} items={items} onOpen={onOpen} plates={false} className="mt-4" />
        </>
      )}
    </aside>
  );
}
