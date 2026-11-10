"use client";

import { useEffect } from "react";

// Registers /public/sw.js on staff screens (ADR-029, ADR-048). On the very
// first visit the worker doesn't control the page yet, so the page tells it
// which build files it loaded; from then on the worker sees every request and
// the screen opens offline at its last state.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let cancelled = false;
    (async () => {
      try {
        const controlled = Boolean(navigator.serviceWorker.controller);
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        const registration = await navigator.serviceWorker.ready;
        if (cancelled || controlled) return;
        const files = performance
          .getEntriesByType("resource")
          .map((e) => e.name)
          .filter((name) => name.startsWith(`${location.origin}/_next/static/`));
        registration.active?.postMessage({ type: "staff-screen", path: location.pathname, files });
      } catch {
        // No service worker (private window, old browser): the screen still works online.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
