"use client";

import { useEffect, type RefObject } from "react";
import { motionReady, reducedMotion } from "./motion";

// Cards rising into view in a staggered wave as the guest scrolls (the
// entrance half of Tilted Card). Only cards still below the fold wait, and
// only once this code runs (data-reveal="wait" is set here, never in the
// HTML), so without JavaScript, or under reduced motion, every card simply
// shows. If Motion hasn't arrived by the time a card comes into view (a very
// slow network), the card shows at once rather than waiting for it.
// The first cards on the page rise at first paint in CSS instead
// (motion.module.css .enter), before any JavaScript; those of them that
// are below the fold wait here like the rest.
const FROM = "perspective(800px) translateY(44px) rotateX(18deg) scale(0.94)";
const TO = "perspective(800px) translateY(0px) rotateX(0deg) scale(1)";
const STAGGER = 0.07;

let observer: IntersectionObserver | null = null;

function show(el: HTMLElement) {
  el.dataset.reveal = "done";
  el.style.removeProperty("opacity");
  el.style.removeProperty("transform");
}

function rise(entries: IntersectionObserverEntry[]) {
  const due = entries
    .filter((e) => e.isIntersecting)
    .map((e) => e.target as HTMLElement)
    // Top to bottom, then left to right: the wave reads like the page.
    .sort((a, b) => {
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      return ra.top - rb.top || ra.left - rb.left;
    });
  if (due.length === 0) return;
  due.forEach((el) => observer?.unobserve(el));
  void motionReady().then((m) => {
    due.forEach((el, i) => {
      if (!m || !el.isConnected) return show(el);
      const delay = Math.min(i, 6) * STAGGER;
      m.animate(el, { opacity: [0, 1] }, { duration: 0.45, ease: "easeOut", delay });
      const run = m.animate(
        el,
        { transform: [FROM, TO] },
        { type: m.spring, duration: 0.8, bounce: 0.28, delay },
      );
      void Promise.resolve(run).finally(() => show(el));
    });
  });
}

export function useReveal(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion() || !("IntersectionObserver" in window)) return;
    // Already on screen when the page woke up: it stays as it is.
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    observer ??= new IntersectionObserver(rise, { rootMargin: "0px 0px -8% 0px" });
    el.dataset.reveal = "wait";
    observer.observe(el);
    return () => {
      observer?.unobserve(el);
      if (el.dataset.reveal === "wait") show(el);
    };
  }, [ref]);
}
