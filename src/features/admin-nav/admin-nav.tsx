"use client";

import { clsx } from "clsx";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { activeHref } from "./active";
import { NAV_ICONS, type NavIcon } from "./nav-icons";

export type NavLink = { href: string; label: string; icon: NavIcon; sub?: boolean };

// The owner's sections (ADR-055). From 1024 px: a sidebar with icons, the
// current section tinted and bold. Below: a compact bar with the café, and a
// sticky row of the same sections that scrolls sideways (the current one is
// scrolled into view), so every section is one tap away on a phone.
export function AdminNav({
  brand,
  cafe,
  label,
  links,
}: {
  brand: string;
  cafe: string;
  label: string;
  links: readonly NavLink[];
}) {
  const pathname = usePathname();
  const active = activeHref(
    pathname,
    links.map((l) => l.href),
  );
  const row = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const list = row.current;
    const current = list?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!list || !current || list.scrollWidth <= list.clientWidth) return;
    // Centre the current tab without moving the page (scrollIntoView would).
    list.scrollLeft = current.offsetLeft - (list.clientWidth - current.offsetWidth) / 2;
  }, [active]);

  return (
    <>
      {/* Phones and tablets */}
      <div className="flex min-h-14 items-center gap-3 bg-white px-4 lg:hidden print:hidden">
        <Link href="/admin" className="flex min-h-11 min-w-0 flex-1 flex-col justify-center rounded-lg">
          <span className="text-staff-label2 text-[0.8125rem] leading-tight font-semibold">{brand}</span>
          <span className="truncate text-[1.0625rem] leading-tight font-bold">{cafe}</span>
        </Link>
      </div>
      <nav
        aria-label={label}
        className="border-staff-sep sticky top-0 z-30 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 lg:hidden print:hidden"
      >
        <ul ref={row} className="admin-scroll-row flex gap-1 overflow-x-auto px-3 pt-1 pb-2">
          {links.map((l) => {
            const Icon = NAV_ICONS[l.icon];
            const current = l.href === active;
            return (
              <li key={l.href} className="shrink-0">
                <Link
                  href={l.href}
                  aria-current={current ? "page" : undefined}
                  className={clsx(
                    "flex min-h-11 items-center gap-2 rounded-full px-3.5 text-[0.9375rem] font-semibold whitespace-nowrap",
                    current ? "bg-tarragon text-white" : "bg-staff-fill text-ink",
                  )}
                >
                  <Icon aria-hidden="true" className="size-[1.125rem] shrink-0" />
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Desktop sidebar */}
      <aside className="border-staff-sep hidden border-r bg-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-64 lg:shrink-0 lg:flex-col lg:overflow-y-auto print:hidden">
        <div className="flex flex-col gap-6 px-3 py-6">
          <Link href="/admin" className="flex flex-col rounded-lg px-3 py-1">
            <span className="text-staff-label2 text-[0.8125rem] font-semibold">{brand}</span>
            <span className="text-[1.25rem] leading-tight font-bold break-words">{cafe}</span>
          </Link>
          <SidebarLinks label={label} links={links} active={active} />
        </div>
      </aside>
    </>
  );
}

function SidebarLinks({
  label,
  links,
  active,
}: {
  label: string;
  links: readonly NavLink[];
  active: string | null;
}) {
  // A second landmark with the same name would be ambiguous; the sidebar
  // only exists from 1024 px, where the row is hidden (display: none).
  return (
    <nav aria-label={label}>
      <ul className="flex flex-col gap-0.5">
        {links.map((l) => {
          const Icon = NAV_ICONS[l.icon];
          const current = l.href === active;
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={current ? "page" : undefined}
                className={clsx(
                  "flex min-h-11 items-center gap-3 rounded-[0.625rem] px-3 text-[0.9375rem]",
                  l.sub && "pl-6",
                  current ? "bg-tarragon-tint text-tarragon font-bold" : "text-ink font-semibold",
                )}
              >
                <Icon aria-hidden="true" className={clsx("shrink-0", l.sub ? "size-4" : "size-5")} />
                <span className="min-w-0 break-words">{l.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
