"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import styles from "./guest.module.css";
import { groupSections, type SectionGroup } from "./section-groups";
import { Txt } from "./ui";
import type { GuestCategory } from "./view-model";

export const sectionId = (id: string) => `cat-${id}`;

/** Scrolls to a section; returns until when it stays the current one. */
function scrollToSection(id: string): number {
  document.getElementById(sectionId(id))?.scrollIntoView({ behavior: smooth(), block: "start" });
  return performance.now() + 1500;
}

const smooth = () => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

type Bucket = { key: SectionGroup | "all"; sections: GuestCategory[] };

// The sticky section bar: a few big groups (Food, Desserts, Drinks, Wine),
// each a dropdown with its own sections, so even a 39-section bar list is two
// taps from any dish and never a long strip to scroll sideways. The group
// the page is in is filled; opening one shows its sections with the current
// one marked. On a mouse a group opens on hover as well as on click; touch
// and keyboard use click, Enter or Space; Escape and a tap outside close it.
// A menu whose sections fall into one group gets a single «Sections»
// dropdown.
export function CategoryNav({
  categories,
  belowBar = false,
}: {
  categories: GuestCategory[];
  /** The slim bar is showing above. */ belowBar?: boolean;
}) {
  const { t, locale } = useGuestI18n();
  const wrap = useRef<HTMLElement>(null);
  const [active, setActive] = useState(categories[0]?.id ?? null);
  const [open, setOpen] = useState<Bucket["key"] | null>(null);
  // After a tap, its section stays current while the page scrolls there.
  const holdUntil = useRef(0);
  const closeTimer = useRef(0);
  const current = categories.some((c) => c.id === active) ? active : (categories[0]?.id ?? null);

  const buckets: Bucket[] = useMemo(() => {
    const groups = groupSections(categories.map((c) => ({ ...c, name: c.name })));
    return groups.length < 2
      ? [{ key: "all", sections: categories }]
      : groups.map((g) => ({ key: g.group, sections: g.sections as GuestCategory[] }));
  }, [categories]);
  const label = (b: Bucket) => (b.key === "all" ? t("menu.sections") : t(`menu.groups.${b.key}`));
  const currentBucket = buckets.find((b) => b.sections.some((s) => s.id === current));
  const openBucket = buckets.find((b) => b.key === open);

  const go = (id: string) => {
    setActive(id);
    setOpen(null);
    holdUntil.current = scrollToSection(id);
  };

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      // Sections scroll to just under the slim bar and the bar of groups.
      const bar = wrap.current;
      const offset = (bar ? Math.max(bar.getBoundingClientRect().bottom, 80) : 80) + 24;
      let id = categories[0]?.id ?? null;
      for (const c of categories) {
        const el = document.getElementById(sectionId(c.id));
        if (el && el.getBoundingClientRect().top <= offset) id = c.id;
      }
      setActive(id);
    };
    const onScroll = () => {
      if (performance.now() < holdUntil.current) return;
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onScrollEnd = () => {
      holdUntil.current = 0;
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("scrollend", onScrollEnd);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("scrollend", onScrollEnd);
      cancelAnimationFrame(frame);
    };
  }, [categories]);

  // A tap outside or Escape closes the open group.
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (wrap.current && e.target instanceof Node && !wrap.current.contains(e.target)) setOpen(null);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  if (categories.length < 2) return null;
  return (
    <nav
      ref={wrap}
      aria-label={t("menu.categories")}
      data-current={current ?? undefined}
      className={`bg-page/92 sticky z-10 -mx-4 px-4 py-2.5 backdrop-blur-md transition-[top] duration-200 motion-reduce:transition-none md:-mx-8 md:px-8 ${belowBar ? "top-16" : "top-0"}`}
      onKeyDown={(e) => {
        if (e.key !== "Escape" || !open) return;
        setOpen(null);
        wrap.current?.querySelector<HTMLElement>(`[data-group="${open}"]`)?.focus();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        window.clearTimeout(closeTimer.current);
        closeTimer.current = window.setTimeout(() => setOpen(null), 220);
      }}
      onPointerEnter={() => window.clearTimeout(closeTimer.current)}
    >
      <div className="flex gap-1.5 overflow-x-auto sm:gap-2 [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
        {buckets.map((b) => {
          const isOpen = open === b.key;
          const here = currentBucket?.key === b.key;
          return (
            <button
              key={b.key}
              type="button"
              data-group={b.key}
              data-testid={`group-${b.key}`}
              aria-expanded={isOpen}
              aria-controls={`sections-${b.key}`}
              onClick={() => setOpen(isOpen ? null : b.key)}
              onPointerEnter={(e) => {
                if (e.pointerType === "mouse") setOpen(b.key);
              }}
              className={`rounded-pill flex min-h-11 flex-auto items-center justify-center gap-1.5 border px-3 text-[0.9375rem] font-semibold sm:text-base whitespace-nowrap transition-colors duration-150 sm:px-3 md:flex-none md:px-5 ${
                isOpen
                  ? "bg-tab text-on-tab border-transparent"
                  : here
                    ? "bg-chip text-ink [border-color:var(--guest-line-strong)]"
                    : "text-soft hover:text-ink bg-surface/60 [border-color:var(--guest-tab-border)]"
              }`}
            >
              <span>{label(b)}</span>
              <ChevronDown
                size={16}
                aria-hidden
                className={`hidden flex-none transition-transform duration-200 sm:block ${isOpen ? "rotate-180" : ""}`}
              />
            </button>
          );
        })}
      </div>
      {openBucket && (
        <div
          key={openBucket.key}
          id={`sections-${openBucket.key}`}
          data-testid="section-panel"
          className={`bg-surface text-ink shadow-float rounded-feature absolute inset-x-4 top-full mt-1 max-h-[min(62dvh,28rem)] overflow-y-auto overscroll-contain border [border-color:var(--guest-card-border)] p-2 md:inset-x-8 ${styles.navPanel}`}
        >
          <ul className="grid gap-x-2 sm:grid-cols-2 md:grid-cols-3">
            {openBucket.sections.map((c) => (
              <li key={c.id}>
                <a
                  href={`#${sectionId(c.id)}`}
                  data-cat={c.id}
                  aria-current={c.id === current ? "true" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    go(c.id);
                  }}
                  className="hover:bg-chip aria-[current=true]:bg-chip aria-[current=true]:text-accent-text rounded-card flex min-h-12 items-center justify-between gap-3 px-3 py-2 font-semibold"
                >
                  {c.name ? <Txt value={c.name} locale={locale} className="min-w-0 break-words" /> : null}
                  <span className="num text-muted flex-none text-sm font-normal">{c.items.length}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </nav>
  );
}
