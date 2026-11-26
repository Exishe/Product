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
// three items carry 15 px labels, four items 13 px. The current item (ADR-095)
// has its label in the ink and a 56 × 32 px tint behind its icon, nothing
// under the text (an underline would cut through Armenian descenders).
// While the waiter's choices are open, only the Waiter item looks current.
// Labels are never cut: a label keeps its words whole. Under large text (the
// dock under 16rem wide, WCAG 1.4.4) the bar stays one row: the current item
// shows its words on the tint, the others their icon only, their words kept
// for screen readers.
// The Order item is where a dish added on a phone flies to (fly.ts), its
// count bouncing as it lands.
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
  const opened = items.some((item) => item.expanded);
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
          className={`mx-auto grid w-full max-w-[480px] grid-cols-[minmax(0,1fr)] gap-2 px-4 pt-2 pb-3 empty:hidden lg:pointer-events-auto lg:pb-0 ${four ? "sm:max-w-[620px]" : ""}`}
        >
          {above}
        </div>
        {items.length > 0 && (
          <nav
            aria-label={t("nav.label")}
            className={`text-dock-ink @container mx-auto flex w-full max-w-[480px] lg:hidden ${four ? "gap-0 px-[2px] sm:max-w-[620px]" : "gap-[4px] px-[8px]"}`}
            data-testid="guest-dock"
          >
            {items.map((item) => {
              // One item looks current at a time: while a sheet of the bar is
              // open (the waiter's choices) it is that item, not the page's.
              const on = opened ? item.expanded === true : Boolean(item.current);
              const body = (
                <>
                  <span className="group-hover:bg-chip/60 group-data-[on]:bg-chip relative grid h-8 w-14 flex-none place-items-center rounded-full transition-colors duration-200 @max-[16rem]:h-[32px] @max-[16rem]:w-[44px] @max-[16rem]:group-data-[on]:hidden">
                    {item.icon}
                    {item.badge ? (
                      <span
                        data-fly-bump=""
                        className="num bg-badge text-on-badge absolute -top-0.5 left-[calc(50%+3px)] grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-meta leading-none font-bold"
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`max-w-full text-center leading-[1.15] [overflow-wrap:normal] break-normal ${four ? "text-meta" : "text-label"} ${on ? "@max-[16rem]:px-[12px] @max-[16rem]:whitespace-nowrap" : "@max-[16rem]:sr-only"}`}
                  >
                    {item.label}
                  </span>
                </>
              );
              const cls = `group text-dock-muted hover:text-dock-ink data-[on]:text-dock-ink aria-pressed:text-dock-ink relative flex min-h-[56px] min-w-max flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-xl py-1 font-semibold transition-colors duration-150 disabled:opacity-50 @max-[16rem]:flex-row @max-[16rem]:gap-0 @max-[16rem]:rounded-full @max-[16rem]:data-[on]:bg-chip @max-[16rem]:data-[on]:flex-auto ${four ? "px-[2px]" : "px-[4px]"}`;
              return item.href ? (
                <a
                  key={item.key}
                  href={item.href}
                  onClick={item.onClick}
                  aria-current={item.current ? "page" : undefined}
                  aria-label={item.ariaLabel}
                  data-on={on || undefined}
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
                  data-on={on || undefined}
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
