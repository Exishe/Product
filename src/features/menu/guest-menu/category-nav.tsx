"use client";

import { useEffect, useRef, useState } from "react";
import { motionNow, reducedMotion } from "@/features/guest-theme/motion/motion";
import motionStyles from "@/features/guest-theme/motion/motion.module.css";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import styles from "./guest.module.css";
import { Txt } from "./ui";
import type { GuestCategory } from "./view-model";

export const sectionId = (id: string) => `cat-${id}`;

const smooth = () => (window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

// Sticky section tabs. The tab of the section under the bar is highlighted
// while scrolling and kept in view inside the bar. Its red pill is one
// element that slides from tab to tab on a spring (by transform, measured
// from the tabs); without JavaScript or under reduced motion the current
// tab simply has its own fill.
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
  const pill = useRef<HTMLSpanElement>(null);
  const shown = useRef<{ id: string | null; x: number; w: number } | null>(null);
  const place = useRef<(animate: boolean) => void>(() => {});

  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      // Sections scroll to just under the slim bar and the tabs.
      const bar = nav.current;
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

  // The sliding pill: measured again whenever a tab changes size (the
  // fonts arriving, a narrower screen).
  useEffect(() => {
    const bar = nav.current;
    const ind = pill.current;
    if (!bar || !ind || reducedMotion()) return;
    place.current = (animate) => {
      const id = bar.dataset.current ?? null;
      const tab = id ? bar.querySelector<HTMLElement>(`[data-cat="${CSS.escape(id)}"]`) : null;
      if (!tab) return;
      const x = tab.offsetLeft;
      const w = tab.offsetWidth;
      const was = shown.current;
      if (was && was.id === id && was.x === x && was.w === w) return;
      ind.style.top = `${tab.offsetTop}px`;
      ind.style.height = `${tab.offsetHeight}px`;
      ind.style.width = `${w}px`;
      const m = motionNow();
      if (animate && m && was && w > 0) {
        m.animate(
          ind,
          {
            transform: [
              `translateX(${was.x}px) scaleX(${(was.w / w).toFixed(4)})`,
              `translateX(${x}px) scaleX(1)`,
            ],
          },
          { type: m.spring, duration: 0.5, bounce: 0.22 },
        );
      } else ind.style.transform = `translateX(${x}px)`;
      shown.current = { id, x, w };
      bar.dataset.indicator = "on";
    };
    place.current(false);
    const resized = new ResizeObserver(() => place.current(false));
    bar.querySelectorAll("[data-cat]").forEach((t) => resized.observe(t));
    return () => {
      resized.disconnect();
      place.current = () => {};
    };
  }, [categories]);

  useEffect(() => {
    const bar = nav.current;
    place.current(true);
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
      data-current={current ?? undefined}
      className={`bg-page/92 sticky z-10 -mx-4 flex gap-1.5 overflow-x-auto px-4 py-2.5 backdrop-blur-md transition-[top] duration-200 motion-reduce:transition-none md:-mx-8 md:px-8 ${belowBar ? "top-16" : "top-0"} ${styles.tabs} ${motionStyles.track}`}
    >
      <span ref={pill} aria-hidden="true" className={motionStyles.indicator} />
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
          className="text-soft hover:text-ink aria-[current=true]:bg-tab aria-[current=true]:text-on-tab rounded-pill flex min-h-11 flex-none items-center border [border-color:var(--guest-tab-border)] px-4 font-semibold whitespace-nowrap aria-[current=true]:border-transparent"
        >
          {c.name ? <Txt value={c.name} locale={locale} /> : null}
        </a>
      ))}
    </nav>
  );
}
