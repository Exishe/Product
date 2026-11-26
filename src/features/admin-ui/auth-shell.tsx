import type { ReactNode } from "react";

// Sign-in, sign-up, device pairing, "create your café" (ADR-055) and the 404:
// the app mark, a title, one helper line and the form, all in one 400 px
// column on one white page and one 16 px left edge (ADR-093: no card around
// the form). `bare` is kept for callers; both render the same now.
export function AuthShell({
  brand,
  title,
  subtitle,
  footer,
  bare,
  children,
}: {
  brand: string;
  title: string;
  subtitle?: ReactNode;
  footer?: ReactNode;
  bare?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="admin-shell text-ink min-h-dvh bg-white">
      <main className="mx-auto flex min-h-dvh w-full max-w-[25rem] flex-col justify-center gap-8 px-4 py-10 sm:px-0">
        <div className="flex flex-col items-start gap-4">
          <p className="m-0 flex items-center gap-2.5 text-[1.0625rem] font-bold">
            <svg aria-hidden="true" viewBox="0 0 64 64" className="size-10 shrink-0">
              <rect width="64" height="64" rx="32" fill="#1B1D21" />
              <circle cx="32" cy="32" r="19" fill="none" stroke="#FFFFFF" strokeWidth="4" />
              <circle cx="32" cy="32" r="8" fill="#E0A33A" />
            </svg>
            {brand}
          </p>
          <div className="flex flex-col gap-2">
            <h1 className="font-display m-0 text-figure font-normal">{title}</h1>
            {subtitle && <div className="text-staff-label2 text-[1.0625rem] text-balance">{subtitle}</div>}
          </div>
        </div>
        {bare ? children : <div className="flex flex-col">{children}</div>}
        {footer && <div className="text-staff-label2 text-body">{footer}</div>}
      </main>
    </div>
  );
}
