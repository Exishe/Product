"use client";

import { clsx } from "clsx";
import { CircleAlert, CircleCheck } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

// Sonner-style toasts without the package (ADR-055): short confirmations at
// the bottom on phones, the top right from 1024 px, gone after 4 s or on tap.
// A toast may carry one action (Undo); it then stays 5 s. Errors that belong
// to a field stay inline next to it; a toast reports a one-tap change.
type Action = { label: string; run: () => void };
type Toast = { id: number; text: string; tone: "ok" | "error"; action?: Action };
type Push = (text: string, tone?: Toast["tone"], action?: Action) => void;

const ToastContext = createContext<Push>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback<Push>(
    (text, tone = "ok", action) => {
      const id = next.current++;
      setToasts((all) => [...all.slice(-2), { id, text, tone, action }]);
      setTimeout(() => dismiss(id), action ? 5000 : 4000);
    },
    [dismiss],
  );
  const value = useMemo(() => push, [push]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] z-50 flex flex-col items-center gap-2 px-4 lg:top-4 lg:right-4 lg:bottom-auto lg:left-auto lg:items-end print:hidden"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            data-testid="toast"
            data-tone={t.tone}
            className={clsx(
              "admin-rise shadow-float pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl py-2 pr-2 pl-4 text-label font-semibold text-white",
              t.tone === "ok" ? "bg-ink" : "bg-pomegranate",
            )}
          >
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="flex min-h-10 min-w-0 flex-1 items-center gap-3 text-left"
            >
              {t.tone === "ok" ? (
                <CircleCheck aria-hidden="true" className="text-tarragon-on-dark size-5 shrink-0" />
              ) : (
                <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
              )}
              <span className="min-w-0">{t.text}</span>
            </button>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action?.run();
                  dismiss(t.id);
                }}
                className="min-h-11 shrink-0 rounded-full px-3 text-white underline underline-offset-4"
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
