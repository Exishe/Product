"use client";

import { useEffect, type RefObject } from "react";
import { loadMotion, motionNow } from "./motion";

// Tilted Card, after React Bits (https://reactbits.dev/components/tilted-card,
// MIT + Commons Clause): the card leans towards the pointer on a spring and
// settles back when it leaves. On a touch screen it leans towards the finger
// while pressed, half as far, and never blocks scrolling (no preventDefault;
// a scroll cancels the pointer and the card settles). Motion's mini
// animate() interrupts the running spring from where it is.
const PERSPECTIVE = 900;

export function useTilt(ref: RefObject<HTMLElement | null>, { max = 9, scale = 1.025 } = {}) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    let last: PointerEvent | null = null;
    let pressed = false;

    const to = (rx: number, ry: number, s: number) => {
      const m = motionNow();
      if (!m) return;
      m.animate(
        el,
        { transform: `perspective(${PERSPECTIVE}px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${s})` },
        { type: m.spring, stiffness: 260, damping: 22, mass: 0.7 },
      );
    };
    const apply = () => {
      frame = 0;
      const e = last;
      if (!e) return;
      const touch = e.pointerType !== "mouse";
      if (touch && !pressed) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      const amp = touch ? max / 2 : max;
      to(-y * amp * 2, x * amp * 2, touch ? 0.985 : scale);
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
  }, [ref, max, scale]);
}
