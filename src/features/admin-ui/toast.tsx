"use client";

import { clsx } from "clsx";
import { CircleAlert, CircleCheck } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

// Sonner-style toasts without the package (ADR-055): short confirmations at
// the bottom on phones, the top right from 1024 px, gone after 4 s or on tap.
// Errors stay inline next to what failed; toasts only confirm.
type Toast = { id: number; text: string; tone: "ok" | "error" };
type Push = (text: string, tone?: Toast["tone"]) => void;

const ToastContext = createContext<Push>(() => {});

export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), []);
  const push = useCallback<Push>(
    (text, tone = "ok") => {
      const id = next.current++;
      setToasts((all) => [...all.slice(-2), { id, text, tone }]);
      setTimeout(() => dismiss(id), 4000);
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
          <button
            key={t.id}
            type="button"
            role="status"
            data-testid="toast"
            onClick={() => dismiss(t.id)}
            className="admin-rise bg-ink shadow-float pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-left text-[0.9375rem] font-semibold text-white"
          >
            {t.tone === "ok" ? (
              <CircleCheck aria-hidden="true" className={clsx("text-tarragon-on-dark size-5 shrink-0")} />
            ) : (
              <CircleAlert aria-hidden="true" className="text-pom-on-dark size-5 shrink-0" />
            )}
            {t.text}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
