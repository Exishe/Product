"use client";

import { useEffect } from "react";
import { STARDOM_CSS } from "./fontshare";

// Adds the Fontshare stylesheet after the page is up, so a slow or blocked
// Fontshare never holds back the menu: headings show in the Noto serifs and
// swap to Stardom when it arrives. The layout preloads the stylesheet, so by
// now it is usually in the cache.
export function GuestFonts() {
  useEffect(() => {
    if (document.querySelector("link[data-stardom]")) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = STARDOM_CSS;
    link.dataset.stardom = "";
    document.head.appendChild(link);
  }, []);
  return null;
}
