"use client";

import { useCallback, useRef, type ReactNode } from "react";
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
  /** The item opens a small sheet above the bar (the waiter's choices). */
  expanded?: boolean;
};

// The bottom of the guest pages (ADR-093 area pass): one full-bleed panel in
// the page colour, a hairline and a soft lift on top, reaching down past the
// home indicator, so no dish ever shows below or around it. What belongs
// with the bar sits inside the same panel, above the tabs: the cart bar on
// the menu, the waiter's choices, a "goes well with" idea, the notes about a
// request. One raised object, one shadow. Every item is at least 56 px tall;
// three items carry 15 px labels, four items 13 px on up to two lines (never
// cut with an ellipsis). The Order item is where a dish added on a phone
// flies to (fly.ts), its count bouncing as it lands.
//
// The panel publishes its height as --guest-bottom on <html>, so focus and
// scrollIntoView keep controls clear of it (scroll-padding, globals.css).
//
// From 1024 px the pages carry these actions themselves (the menu's order
// rail, the status page's own buttons), so the tabs are a phone and tablet
// thing; what sits above them floats on its own there.
export function GuestDock({ items, above }: { items: DockItem[]; above?: ReactNode }) {
  const { t } = useGuestI18n();
  // A callback ref: the panel may mount later than the bar (the first dish added).
  const observer = useRef<ResizeObserver | null>(null);
  const panel = useCallback((el: HTMLDivElement | null) => {
    const root = document.documentElement;
    observer.current?.disconnect();
    observer.current = null;
    if (!el) {
      root.style.removeProperty("--guest-bottom");
      return;
    }
    const publish = () => root.style.setProperty("--guest-bottom", `${Math.round(el.offsetHeight)}px`);
    publish();
    observer.current = new ResizeObserver(publish);
    observer.current.observe(el);
  }, []);
  if (items.length === 0 && !above) return null;
  const four = items.length > 3;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
      <div
        ref={panel}
        data-guest-bottom=""
        className={`bg-page border-line pointer-events-auto border-t pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-12px_28px_-22px_rgb(0_0_0/0.45)] lg:pointer-events-none lg:border-0 lg:bg-transparent lg:pb-4 lg:shadow-none ${
          items.length === 0 ? "has-[>div:empty]:hidden" : ""
        }`}
      >
        <div
          className={`mx-auto grid w-full max-w-[480px] gap-2 px-4 pt-2 empty:hidden lg:pointer-events-auto ${four ? "sm:max-w-[620px]" : ""}`}
        >
          {above}
        </div>
        {items.length > 0 && (
          <nav
            aria-label={t("nav.label")}
            className={`text-dock-ink mx-auto flex w-full max-w-[480px] lg:hidden ${four ? "gap-0 px-0.5 sm:max-w-[620px]" : "gap-1 px-2"}`}
            data-testid="guest-dock"
          >
            {items.map((item) => {
              const body = (
                <>
                  <span className="relative grid flex-none place-items-center">
                    {item.icon}
                    {item.badge ? (
                      <span
                        data-fly-bump=""
                        className="num bg-badge text-on-badge absolute -top-1.5 -right-2.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-meta leading-none font-bold sm:-top-1 sm:-right-2"
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`line-clamp-2 max-w-full text-center leading-[1.15] whitespace-normal [overflow-wrap:anywhere] ${four ? "text-meta" : "text-label"}`}
                  >
                    {item.label}
                  </span>
                </>
              );
              const cls = `text-dock-muted hover:text-dock-ink aria-[current=page]:text-dock-ink aria-pressed:text-dock-ink aria-expanded:text-dock-ink after:bg-accent-text relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1.5 font-semibold transition-colors duration-150 after:absolute after:bottom-1 after:h-0.5 after:w-0 after:rounded-full after:transition-all after:duration-200 after:content-[''] disabled:opacity-50 hover:after:w-6 focus-visible:after:w-6 aria-[current=page]:after:w-6 aria-expanded:after:w-6 sm:flex-row sm:gap-3 sm:[&>span:last-child]:text-body ${four ? "px-0.5" : "px-1"}`;
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
                  aria-pressed={item.expanded === undefined ? item.pressed : undefined}
                  aria-expanded={item.expanded}
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
export const DOCK_SPACE = "pb-[calc(88px+env(safe-area-inset-bottom,0px))]";
export const DOCK_SPACE_TALL = "pb-[calc(160px+env(safe-area-inset-bottom,0px))]";
