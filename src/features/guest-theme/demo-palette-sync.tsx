"use client";

import { useLayoutEffect, useRef } from "react";
import { DEMO_PALETTE_KEY } from "./demo";

// The demo café's chosen palette on pages reached inside the app (sending an
// order, «Order the same again»): React never runs an inline <script> it
// creates in the browser, so the first-paint script in guest-theme-scope.tsx
// covers only a full page load. Before paint, so blue never flashes white.
export function DemoPaletteSync() {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const root = ref.current?.closest(".guest-lux[data-demo]");
    if (!root) return;
    let blue = false;
    try {
      blue = window.localStorage.getItem(DEMO_PALETTE_KEY) === "blue";
    } catch {
      // storage blocked: the switch still works for this page
      return;
    }
    if (blue) root.setAttribute("data-demo-palette", "blue");
    else root.removeAttribute("data-demo-palette");
  }, []);
  return <span ref={ref} hidden />;
}
