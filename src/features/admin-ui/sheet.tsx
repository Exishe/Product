"use client";

import { clsx } from "clsx";
import { X } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

// Whether a media query matches, kept in sync (false while rendering on the server).
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", notify);
      return () => list.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

// A modal sheet on the native <dialog> (shadcn/ui's Sheet, without Radix):
// focus moves in, Escape and the close button close it, the page behind is
// inert. A bottom sheet on phones; from 768 px a panel on the right edge.
export function Sheet({
  title,
  closeLabel,
  onClose,
  footer,
  children,
  testId,
  fit,
}: {
  // fit: as tall as its content on phones (a short list), not 92 % of the screen.
  fit?: boolean;
  title: ReactNode;
  closeLabel: string;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (!d.open) d.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      close.current();
    };
    d.addEventListener("cancel", onCancel);
    return () => {
      d.removeEventListener("cancel", onCancel);
      if (d.open) d.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby="sheet-title"
      data-testid={testId}
      className={clsx(
        "admin-rise admin-sheet-side bg-white text-ink shadow-float m-0 flex max-h-none max-w-none flex-col overflow-hidden p-0 backdrop:bg-black/40 [&:not([open])]:hidden",
        // phone: a bottom sheet, 92 % of the screen tall
        fit
          ? "inset-x-0 top-auto bottom-0 h-auto max-h-[92dvh] w-full rounded-t-[1.25rem]"
          : "inset-x-0 top-auto bottom-0 h-[92dvh] w-full rounded-t-[1.25rem]",
        // tablet: a panel on the right edge, full height
        "md:inset-y-0 md:right-0 md:left-auto md:h-dvh md:w-[28rem] md:rounded-none md:rounded-l-[1.25rem]",
      )}
    >
      <header className="border-staff-sep flex min-h-14 shrink-0 items-center gap-2 border-b bg-white px-4">
        <h2 id="sheet-title" className="m-0 min-w-0 flex-1 truncate text-heading font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={() => close.current()}
          aria-label={closeLabel}
          className="bg-staff-fill text-staff-label2 inline-grid size-11 shrink-0 place-items-center rounded-full"
        >
          <X aria-hidden="true" className="size-5" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
      {footer && (
        <footer className="border-staff-sep shrink-0 border-t bg-white px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          {footer}
        </footer>
      )}
    </dialog>
  );
}
