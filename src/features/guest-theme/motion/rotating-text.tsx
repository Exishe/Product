"use client";

import { useEffect, useRef, useState } from "react";
import { motionNow, reducedMotion, warmMotion } from "./motion";
import styles from "./motion.module.css";

// Rotating Text, after React Bits (https://reactbits.dev/text-animations/rotating-text,
// MIT + Commons Clause): one word swaps for the next, its letters leaving
// upwards and the next word's rising in, staggered. Ours animates with
// Motion's mini animate(), all words share one grid cell (no reflow), and it
// only turns while on screen and the tab is visible. Motion is fetched
// right after first paint, so the first turn comes about two seconds in.
// Under reduced motion, or before Motion arrives, the first word simply stays.
const INTERVAL = 2200;

export function RotatingText({ words, className }: { words: string[]; className?: string }) {
  const box = useRef<HTMLSpanElement>(null);
  const [{ current, prev }, setShown] = useState<{ current: number; prev: number | null }>({ current: 0, prev: null });
  const at = useRef(0);

  useEffect(() => {
    const el = box.current;
    if (!el || words.length < 2 || reducedMotion()) return;
    warmMotion();
    let visible = false;
    const tick = () => {
      const m = motionNow();
      if (!m || document.hidden || !visible) return;
      const from = at.current;
      const to = (from + 1) % words.length;
      const chars = (i: number) => el.querySelectorAll<HTMLElement>(`[data-word="${i}"] [data-char]`);
      const ease = { type: m.spring, duration: 0.6, bounce: 0.3 };
      m.animate(
        chars(from),
        { transform: ["perspective(400px) translateY(0) rotateX(0deg)", "perspective(400px) translateY(-110%) rotateX(70deg)"], opacity: [1, 0] },
        { ...ease, bounce: 0, delay: (i: number) => i * 0.02 },
      );
      m.animate(
        chars(to),
        { transform: ["perspective(400px) translateY(110%) rotateX(-70deg)", "perspective(400px) translateY(0) rotateX(0deg)"], opacity: [0, 1] },
        { ...ease, delay: (i: number) => 0.1 + i * 0.024 },
      );
      at.current = to;
      setShown({ current: to, prev: from });
    };
    const io = new IntersectionObserver(([e]) => {
      visible = Boolean(e?.isIntersecting);
    });
    io.observe(el);
    // Turns once Motion has arrived (soon after first paint).
    const timer = setInterval(tick, INTERVAL);
    return () => {
      io.disconnect();
      clearInterval(timer);
    };
  }, [words]);

  return (
    <span ref={box} className={`${styles.rotator} ${className ?? ""}`}>
      {words.map((word, w) => (
        // The leaving word stays visible while its letters fly out.
        <span key={w} data-word={w} data-current={w === current || w === prev ? "true" : "false"}>
          {Array.from(word).map((c, i) =>
            c === " " ? (
              " "
            ) : (
              <span key={i} data-char="" className={styles.char}>
                {c}
              </span>
            ),
          )}
        </span>
      ))}
    </span>
  );
}
