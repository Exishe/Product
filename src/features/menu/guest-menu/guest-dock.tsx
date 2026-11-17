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

// The floating bar at the bottom of the guest pages (owner's pick: a pill
// with icon and label per item; the current one glows softly in the theme's
// colour). Above it stack the cart bar on the menu and the waiter question,
// so nothing floats over the main action. It stays clear of the home
// indicator (safe-area inset), and every item is at least 48 px tall.
export function GuestDock({ items, above }: { items: DockItem[]; above?: ReactNode }) {
  const { t } = useGuestI18n();
  if (items.length === 0 && !above) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(10px+env(safe-area-inset-bottom,0px))]">
      <div className="mx-auto grid w-full max-w-[480px] gap-2">
        {above}
        {items.length > 0 && (
          <nav
            aria-label={t("nav.label")}
            className="bg-dock text-dock-ink shadow-float pointer-events-auto flex gap-1 rounded-[calc(var(--guest-r-pill)+4px)] border border-[color:color-mix(in_srgb,var(--guest-line)_70%,transparent)] p-1.5 backdrop-blur-md"
            data-testid="guest-dock"
          >
            {items.map((item) => {
              const body = (
                <>
                  <span className="relative grid place-items-center">
                    {item.icon}
                    {item.badge ? (
                      <span className="num bg-accent text-on-accent absolute -top-1.5 -right-2.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[0.6875rem] leading-none font-bold">
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                  <span className="max-w-full truncate">{item.label}</span>
                </>
              );
              const cls =
                "text-dock-muted hover:text-dock-ink aria-[current=page]:text-dock-ink aria-pressed:text-dock-ink flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-pill px-1 text-xs font-semibold disabled:opacity-50 sm:flex-row sm:gap-2 sm:text-sm aria-[current=page]:bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--guest-glow)_26%,transparent),transparent_72%)] aria-pressed:bg-[radial-gradient(ellipse_at_center,color-mix(in_srgb,var(--guest-glow)_26%,transparent),transparent_72%)]";
              return item.href ? (
                <a
                  key={item.key}
                  href={item.href}
                  onClick={item.onClick}
                  aria-current={item.current ? "page" : undefined}
                  aria-label={item.ariaLabel}
                  className={cls}
                  data-testid={item.testId}
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
