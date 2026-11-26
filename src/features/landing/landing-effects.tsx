"use client";

import { useEffect } from "react";
import { writeLocaleCookie } from "@/i18n/locale-cookie";

// Two small jobs for the landing page, both after the first paint:
// 1. Remember the visitor's language, so sign-in, sign-up and pairing (no
//    locale in their URL) open in the language picked here, not in Armenian.
// 2. Draw the sticky header's hairline only once the page has scrolled: a
//    1 px sentinel at the top of the page leaves the viewport.
export function LandingEffects({ locale, headerId }: { locale: string; headerId: string }) {
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

  return <div id={`${headerId}-sentinel`} aria-hidden="true" className="absolute inset-x-0 top-0 h-px" />;
}
