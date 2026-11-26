"use client";

import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { button } from "./styles";

// "More": the page's rarely used links behind one secondary button (a
// disclosure, not an ARIA menu: the items are plain links). Closes on a pick,
// Escape, a tap outside or a change of page.
export function MoreMenu({
  label,
  items,
  testId,
}: {
  label: string;
  items: readonly { href: string; label: string; icon?: ReactNode; hint?: string }[];
  testId?: string;
}) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpenOn(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpenOn(null);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative max-sm:!flex-none" data-testid={testId}>
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpenOn(open ? null : pathname)}
        className={button("secondary")}
      >
        <MoreHorizontal aria-hidden="true" />
        {label}
      </button>
      <ul
        id={id}
        hidden={!open}
        className="admin-fade shadow-float ring-staff-sep absolute top-full right-0 z-40 m-0 mt-2 flex w-[min(20rem,calc(100vw-2rem))] list-none flex-col rounded-[var(--radius-soft)] bg-white p-1.5 ring-1 max-sm:left-0 [&[hidden]]:hidden"
      >
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={() => setOpenOn(null)}
              className="text-ink hover:bg-staff-bg flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 text-name font-medium [&_svg]:text-staff-label2 [&_svg]:size-5 [&_svg]:shrink-0"
            >
              {item.icon}
              <span className="flex min-w-0 flex-col">
                <span>{item.label}</span>
                {item.hint && <span className="text-staff-label2 text-label font-normal">{item.hint}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
