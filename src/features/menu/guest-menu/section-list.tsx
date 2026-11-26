"use client";

import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { sectionId } from "./category-nav";
import styles from "./guest.module.css";
import { groupSections } from "./section-groups";
import { Txt } from "./ui";
import type { GuestCategory } from "./view-model";

const smooth = () => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

// The desktop's left column (design battle entry B): every section of the menu,
// under its group, with its dish count; a click scrolls to it. From 1024 px only;
// a phone has the group chips and their dropdown in the bar. It sticks level
// with the first heading of the dishes (`stick`), and a list taller than the
// screen scrolls inside its column with a soft fade at its foot. On the page,
// not in a box (ADR-095), its words on the column's own edge.
export function SectionList({ categories, stick }: { categories: GuestCategory[]; stick: string }) {
  const { t, locale } = useGuestI18n();
  if (categories.length < 2) return <div className="hidden lg:block" />;
  const clusters = groupSections(categories);
  return (
    <nav aria-label={t("menu.sections")} className="hidden pt-5 lg:block">
      <div
        className={`sticky ${stick}`}
      >
        <div
          className={`max-h-[calc(100dvh-117px-2.75rem)] [scrollbar-width:thin] -mx-2 overflow-y-auto overscroll-contain px-2 pb-6 ${styles.sectionScroll}`}
        >
          {clusters.map(({ group, sections }) => (
            <div key={group} className="pb-1">
              {clusters.length > 1 && (
                <p className="text-muted pt-3 pb-1 text-meta">
                  {t(`menu.groups.${group}`)}
                </p>
              )}
              <ul>
                {sections.map((c) => (
                  <li key={c.id}>
                    <a
                      href={`#${sectionId(c.id)}`}
                      onClick={(e) => {
                        e.preventDefault();
                        document
                          .getElementById(sectionId(c.id))
                          ?.scrollIntoView({ behavior: smooth(), block: "start" });
                      }}
                      className="text-ink hover:bg-chip rounded-guest-sm -mx-2 flex min-h-11 items-center justify-between gap-2 px-2 py-1 text-body leading-[1.3]"
                    >
                      {c.name ? <Txt value={c.name} locale={locale} className="min-w-0 break-words" /> : null}
                      <span className="num text-soft flex-none text-meta">{c.items.length}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </nav>
  );
}
