"use client";

import { useEffect } from "react";
import { writeLocaleCookie } from "@/i18n/locale-cookie";

// Three small jobs for the landing page, all after the first paint:
// 1. Remember the visitor's language, so sign-in, sign-up and pairing (no
//    locale in their URL) open in the language picked here, not in Armenian.
// 2. Draw the sticky header's hairline only once the page has scrolled: a
//    1 px sentinel at the top of the page leaves the viewport.
// 3. Mark the header `data-cta` once the hero's buttons have gone up behind
//    it, so phones can show the header's sign-up pill from then on.
export function LandingEffects({
  locale,
  headerId,
  ctaId,
}: {
  locale: string;
  headerId: string;
  ctaId: string;
}) {
  useEffect(() => {
    writeLocaleCookie(locale);
  }, [locale]);

  useEffect(() => {
    const sentinel = document.getElementById(`${headerId}-sentinel`);
    const header = document.getElementById(headerId);
    if (!sentinel || !header || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry) header.toggleAttribute("data-scrolled", !entry.isIntersecting);
    });
    io.observe(sentinel);
    return () => io.disconnect();
  }, [headerId]);

  useEffect(() => {
    const cta = document.getElementById(ctaId);
    const header = document.getElementById(headerId);
    if (!cta || !header || !("IntersectionObserver" in window)) return;
    // The 64 px header covers the top of the viewport, so a button under it
    // counts as gone. Only "gone upwards" counts, never "not reached yet".
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry) return;
        header.toggleAttribute("data-cta", !entry.isIntersecting && entry.boundingClientRect.top < 64);
      },
      { rootMargin: "-64px 0px 0px 0px" },
    );
    io.observe(cta);
    return () => io.disconnect();
  }, [headerId, ctaId]);

  return <div id={`${headerId}-sentinel`} aria-hidden="true" className="absolute inset-x-0 top-0 h-px" />;
}
