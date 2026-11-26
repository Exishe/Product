"use client";

import { clsx } from "clsx";
import { Ellipsis } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

// «…» in a staff header (the waiter app and the kitchen board): the occasional
// tools live behind it, so the row a busy hand reaches for stays short (Toast
// and Square keep device actions behind a menu too). A panel under the button,
// not a dialog, so the sheets its rows open stack above it; a tap outside or
// Escape closes it.
export function HeaderMenu({
  label,
  testId,
  buttonClassName,
  panelClassName,
  badge = 0,
  children,
}: {
  label: string;
  testId: string;
  buttonClassName: string;
  panelClassName: string;
  /** A count on the button for something inside that needs attention. */
  badge?: number;
  /** Rows; a row that opens something outside the menu calls `close` first. */
  children: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    // A sheet opened from the menu handles its own Escape.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("dialog[open]")) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        data-testid={testId}
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        title={label}
        onClick={() => setOpen((v) => !v)}
        className={clsx("relative", buttonClassName)}
      >
        <Ellipsis aria-hidden="true" className="size-6" />
        {badge > 0 && (
          <span
            aria-hidden="true"
            className="num bg-pomegranate absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full px-1 text-[0.8125rem] leading-none font-bold text-white"
          >
            {badge}
          </span>
        )}
      </button>
      <div
        id={id}
        role="group"
        aria-label={label}
        hidden={!open}
        className={clsx(
          "admin-fade absolute top-full right-0 z-30 mt-2 grid w-[min(22rem,calc(100vw-2rem))] gap-1 rounded-[var(--radius-soft)] border p-2 shadow-[var(--shadow-soft-float)] [&[hidden]]:hidden",
          panelClassName,
        )}
      >
        {typeof children === "function" ? children(() => setOpen(false)) : children}
      </div>
    </div>
  );
}
