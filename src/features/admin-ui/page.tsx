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
  inlineActions = false,
  className,
  children,
}: {
  // Keep the actions on the title's line at every width (a compact "More"),
  // instead of a row of their own under the subtitle below 1280 px.
  inlineActions?: boolean;
  className?: string;
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
        // Groups are split by 40-48 px of space (ADR-094), not by card edges.
        // From 1024 px the column is anchored to the sidebar (h1 always at
        // 240 + 40 px), so the title never jumps between pages; the width
        // is only a cap on the right.
        "flex w-full flex-col gap-10 px-4 pt-6 pb-16 sm:px-6 lg:gap-12 lg:px-10 lg:pt-10",
        { sm: "max-w-[45rem]", md: "max-w-[65rem]", lg: "max-w-[77rem]", xl: "max-w-[85rem]" }[width],
        className,
      )}
    >
      {/* Title and actions side by side only from 1280 px, where the title
          keeps at least 14 characters; below that the actions follow the
          subtitle, so a long word in the title never splits. */}
      <header
        className={clsx(
          "mb-2 grid print:hidden",
          inlineActions
            ? "grid-cols-[minmax(0,1fr)_auto] gap-x-3 xl:gap-x-8"
            : "grid-cols-[minmax(0,1fr)] xl:grid-cols-[minmax(14ch,1fr)_auto] xl:gap-x-8",
        )}
      >
        {back && (
          <Link
            href={back.href}
            className={clsx(
              "text-ink -ml-1 mb-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-lg pr-2 text-name font-semibold",
              inlineActions ? "col-span-2" : "xl:col-span-2",
            )}
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
            {back.label}
          </Link>
        )}
        <h1 className="page-title m-0 min-w-0 text-large break-words sm:text-figure">{title}</h1>
        {subtitle && (
          <div
            className={clsx(
              "text-staff-label2 mt-2 max-w-[60ch] text-name leading-normal",
              inlineActions ? "col-span-2 xl:col-span-1" : "xl:col-start-1",
            )}
          >
            {subtitle}
          </div>
        )}
        {actions && (
          <div
            className={clsx(
              inlineActions
                ? "col-start-2 flex items-center justify-end gap-2 self-center"
                : "mt-4 flex flex-wrap items-center gap-2 max-sm:*:flex-1 xl:col-start-2 xl:mt-1 xl:self-start xl:justify-end",
              inlineActions ? (back ? "row-start-2" : "row-start-1") : back ? "xl:row-start-2" : "xl:row-start-1",
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
// the page itself (ADR-094; it was a white card on grey).
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
      {/* The shared group header: the actions sit on the heading's line,
          centred on it; the hint runs under both at full width. */}
      <div className="flex min-w-0 flex-col gap-0.5">
        {/* The actions never drop under the heading: the heading wraps
            instead, and keeps a 44 px line so both share one centre. */}
        <div className="flex items-start justify-between gap-x-3">
          <h2 id={id} className={clsx(sectionTitle, "flex min-h-11 min-w-0 flex-1 items-center")}>
            {title}
          </h2>
          {actions && <div className="-mr-2 flex shrink-0 flex-wrap items-center justify-end gap-1">{actions}</div>}
        </div>
        {hint && <p className="text-staff-label2 m-0 max-w-[60ch] text-label">{hint}</p>}
      </div>
      {bare ? (
        children
      ) : (
        // ADR-094: no card. A hairline under the heading opens the group; the
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
  // Hairline rows on the page, starting at the page's edge like every heading.
  return <div className="border-staff-sep flex min-w-0 flex-col border-t">{children}</div>;
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
      <summary className="flex min-h-16 cursor-pointer list-none items-center gap-3 py-3 [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <h3 className={cardTitle}>{title}</h3>
          {value && <span className="text-staff-label2 text-label break-words">{value}</span>}
        </span>
        <ChevronDown
          aria-hidden="true"
          className="text-staff-label2 size-5 shrink-0 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="flex flex-col gap-4 pt-1 pb-6">
        {hint && <p className="text-staff-label2 m-0 max-w-[60ch] text-label">{hint}</p>}
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
