"use client";

import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { sectionId } from "./category-nav";
import { groupSections } from "./section-groups";
import { Txt } from "./ui";
import type { GuestCategory } from "./view-model";

const smooth = () => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

// The desktop's left column (design battle entry B): every section of the menu,
// under its group, with its dish count; a click scrolls to it. From 1024 px only;
// a phone has the group chips and their dropdown in the bar.
export function SectionList({ categories }: { categories: GuestCategory[] }) {
  const { t, locale } = useGuestI18n();
  if (categories.length < 2) return <div className="hidden lg:block" />;
  const clusters = groupSections(categories);
  return (
    <nav aria-label={t("menu.sections")} className="hidden pt-5 lg:block">
      <div className="bg-surface rounded-card sticky top-44 max-h-[calc(100dvh-12rem)] [scrollbar-width:thin] overflow-y-auto border [border-color:var(--guest-card-border)] p-2">
        {clusters.map(({ group, sections }) => (
          <div key={group} className="pb-1">
            {clusters.length > 1 && (
              <p className="text-soft px-2 pt-2 pb-1 text-[10px] font-semibold tracking-[0.06em] uppercase">
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
                    className="text-ink hover:bg-chip flex min-h-8 items-center justify-between gap-2 rounded-[8px] px-2 py-1 text-[12px]"
                  >
                    {c.name ? <Txt value={c.name} locale={locale} className="min-w-0 break-words" /> : null}
                    <span className="num text-soft flex-none text-[10px]">{c.items.length}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  );
}
