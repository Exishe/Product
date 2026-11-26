"use client";

import { useEffect, useRef } from "react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { sectionId, useCurrentSection } from "./category-nav";
import styles from "./guest.module.css";
import { groupSections } from "./section-groups";
import { Txt } from "./ui";
import type { GuestCategory } from "./view-model";

// The desktop's left column (design battle entry B): every section of the menu,
// under its group, with its dish count; a click scrolls to it. From 1024 px only;
// a phone has the group chips and their dropdown in the bar. It sticks level
// with the first heading of the dishes (`stick`), and a list taller than the
// screen scrolls inside its column with a soft fade at its foot. On the page,
// not in a box (ADR-096), its words on the column's own edge. The section on
// screen is marked (the phone's scroll-spy): in the ink, semibold, on the chip
// tint, with aria-current, and the list turns inside its column to keep it in
// view.
export function SectionList({ categories, stick }: { categories: GuestCategory[]; stick: string }) {
  const { t, locale } = useGuestI18n();
  const [current, go] = useCurrentSection(categories);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = scroller.current;
    const link = box?.querySelector<HTMLElement>(`[data-section="${current}"]`);
    if (!box || !link || box.scrollHeight <= box.clientHeight) return;
    // Within the list only: scrollIntoView would move the page as well.
    const top = link.offsetTop;
    if (top < box.scrollTop + 24 || top + link.offsetHeight > box.scrollTop + box.clientHeight - 48)
      box.scrollTo({ top: top - box.clientHeight / 3 });
  }, [current]);
  if (categories.length < 2) return <div className="hidden lg:block" />;
  const clusters = groupSections(categories);
  return (
    <nav aria-label={t("menu.sections")} className="hidden pt-5 lg:block">
      <div className={`sticky ${stick}`}>
        <div
          ref={scroller}
          className={`relative -mx-2 max-h-[calc(100dvh-117px-2.75rem)] [scrollbar-width:thin] overflow-y-auto overscroll-contain px-2 pb-6 ${styles.sectionScroll}`}
        >
          {clusters.map(({ group, sections }, gi) => {
            // As in the phone's tab row: a group that is one section needs no
            // label over it («Աղանդեր» over «Աղանդեր»); the section's own
            // link stands for the group. A hairline on the words' edge, in
            // the middle of the gap above it, says the break is a new group,
            // so the list never reads as unevenly spaced.
            const labelled = clusters.length > 1 && sections.length > 1;
            return (
              <div key={group} className="pb-1">
                {!labelled && gi > 0 && <hr aria-hidden="true" className="border-line mt-0.5 mb-1.5 border-t" />}
                {labelled && <p className="text-muted text-meta pt-3 pb-1">{t(`menu.groups.${group}`)}</p>}
                <ul>
                  {sections.map((c) => (
                    <li key={c.id}>
                      <a
                        href={`#${sectionId(c.id)}`}
                        data-section={c.id}
                        aria-current={c.id === current ? "true" : undefined}
                        onClick={(e) => {
                          e.preventDefault();
                          go(c.id);
                        }}
                        className="text-ink hover:bg-chip/60 aria-[current=true]:bg-chip rounded-guest-sm text-body -mx-2 flex min-h-11 items-center justify-between gap-2 px-2 py-1 leading-[1.3] transition-colors duration-200 aria-[current=true]:font-semibold"
                      >
                        {c.name ? (
                          <Txt value={c.name} locale={locale} className="min-w-0 break-words" />
                        ) : null}
                        <span className="num text-soft text-meta flex-none">{c.items.length}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
