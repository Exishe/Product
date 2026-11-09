"use client";

import { useEffect, useRef, useState } from "react";
import { offsetFromSamples, parseServerTime, type ClockSample } from "./server-clock";

const REMEASURE_MS = 10 * 60_000;
const SAMPLES = 3;

async function sample(): Promise<ClockSample | null> {
  const sentAt = Date.now();
  try {
    const res = await fetch("/api/time", { cache: "no-store" });
    const receivedAt = Date.now();
    const serverNow = parseServerTime(await res.json());
    return serverNow === null ? null : { sentAt, receivedAt, serverNow };
  } catch {
    return null;
  }
}

// Server time, ticking every second (R20). The first render uses the time the
// server rendered the page, so server and browser draw the same markup; then
// the offset is measured against /api/time and re-measured every 10 minutes,
// when the network comes back and when the screen wakes up.
export function useServerClock(renderedAt: number): number {
  const [now, setNow] = useState(renderedAt);
  const offset = useRef<number | null>(null);

  useEffect(() => {
    // Until the first answer: the render time, give or take the page's transit.
    offset.current = renderedAt - Date.now();
    let cancelled = false;

    async function measure() {
      if (!navigator.onLine) return;
      const samples: ClockSample[] = [];
      for (let i = 0; i < SAMPLES && !cancelled; i++) {
        const s = await sample();
        if (s) samples.push(s);
      }
      const measured = offsetFromSamples(samples);
      if (!cancelled && measured !== null) {
        offset.current = measured;
        setNow(Date.now() + measured);
      }
    }

    const tick = () => setNow(Date.now() + (offset.current ?? 0));
    tick();
    void measure();
    const ticker = window.setInterval(tick, 1000);
    const remeasure = window.setInterval(measure, REMEASURE_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void measure();
    };
    const onOnline = () => void measure();
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(ticker);
      window.clearInterval(remeasure);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [renderedAt]);

  return now;
}
