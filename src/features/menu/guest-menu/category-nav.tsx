"use client";

import { useEffect, useRef, useState } from "react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import styles from "./guest.module.css";
import { Txt } from "./ui";
import type { GuestCategory } from "./view-model";

export const sectionId = (id: string) => `cat-${id}`;

const smooth = () => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

// Sticky section tabs. The tab of the section under the bar is highlighted
// while scrolling and kept in view inside the bar.
export function CategoryNav({ categories }: { categories: GuestCategory[] }) {
  const { t, locale } = useGuestI18n();
  const nav = useRef<HTMLElement>(null);
  const [active, setActive] = useState(categories[0]?.id ?? null);
  const current = categories.some((c) => c.id === active) ? active : (categories[0]?.id ?? null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      // Sections scroll to 80 px from the top (scroll-mt-20), just under the bar.
      const offset = Math.max(nav.current?.getBoundingClientRect().bottom ?? 0, 80) + 24;
      let id = categories[0]?.id ?? null;
      for (const c of categories) {
        const el = document.getElementById(sectionId(c.id));
        if (el && el.getBoundingClientRect().top <= offset) id = c.id;
      }
      setActive(id);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [categories]);

  useEffect(() => {
    const bar = nav.current;
    const tab = bar?.querySelector<HTMLElement>(`[data-cat="${current}"]`);
    if (!bar || !tab) return;
    const left = tab.offsetLeft - 16;
    const right = tab.offsetLeft + tab.offsetWidth + 16 - bar.clientWidth;
    if (bar.scrollLeft > left) bar.scrollTo({ left, behavior: smooth() });
    else if (bar.scrollLeft < right) bar.scrollTo({ left: right, behavior: smooth() });
  }, [current]);

  if (categories.length < 2) return null;
  return (
    <nav
      ref={nav}
      aria-label={t("menu.categories")}
      className={`sticky top-0 z-10 flex gap-2 overflow-x-auto border-b border-line bg-matsoni px-4 py-2 ${styles.tabs}`}
    >
      {categories.map((c) => (
        <a
          key={c.id}
          href={`#${sectionId(c.id)}`}
          data-cat={c.id}
          aria-current={c.id === current ? "true" : undefined}
          onClick={(e) => {
            e.preventDefault();
            setActive(c.id);
            document.getElementById(sectionId(c.id))?.scrollIntoView({ behavior: smooth(), block: "start" });
          }}
          className="flex min-h-12 flex-none items-center rounded-chip px-3 font-semibold whitespace-nowrap text-muted aria-[current=true]:bg-tarragon aria-[current=true]:text-white"
        >
          {c.name ? <Txt value={c.name} locale={locale} /> : null}
        </a>
      ))}
    </nav>
  );
}
