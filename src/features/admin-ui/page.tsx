import { clsx } from "clsx";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

// The frame of every admin page (ADR-055): a large title in the UI font,
// an optional subtitle and actions on the right, grouped content below.
export function AdminPage({
  title,
  subtitle,
  actions,
  back,
  width = "md",
  children,
}: {
  back?: { href: string; label: string };
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
  children: ReactNode;
}) {
  return (
    <main
      className={clsx(
        "mx-auto flex w-full flex-col gap-6 px-4 pt-6 pb-12 sm:px-6 lg:px-8 lg:pt-10",
        { sm: "max-w-2xl", md: "max-w-4xl", lg: "max-w-6xl", xl: "max-w-7xl" }[width],
      )}
    >
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          {back && (
            <Link
              href={back.href}
              className="text-ink -ml-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg pr-2 text-[1.0625rem] font-semibold"
            >
              <ChevronLeft aria-hidden="true" className="size-5" />
              {back.label}
            </Link>
          )}
          <h1 className="page-title m-0 text-[2.375rem] break-words sm:text-[3rem]">{title}</h1>
          {subtitle && <div className="text-staff-label2 max-w-prose text-[1.0625rem]">{subtitle}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </main>
  );
}

// A titled group of content (iOS section header above a white card).
export function Section({
  title,
  hint,
  id,
  testId,
  children,
  bare,
  actions,
}: {
  title: ReactNode;
  hint?: ReactNode;
  id?: string;
  testId?: string;
  children: ReactNode;
  bare?: boolean;
  actions?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} data-testid={testId} className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-end justify-between gap-2 px-1">
        <div className="flex min-w-0 flex-col">
          <h2 id={id} className="m-0 text-[1.1875rem] leading-tight font-semibold break-words">
            {title}
          </h2>
          {hint && <p className="text-staff-label2 m-0 text-[0.9375rem]">{hint}</p>}
        </div>
        {actions}
      </div>
      {bare ? (
        children
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl bg-white p-4 sm:p-5">{children}</div>
      )}
    </section>
  );
}

// A status line with an icon: never colour alone.
export function Notice({
  tone,
  icon,
  role,
  testId,
  children,
  className,
}: {
  tone: "info" | "ok" | "wait" | "alert";
  icon: ReactNode;
  role?: "status" | "alert";
  testId?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role={role}
      data-testid={testId}
      className={clsx(
        "flex items-start gap-3 rounded-[var(--radius-soft)] px-4 py-3 text-[1.0625rem] [&>svg]:mt-0.5 [&>svg]:size-5 [&>svg]:shrink-0",
        {
          info: "text-ink [&>svg]:text-staff-label2 bg-white shadow-[var(--shadow-soft)]",
          ok: "bg-tarragon-tint text-ink [&>svg]:text-tarragon",
          wait: "text-ink [&>svg]:text-amber-text bg-amber-tint",
          alert: "bg-pom-tint text-pomegranate",
        }[tone],
        className,
      )}
    >
      {icon}
      <div className="flex min-w-0 flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}
