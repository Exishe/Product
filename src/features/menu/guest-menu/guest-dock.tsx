"use client";

import type { ReactNode } from "react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";

export type DockItem = {
  key: string;
  label: string;
  icon: ReactNode;
  /** A link (another page or a place on this one) … */
  href?: string;
  /** … or an action. */
  onClick?: () => void;
  current?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  badge?: number;
  /** When the visible label isn't the whole story (the order's count). */
  ariaLabel?: string;
  testId?: string;
};

// The bar at the bottom of the guest pages: icon and label per item, with no
// border, shadow or fill of its own (it only keeps the page colour so dishes do
// not show through); hovering an item gives it a soft pill, the current one is
// underlined. Above it stack the cart bar on the menu and the waiter question,
// so nothing floats over the main action. It stays clear of the home
// indicator (safe-area inset), and every item is at least 48 px tall. The
// Order item is where a dish added on a phone flies to (fly.ts), its count
// bouncing as it lands.
//
// From 1024 px the pages carry these actions themselves (the menu's order
// rail, the status page's own buttons), so the bar is a phone and tablet
// thing: on a desktop it would float over the dishes' prices.
export function GuestDock({ items, above }: { items: DockItem[]; above?: ReactNode }) {
  const { t } = useGuestI18n();
  if (items.length === 0 && !above) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(10px+env(safe-area-inset-bottom,0px))]">
      {/* Four items side by side (icon + label from 640 px) need more room than three. */}
      <div
        className={`mx-auto grid w-full max-w-[480px] gap-2 ${items.length > 3 ? "sm:max-w-[620px]" : ""}`}
      >
        {above}
        {items.length > 0 && (
          <nav
            aria-label={t("nav.label")}
            className="bg-page text-dock-ink pointer-events-auto flex gap-1 rounded-2xl p-1 lg:hidden"
            data-testid="guest-dock"
          >
            {items.map((item) => {
              const body = (
                <>
                  <span className="relative grid place-items-center">
                    {item.icon}
                    {item.badge ? (
                      <span
                        data-fly-bump=""
                        className="num bg-badge text-on-badge absolute -top-1.5 -right-2.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[0.6875rem] leading-none font-bold"
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="max-w-full truncate">{item.label}</span>
                </>
              );
              const cls =
                "text-dock-muted hover:text-dock-ink hover:bg-chip/60 aria-[current=page]:text-dock-ink aria-pressed:text-dock-ink after:bg-accent-text relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl px-1 text-xs font-semibold transition-colors duration-150 after:absolute after:bottom-1 after:h-0.5 after:w-0 after:rounded-full after:transition-all after:duration-200 after:content-[''] disabled:opacity-50 hover:after:w-6 focus-visible:after:w-6 sm:flex-row sm:gap-2 sm:text-sm";
              return item.href ? (
                <a
                  key={item.key}
                  href={item.href}
                  onClick={item.onClick}
                  aria-current={item.current ? "page" : undefined}
                  aria-label={item.ariaLabel}
                  className={cls}
                  data-testid={item.testId}
                  data-fly-target={item.key === "order" ? 2 : undefined}
                >
                  {body}
                </a>
              ) : (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.onClick}
                  disabled={item.disabled}
                  aria-current={item.current ? "page" : undefined}
                  aria-pressed={item.pressed}
                  aria-label={item.ariaLabel}
                  className={cls}
                  data-testid={item.testId}
                  data-fly-target={item.key === "order" ? 2 : undefined}
                >
                  {body}
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}

/** Space at the end of a page so the bar never covers its last lines. */
export const DOCK_SPACE = "pb-[calc(96px+env(safe-area-inset-bottom,0px))]";
export const DOCK_SPACE_TALL = "pb-[calc(168px+env(safe-area-inset-bottom,0px))]";
