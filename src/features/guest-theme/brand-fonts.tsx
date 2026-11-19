"use client";

import { useEffect } from "react";

// Adds the café's Google Fonts stylesheet (ADR-058) after the page is up, as
// GuestFonts does for Stardom: a slow or blocked Google never holds back the
// menu, text shows in the theme's faces and swaps when the fonts arrive.
export function BrandFonts({ href }: { href: string }) {
  useEffect(() => {
    if (
      [...document.querySelectorAll<HTMLLinkElement>("link[data-brand-fonts]")].some((l) => l.href === href)
    )
      return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.brandFonts = "";
    document.head.appendChild(link);
  }, [href]);
  return null;
}
