import type { ReactNode } from "react";

// Sign-in, sign-up and "create your café" (ADR-055): the app mark, a large
// title and one grouped card on the staff grey, centred on every screen.
export function AuthShell({
  brand,
  title,
  subtitle,
  footer,
  children,
}: {
  brand: string;
  title: string;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="admin-shell bg-staff-bg text-ink min-h-dvh">
      <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10 sm:px-6">
        <div className="flex flex-col items-start gap-4">
          <p className="m-0 flex items-center gap-2.5 text-[1.0625rem] font-bold">
            <svg aria-hidden="true" viewBox="0 0 64 64" className="size-10 shrink-0">
              <rect width="64" height="64" rx="32" fill="#1B1D21" />
              <circle cx="32" cy="32" r="19" fill="none" stroke="#FFFFFF" strokeWidth="4" />
              <circle cx="32" cy="32" r="8" fill="#E0A33A" />
            </svg>
            {brand}
          </p>
          <div className="flex flex-col gap-1">
            <h1 className="page-title m-0 text-[2.75rem]">{title}</h1>
            {subtitle && <div className="text-staff-label2 text-[1.0625rem]">{subtitle}</div>}
          </div>
        </div>
        <div className="rounded-2xl bg-white p-4 sm:p-6">{children}</div>
        {footer && <div className="text-staff-label2 px-1 text-[1.0625rem]">{footer}</div>}
      </main>
    </div>
  );
}
