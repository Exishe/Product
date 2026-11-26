"use client";

import { X } from "./icons";
import { useCallback, useSyncExternalStore, type ReactNode } from "react";

// The browser's half of a promo banner (promo-banner.tsx): a guest can close
// one for this visit only. The closed ids are kept in sessionStorage, so a new
// promo still shows.
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

export function PromoShell({
  id,
  label,
  closeLabel,
  children,
}: {
  id: string;
  label: string;
  closeLabel: string;
  children: ReactNode;
}) {
  const closed = useSyncExternalStore(subscribe, read, () => "");
  const close = useCallback(() => {
    try {
      sessionStorage.setItem(KEY, [...new Set([...read().split(",").filter(Boolean), id])].join(","));
    } catch {
      // Private mode: the banner just stays.
    }
    listeners.forEach((l) => l());
  }, [id]);

  if (closed.split(",").includes(id)) return null;
  return (
    <aside
      aria-label={label}
      data-testid="promo-banner"
      className="text-ink border-line flex items-start gap-3 border-b pb-3"
    >
      <div className="min-w-0 flex-1 pt-2.5">{children}</div>
      <button
        type="button"
        onClick={close}
        aria-label={closeLabel}
        className="text-muted hover:text-ink hover:bg-chip -mr-2.5 grid size-11 flex-none place-items-center rounded-full"
      >
        <X size={20} aria-hidden />
      </button>
    </aside>
  );
}
