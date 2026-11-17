"use client";

import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

type Key = "tables" | "orders" | "calls";

// The waiter's sections as a floating pill (ADR-054): the guest dock's shape
// in neutral staff colours. The current section is filled and bold, not only
// coloured. Items are 56 px tall and the bar clears the home indicator.
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
    <div className="px-3 pt-1 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]">
      <nav
        aria-label={t("label")}
        data-testid="waiter-tabs"
        className="mx-auto flex w-full max-w-md gap-1 rounded-[1.75rem] border border-staff-sep bg-white/95 p-1.5 shadow-float"
      >
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
              "flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[1.375rem] px-1 text-[0.8125rem] font-semibold text-staff-label2",
              "aria-[current=page]:bg-staff-fill aria-[current=page]:font-bold aria-[current=page]:text-ink",
            )}
          >
            <span className="relative grid place-items-center">
              <Icon aria-hidden="true" className="size-6" />
              {badge > 0 && (
                <span aria-hidden="true" className="num absolute -top-1.5 -right-3 grid h-5 min-w-5 place-items-center rounded-full bg-pomegranate px-1 text-[0.75rem] leading-none font-bold text-white">
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
