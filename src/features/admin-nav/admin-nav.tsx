"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { activeHref } from "./active";

export type NavLink = { href: string; label: string; sub?: boolean };

// The owner's sidebar from design/import.html: brand, café name, sections.
// Below 1024 px it becomes a scrollable row of tabs under the café name.
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
  return (
    <aside className="border-line border-b bg-white lg:sticky lg:top-0 lg:h-dvh lg:w-58 lg:shrink-0 lg:border-r lg:border-b-0 print:hidden">
      <div className="flex flex-col gap-3 px-4 pt-4 lg:gap-6 lg:px-4 lg:py-6">
        <Link href="/admin" className="rounded-chip flex flex-col">
          <span className="text-muted text-sm font-bold">{brand}</span>
          <span className="display-face text-2xl leading-tight break-words">{cafe}</span>
        </Link>
        <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
          <ul className="flex gap-1 pb-3 lg:flex-col lg:gap-0.5 lg:pb-0">
            {links.map((l) => {
              const current = l.href === active;
              return (
                <li key={l.href} className="shrink-0">
                  <Link
                    href={l.href}
                    aria-current={current ? "page" : undefined}
                    className={[
                      "rounded-chip flex min-h-11 items-center px-3 font-semibold whitespace-nowrap lg:whitespace-normal",
                      l.sub ? "lg:pl-6 lg:font-normal" : "",
                      current ? "bg-tarragon-tint text-tarragon" : "text-ink hover:bg-mist",
                    ].join(" ")}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
