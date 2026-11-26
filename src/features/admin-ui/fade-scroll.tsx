"use client";

import { clsx } from "clsx";
import { useEffect, useRef, type ReactNode } from "react";

// A block that scrolls sideways (a heatmap on a phone): while more of it is
// hidden on the right, the last 24 px fade out (.chip-fade[data-more]), the
// same cue as the menu's section chips. Without JavaScript it simply scrolls.
export function FadeScroll({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mark = () => {
      if (el.scrollLeft + el.clientWidth < el.scrollWidth - 2) el.dataset.more = "";
      else delete el.dataset.more;
    };
    mark();
    el.addEventListener("scroll", mark, { passive: true });
    const ro = new ResizeObserver(mark);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", mark);
      ro.disconnect();
    };
  }, []);
  return (
    <div ref={ref} className={clsx("chip-fade", className)}>
      {children}
    </div>
  );
}
