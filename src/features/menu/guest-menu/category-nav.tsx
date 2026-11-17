"use client";

import { useEffect, useRef, useState } from "react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import styles from "./guest.module.css";
import { Txt } from "./ui";
import type { GuestCategory } from "./view-model";

export const sectionId = (id: string) => `cat-${id}`;

/** The tabs stand as a sidebar on wide screens (lg:flex-col). */
const vertical = (el: HTMLElement) => getComputedStyle(el).flexDirection === "column";

const smooth = () => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

// Sticky section tabs. The tab of the section under the bar is highlighted
// while scrolling and kept in view inside the bar.
export function CategoryNav({
  categories,
  belowBar = false,
}: {
  categories: GuestCategory[];
  /** The slim bar is showing above. */ belowBar?: boolean;
}) {
  const { t, locale } = useGuestI18n();
  const nav = useRef<HTMLElement>(null);
  const [active, setActive] = useState(categories[0]?.id ?? null);
  // After a tap on a tab, its section stays current while the page scrolls
  // there, even when the menu ends too soon to bring it to the top (the
  // last, short sections in two columns).
  const holdUntil = useRef(0);
  const current = categories.some((c) => c.id === active) ? active : (categories[0]?.id ?? null);

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      // Sections scroll to just under the bar and the tabs. On a wide screen
      // the tabs are a sidebar, so only the bar counts (lg:scroll-mt-20).
      const bar = nav.current;
      const offset =
        (bar && !vertical(bar) ? Math.max(bar.getBoundingClientRect().bottom, 80) : 80) + 24;
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

  useEffect(() => {
    const bar = nav.current;
    const tab = bar?.querySelector<HTMLElement>(`[data-cat="${current}"]`);
    if (!bar || !tab) return;
    if (vertical(bar)) {
      const top = tab.offsetTop - 16;
      const bottom = tab.offsetTop + tab.offsetHeight + 16 - bar.clientHeight;
      if (bar.scrollTop > top) bar.scrollTo({ top, behavior: smooth() });
      else if (bar.scrollTop < bottom) bar.scrollTo({ top: bottom, behavior: smooth() });
      return;
    }
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
      className={`sticky z-10 flex gap-1.5 transition-[top] duration-200 motion-reduce:transition-none ${belowBar ? "top-14" : "top-0"} border-line bg-matsoni -mx-4 overflow-x-auto border-b px-4 py-2 md:-mx-8 md:px-8 lg:top-24 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mx-0 lg:mt-10 lg:max-h-[calc(100dvh-7rem)] lg:flex-col lg:gap-0 lg:self-start lg:overflow-y-auto lg:border-b-0 lg:border-l lg:px-0 lg:py-1 ${styles.tabs}`}
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
            holdUntil.current = performance.now() + 1500;
            document.getElementById(sectionId(c.id))?.scrollIntoView({ behavior: smooth(), block: "start" });
          }}
          className="text-muted hover:text-ink aria-[current=true]:bg-noir aria-[current=true]:text-ivory lg:aria-[current=true]:border-champagne lg:aria-[current=true]:text-ink flex min-h-11 flex-none items-center rounded-full px-4 font-semibold whitespace-nowrap lg:-ml-px lg:min-h-10 lg:rounded-none lg:border-l-2 lg:border-transparent lg:px-4 lg:whitespace-normal lg:aria-[current=true]:bg-transparent"
        >
          {c.name ? <Txt value={c.name} locale={locale} /> : null}
        </a>
      ))}
    </nav>
  );
}
