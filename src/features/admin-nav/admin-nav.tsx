"use client";

import { clsx } from "clsx";
import { Check, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet } from "@/features/admin-ui/sheet";
import { activeLink } from "./active";
import { NAV_ICONS, type NavIcon } from "./nav-icons";

// `also`: other pages this item stands for (Sales covers Reports and Export).
export type NavLink = { href: string; label: string; icon: NavIcon; also?: readonly string[] };

// The owner's sections (ADR-055, ADR-093, at most seven). From 1024 px: a
// sidebar flush on the grey, one line per item, the current one a tinted row.
// Below: one 56 px bar with the café's name and a Pages button that opens
// the same list in a sheet, so every section is visible at once on a phone.
export function AdminNav({
  brand,
  cafe,
  label,
  menuLabel,
  closeLabel,
  links,
}: {
  brand: string;
  cafe: string;
  label: string;
  menuLabel: string;
  closeLabel: string;
  links: readonly NavLink[];
}) {
  const pathname = usePathname();
  const active = activeLink(pathname, links);
  // The sheet belongs to the page it was opened on: a link closes it, and so
  // does any other change of address (Back, a link in the page).
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;

  return (
    <>
      {/* Phones and tablets: one bar with the café's name on every page, so
          the owner always sees whose admin this is. */}
      <header className="border-staff-sep sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-white pr-2 pl-4 lg:hidden print:hidden">
        <Link
          href="/admin"
          className="flex min-h-11 min-w-0 flex-1 items-center rounded-lg"
          data-testid="admin-bar-home"
        >
          <span className="page-title truncate text-heading">{cafe || brand}</span>
        </Link>
        <button
          type="button"
          onClick={() => setOpenOn(pathname)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="text-ink hover:bg-staff-fill inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full px-4 text-label font-semibold"
          data-testid="admin-menu-button"
        >
          <Menu aria-hidden="true" className="size-5" />
          {menuLabel}
        </button>
      </header>
      {open && (
        <Sheet title={cafe} closeLabel={closeLabel} onClose={() => setOpenOn(null)} fit testId="admin-menu-sheet">
          <NavList label={label} links={links} active={active} size="sheet" onPick={() => setOpenOn(null)} />
        </Sheet>
      )}

      {/* Desktop sidebar: flush on the grey page (ADR-093), no card, no shadow. */}
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-dvh lg:w-60 lg:shrink-0 lg:flex-col lg:overflow-y-auto lg:px-3 print:hidden">
        <div className="flex flex-col gap-6 py-6">
          <Link href="/admin" className="flex min-w-0 flex-col rounded-lg px-3 py-1">
            <span className="text-staff-label2 text-meta font-semibold">{brand}</span>
            <span className="page-title truncate text-[1.75rem]" title={cafe}>
              {cafe}
            </span>
          </Link>
          <NavList label={label} links={links} active={active} size="sidebar" />
        </div>
      </aside>
    </>
  );
}

function NavList({
  label,
  links,
  active,
  size,
  onPick,
}: {
  label: string;
  links: readonly NavLink[];
  active: string | null;
  size: "sidebar" | "sheet";
  onPick?: () => void;
}) {
  // Only one of the two lists is ever shown (the sidebar is display: none
  // below 1024 px, the sheet only opens there), so one landmark name is safe.
  return (
    <nav aria-label={label}>
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {links.map((l) => {
          const Icon = NAV_ICONS[l.icon];
          const current = l.href === active;
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                onClick={onPick}
                aria-current={current ? "page" : undefined}
                title={size === "sidebar" ? l.label : undefined}
                className={clsx(
                  "flex items-center rounded-xl",
                  size === "sidebar" ? "min-h-11 gap-2.5 px-3 text-label" : "min-h-12 gap-3 px-3 text-name",
                  // Current: on the grey sidebar a white row (Linear); in the white
                  // sheet a tinted row and a check, never colour or weight alone.
                  current
                    ? clsx("text-ink font-semibold", size === "sidebar" ? "bg-white" : "bg-staff-fill")
                    : "text-ink font-medium hover:bg-black/[0.04]",
                )}
              >
                <Icon
                  aria-hidden="true"
                  className={clsx("size-5 shrink-0", current ? "text-ink" : "text-staff-label2")}
                />
                <span className="min-w-0 flex-1 truncate">{l.label}</span>
                {current && size === "sheet" && <Check aria-hidden="true" className="text-ink size-5 shrink-0" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
