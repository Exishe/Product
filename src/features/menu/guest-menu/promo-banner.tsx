"use client";

import { X } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import type { GuestPromo } from "./view-model";

// Promo banners at the top of the guest menu (ADR-070): an announcement the
// café switched on, in the guest's language (Armenian when it has no text in
// it). It changes no price. A guest can close one for this visit only: the
// closed ids are kept in sessionStorage, so a new promo still shows.

const KEY = "pativ-promo-closed";
const listeners = new Set<() => void>();

function read(): string {
  try {
    return sessionStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => void listeners.delete(cb);
};

export function PromoBanners({ promos }: { promos: GuestPromo[] }) {
  const { t, locale } = useGuestI18n();
  const closed = useSyncExternalStore(subscribe, read, () => "");
  const close = useCallback((id: string) => {
    try {
      sessionStorage.setItem(KEY, [...new Set([...read().split(",").filter(Boolean), id])].join(","));
    } catch {
      // Private mode: the banner just stays.
    }
    listeners.forEach((l) => l());
  }, []);

  const shown = promos.filter((p) => !closed.split(",").includes(p.id));
  if (shown.length === 0) return null;
  return (
    <>
      {shown.map((p) => (
        <aside
          key={p.id}
          aria-label={t("menu.promoLabel")}
          data-testid="promo-banner"
          className="rounded-card border-glow bg-surface text-ink shadow-card relative flex items-start gap-3 border py-3 pr-1 pl-4"
        >
          <span aria-hidden className="bg-accent absolute inset-y-3 left-0 w-1 rounded-r-full" />
          <div className="min-w-0 flex-1 py-0.5">
            <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-[1rem] leading-snug font-semibold">
              <span lang={p.title.lang !== locale ? p.title.lang : undefined} data-testid="promo-title">
                {p.title.text}
              </span>
              {p.badge && (
                <span
                  className="bg-badge text-on-badge rounded-pill px-2.5 py-0.5 text-[0.8125rem] leading-5 font-bold whitespace-nowrap"
                  data-testid="promo-badge"
                >
                  {p.badge}
                </span>
              )}
            </p>
            {p.text && (
              <p
                className="text-muted m-0 mt-0.5 text-[0.9375rem] leading-snug"
                lang={p.text.lang !== locale ? p.text.lang : undefined}
              >
                {p.text.text}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => close(p.id)}
            aria-label={t("menu.promoClose")}
            className="text-muted grid size-11 flex-none place-items-center rounded-full"
          >
            <X size={20} aria-hidden />
          </button>
        </aside>
      ))}
    </>
  );
}
