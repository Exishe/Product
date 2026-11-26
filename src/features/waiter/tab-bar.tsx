"use client";

import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

type Key = "tables" | "orders" | "calls";

// The waiter's sections (ADR-054) as a flat bar on the page colour with a
// hairline on top, as the benchmark's sticky bars are: no floating pill, no
// box inside a box. The current section is ink with a 3 px ink bar over it,
// the others grey; 64 px rows clear the home indicator. From 1024 px the same
// three items stand in a rail on the left, iPad style, the bar at their side.
export function TabBar({
  current,
  onPick,
  items,
}: {
  current: Key;
  onPick: (key: Key) => void;
  items: { key: Key; icon: LucideIcon; badge: number }[];
}) {
  const t = useTranslations("waiter.tabs");
  return (
    <div className="bg-staff-bg border-staff-sep border-t pb-[env(safe-area-inset-bottom,0px)] lg:col-start-1 lg:row-start-1 lg:border-t-0 lg:border-r lg:px-2 lg:pt-3 lg:pb-4">
      <nav aria-label={t("label")} data-testid="waiter-tabs" className="mx-auto flex w-full max-w-xl lg:flex-col lg:gap-2">
        {items.map(({ key, icon: Icon, badge }) => (
          <button
            key={key}
            type="button"
            data-testid={`tab-${key}`}
            aria-current={current === key ? "page" : undefined}
            // The count is drawn as a badge; screen readers hear it after the name.
            aria-label={badge > 0 ? `${t(key)}, ${badge}` : undefined}
            onClick={() => onPick(key)}
            className={clsx(
              "text-staff-label2 relative flex min-h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-[0.9375rem] font-semibold lg:min-h-[4.5rem] lg:flex-none lg:rounded-2xl",
              "aria-[current=page]:text-ink",
              // The current one: a 3 px ink bar on top (on the left in the rail).
              "before:bg-ink before:absolute before:inset-x-4 before:top-0 before:h-[3px] before:rounded-b-full before:opacity-0 aria-[current=page]:before:opacity-100",
              "lg:before:inset-x-auto lg:before:inset-y-3 lg:before:left-0 lg:before:h-auto lg:before:w-[3px] lg:before:rounded-r-full lg:before:rounded-b-none",
            )}
          >
            <span className="relative grid place-items-center">
              <Icon aria-hidden="true" className="size-6" />
              {badge > 0 && (
                <span
                  aria-hidden="true"
                  className="num bg-pomegranate absolute -top-2 -right-3.5 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[0.8125rem] leading-none font-bold text-white"
                >
                  {badge}
                </span>
              )}
            </span>
            <span className="max-w-full truncate">{t(key)}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
