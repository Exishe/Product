import { clsx } from "clsx";
import { ChevronDown, ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cardTitle, sectionTitle } from "./styles";

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
        // Groups are split by 40-48 px of space (ADR-093), not by card edges.
        "mx-auto flex w-full flex-col gap-10 px-4 pt-6 pb-16 sm:px-6 lg:gap-12 lg:px-8 lg:pt-10",
        { sm: "max-w-2xl", md: "max-w-4xl", lg: "max-w-6xl", xl: "max-w-7xl" }[width],
      )}
    >
      {/* Title on its own row with the actions on the right (from 768 px), the
          subtitle under it. On phones the actions follow the subtitle, full width. */}
      <header className="mb-2 grid grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-8">
        {back && (
          <Link
            href={back.href}
            className="text-ink -ml-1 mb-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg pr-2 text-[1.0625rem] font-semibold md:col-span-2"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
            {back.label}
          </Link>
        )}
        <h1 className="page-title m-0 text-large break-words sm:text-figure">{title}</h1>
        {subtitle && (
          <div className="text-staff-label2 mt-2 max-w-[60ch] text-[1.0625rem] leading-normal md:col-start-1">
            {subtitle}
          </div>
        )}
        {actions && (
          <div
            className={clsx(
              "mt-4 flex flex-wrap items-center gap-2 max-md:*:flex-1 md:col-start-2 md:mt-1 md:flex-nowrap md:self-start md:justify-end",
              back ? "md:row-start-2" : "md:row-start-1",
            )}
          >
            {actions}
          </div>
        )}
      </header>
      {children}
    </main>
  );
}

// A titled group of content: a 20 px heading, a hairline, then the content on
// the page itself (ADR-093; it was a white card on grey).
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
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="flex min-w-0 flex-col">
          <h2 id={id} className={sectionTitle}>
            {title}
          </h2>
          {hint && <p className="text-staff-label2 m-0 text-label">{hint}</p>}
        </div>
        {actions}
      </div>
      {bare ? (
        children
      ) : (
        // ADR-093: no card. A hairline under the heading opens the group; the
        // content keeps the page's left edge.
        <div className="border-staff-sep flex flex-col gap-3 border-t pt-4">{children}</div>
      )}
    </section>
  );
}

// Settings that are set once and rarely touched: one white group, each setting
// a closed row that shows its current value, opened in place (native <details>,
// so it works before hydration and with the keyboard).
export function SettingsList({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-col rounded-2xl bg-white">{children}</div>;
}

export function SettingsItem({
  title,
  value,
  hint,
  testId,
  children,
}: {
  title: ReactNode;
  value?: ReactNode;
  hint?: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <details data-testid={testId} className="group border-staff-sep min-w-0 border-b last:border-0">
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className={cardTitle}>{title}</h3>
          {value && <span className="text-staff-label2 text-[0.9375rem] break-words">{value}</span>}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="text-staff-label2 size-5 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="flex flex-col gap-4 px-4 pt-1 pb-5 sm:px-5">
        {hint && <p className="text-staff-label2 m-0 max-w-[60ch] text-[0.9375rem]">{hint}</p>}
        {children}
      </div>
    </details>
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
          info: "text-ink [&>svg]:text-staff-label2 bg-staff-bg",
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
