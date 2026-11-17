"use client";

import { clsx } from "clsx";
import { useRef, type ReactNode } from "react";

// A segmented control with the ARIA tabs pattern (shadcn/ui's Tabs, without
// Radix): arrow keys move between tabs, only the current one is in the tab
// order. The caller keeps the value and renders each panel with tabPanel().
export function Tabs<K extends string>({
  id,
  label,
  value,
  onChange,
  items,
  className,
}: {
  id: string;
  label: string;
  value: K;
  onChange: (key: K) => void;
  items: readonly { key: K; label: ReactNode }[];
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (from: number, step: number) => {
    const i = (from + step + items.length) % items.length;
    const item = items[i];
    if (!item) return;
    onChange(item.key);
    refs.current[i]?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label={label}
      className={clsx("bg-staff-fill grid auto-cols-fr grid-flow-col gap-1 rounded-xl p-1", className)}
    >
      {items.map((item, i) => {
        const on = item.key === value;
        return (
          <button
            key={item.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${id}-${item.key}`}
            aria-selected={on}
            aria-controls={`${id}-${item.key}-panel`}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(item.key)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") move(i, 1);
              else if (e.key === "ArrowLeft") move(i, -1);
              else return;
              e.preventDefault();
            }}
            className={clsx(
              "flex min-h-11 items-center justify-center gap-2 rounded-[0.625rem] px-3 text-[0.9375rem] font-semibold [&_svg]:size-4",
              on ? "text-ink bg-white shadow-sm" : "text-staff-label2",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

// Props for the panel that belongs to a tab.
export const tabPanel = (id: string, key: string) => ({
  role: "tabpanel" as const,
  id: `${id}-${key}-panel`,
  "aria-labelledby": `${id}-${key}`,
});
