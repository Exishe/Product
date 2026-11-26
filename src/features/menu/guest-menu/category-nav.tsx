"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { groupSections } from "./section-groups";
import { Txt } from "./ui";
import type { GuestCategory } from "./view-model";

export const sectionId = (id: string) => `cat-${id}`;

const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const smooth = (): ScrollBehavior => (reduced() ? "auto" : "smooth");

/** Scrolls to a section; returns until when it stays the current one. */
function scrollToSection(id: string): number {
  // The band's height is the page's scroll-padding (globals.css), so the heading lands under it.
  document.getElementById(sectionId(id))?.scrollIntoView({ behavior: smooth(), block: "start" });
  return performance.now() + 1500;
}

/**
 * The section the guest is reading (scroll-spy): the last one whose top has
 * passed the sticky band. The phone's tab row and the desktop's section list
 * both follow it; `go` jumps to a section and keeps it current on the way.
 */
export function useCurrentSection(categories: GuestCategory[]): [string | null, (id: string) => void] {
  const [active, setActive] = useState(categories[0]?.id ?? null);
  // After a tap, its section stays current while the page scrolls there.
  const holdUntil = useRef(0);
  const current = categories.some((c) => c.id === active) ? active : (categories[0]?.id ?? null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const bar = document.querySelector<HTMLElement>("[data-menubar]");
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

  const go = (id: string) => {
    setActive(id);
    holdUntil.current = scrollToSection(id);
  };
  return [current, go];
}

// The section tabs in the sticky band (ADR-094 area pass, benchmark §2.1):
// every section of the menu in one row of 16 px text tabs, 48 px tall, with a
// 3 px line under the current one that glides to the next as the page
// scrolls (scroll-spy) and the row turning to keep the whole of it in view. One tap jumps
// to a section. Where the menu has groups (Food, Desserts, Drinks, Wine) each
// run of tabs starts with the group's name, small, muted and regular, set
// off from its tabs by a short vertical hairline, so it never reads as a tab
// or as the current one (ADR-096); a tap on it jumps to the group's first
// section, and it carries aria-current while the page is in that group. A
// group whose only section carries its name is one tab. The
// row fades at its right edge when it scrolls sideways. From 1024 px the
// section list on the left does this job, so the row is a phone and tablet
// thing.
export function CategoryNav({ categories }: { categories: GuestCategory[] }) {
  const { t, locale } = useGuestI18n();
  const row = useRef<HTMLDivElement>(null);
  const [line, setLine] = useState<{ left: number; width: number } | null>(null);
  const [current, go] = useCurrentSection(categories);

  const clusters = useMemo(() => {
    const groups = groupSections(categories);
    return groups.length < 2 ? [{ group: null, sections: categories }] : groups;
  }, [categories]);
  const currentGroup = clusters.find((g) => g.sections.some((s) => s.id === current))?.group ?? null;

  // The underline follows the current tab, and the row turns to keep it in view.
  useEffect(() => {
    const strip = row.current;
    if (!strip || !current) return;
    const place = () => {
      const tab = strip.querySelector<HTMLElement>(`[data-cat="${current}"]`);
      if (!tab) return setLine(null);
      setLine({ left: tab.offsetLeft, width: tab.offsetWidth });
      // The whole tab in view, long names included: centred in the row, or
      // from its start when it is wider than the row (16 px in, clear of the
      // fade at the right edge).
      const left = tab.offsetLeft;
      const right = left + tab.offsetWidth;
      const from = strip.scrollLeft + 16;
      const to = strip.scrollLeft + strip.clientWidth - 32;
      if (left < from || right > to) {
        const centred = left + tab.offsetWidth / 2 - strip.clientWidth / 2;
        const target = tab.offsetWidth > strip.clientWidth - 48 ? left - 16 : centred;
        strip.scrollTo({ left: Math.max(0, target), behavior: smooth() });
      }
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(strip);
    return () => observer.disconnect();
  }, [current, locale, categories]);

  if (categories.length < 2) return null;
  const tab =
    "flex min-h-12 flex-none items-center px-3 text-body whitespace-nowrap transition-colors duration-200 text-muted hover:text-ink aria-[current=true]:text-ink aria-[current=true]:font-semibold";
  return (
    <nav aria-label={t("menu.categories")} data-current={current ?? undefined} className="min-w-0 lg:hidden">
      <div
        ref={row}
        className="relative -mx-4 flex scroll-px-4 [scrollbar-width:none] overflow-x-auto px-1 [mask-image:linear-gradient(to_right,#000_calc(100%-1.5rem),transparent)] md:-mx-8 md:px-5 [&::-webkit-scrollbar]:hidden"
      >
        {clusters.map(({ group, sections }, gi) => {
          // A group that is one section of the same name is that one tab.
          const single =
            group !== null &&
            sections.length === 1 &&
            sections[0]!.name?.text.trim().toLocaleLowerCase() ===
              t(`menu.groups.${group}`).trim().toLocaleLowerCase();
          return (
            <Fragment key={group ?? "all"}>
              {group !== null && !single && (
                <button
                  type="button"
                  data-group={group}
                  data-testid={`group-${group}`}
                  aria-current={currentGroup === group ? "true" : undefined}
                  onClick={() => go(sections[0]!.id)}
                  className={`text-muted hover:text-ink flex min-h-12 flex-none items-center gap-3 pl-3 text-meta font-normal whitespace-nowrap ${
                    gi > 0 ? "ml-4" : ""
                  }`}
                >
                  {t(`menu.groups.${group}`)}
                  <span aria-hidden="true" className="bg-line-strong h-4 w-px flex-none opacity-60" />
                </button>
              )}
              {sections.map((c) => (
                <a
                  key={c.id}
                  href={`#${sectionId(c.id)}`}
                  data-cat={c.id}
                  data-testid={single ? `group-${group}` : undefined}
                  data-group={single ? group : undefined}
                  aria-current={c.id === current ? "true" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    go(c.id);
                  }}
                  className={`${tab} ${single && gi > 0 ? "ml-4" : ""}`}
                >
                  {c.name ? <Txt value={c.name} locale={locale} /> : null}
                </a>
              ))}
            </Fragment>
          );
        })}
        <span aria-hidden="true" className="w-4 flex-none" />
        {line && (
          <span
            aria-hidden="true"
            className="bg-accent-text pointer-events-none absolute bottom-0 left-0 h-[3px] rounded-full transition-[transform,width] duration-200 ease-out motion-reduce:transition-none"
            style={{ width: line.width - 24, transform: `translateX(${line.left + 12}px)` }}
          />
        )}
      </div>
    </nav>
  );
}
