"use client";

import { useEffect, type RefObject } from "react";
import { loadMotion, motionNow } from "./motion";

// Tilted Card, after React Bits (https://reactbits.dev/components/tilted-card,
// MIT + Commons Clause): the card leans towards the pointer on a spring and
// settles back when it leaves, with a soft glare that follows the pointer.
// On a touch screen it leans towards the finger while pressed (a little less
// far) and never blocks scrolling (no preventDefault; a scroll cancels the
// pointer and the card settles). Motion's mini animate() interrupts the
// running spring from where it is.
// While tilted the card carries data-tilt="on" (the glare and the plate's
// turn hang off it in CSS) and --glare-x / --glare-y, the pointer's place
// in px, which the glare reads in a transform (no repaint of the card).
const PERSPECTIVE = 800;

export function useTilt(ref: RefObject<HTMLElement | null>, { max = 12, touchMax = 8, scale = 1.035 } = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    let pressed = false;

    const to = (rx: number, ry: number, s: number) => {
      const m = motionNow();
      if (!m) return false;
      m.animate(
        el,
        { transform: `perspective(${PERSPECTIVE}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${s})` },
        { type: m.spring, stiffness: 240, damping: 20, mass: 0.7 },
      );
      return true;
    };
    const apply = () => {
      frame = 0;
      const e = last;
      if (!e) return;
      const touch = e.pointerType !== "mouse";
      if (touch && !pressed) return;
      const r = el.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      const x = px / r.width - 0.5;
      const y = py / r.height - 0.5;
      const amp = touch ? touchMax : max;
      if (!to(-y * amp * 2, x * amp * 2, touch ? 0.99 : scale)) return;
      el.dataset.tilt = "on";
      el.style.setProperty("--glare-x", `${px.toFixed(0)}px`);
      el.style.setProperty("--glare-y", `${py.toFixed(0)}px`);
    };
    const move = (e: PointerEvent) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const enter = () => void loadMotion();
    const down = (e: PointerEvent) => {
      pressed = true;
      move(e);
    };
    const rest = () => {
      pressed = false;
      last = null;
      cancelAnimationFrame(frame);
      frame = 0;
      if (el.dataset.tilt) el.dataset.tilt = "off";
      to(0, 0, 1);
    };
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerleave", rest);
    el.addEventListener("pointerup", rest);
    el.addEventListener("pointercancel", rest);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointerleave", rest);
      el.removeEventListener("pointerup", rest);
      el.removeEventListener("pointercancel", rest);
    };
  }, [ref, max, touchMax, scale]);
}
