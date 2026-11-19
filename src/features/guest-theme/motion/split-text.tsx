"use client";

import { useEffect, useRef, type CSSProperties, type ElementType } from "react";
import { loadMotion, reducedMotion } from "./motion";
import styles from "./motion.module.css";

// Split Text, after React Bits (https://reactbits.dev/text-animations/split-text,
// MIT + Commons Clause: used in our product, not resold): a heading rises in
// letter by letter. Our version splits by grapheme (Intl.Segmenter), so
// Armenian «և», accents and emoji stay whole, and keeps whole words
// together so lines still break between words.
// - reveal="load": plays at first paint in CSS, no JavaScript needed (the
//   café name at the top must show at once, even before Motion arrives);
// - reveal="view": plays once with Motion when the heading first scrolls
//   into view (out of a short blur); without Motion the text just shows.
// Screen readers get the plain text; the letters are aria-hidden.
const LONG_WORD = 14; // longer words rise as one piece and may wrap anywhere

let segmenter: Intl.Segmenter | null | undefined;
function graphemes(text: string): string[] {
  if (segmenter === undefined)
    segmenter = typeof Intl !== "undefined" && "Segmenter" in Intl ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
  return segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
}

export function SplitText({
  text,
  as: Tag = "span",
  reveal = "view",
  className,
  id,
  lang,
}: {
  text: string;
  as?: ElementType;
  reveal?: "load" | "view";
  className?: string;
  id?: string;
  lang?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (reveal !== "view" || !el || reducedMotion() || !("IntersectionObserver" in window)) return;
    // Only headings still below the fold wait for their moment.
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.dataset.split = "wait";
    let gone = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        void loadMotion().then((m) => {
          if (gone) return;
          const chars = el.querySelectorAll<HTMLElement>("[data-char]");
          if (!m || chars.length === 0) {
            el.dataset.split = "done";
            return;
          }
          // Rise out of a blur, letter by letter (no scale: a letter never grows
          // past its word box).
          m.animate(chars, { filter: ["blur(6px)", "blur(0px)"] }, { duration: 0.5, ease: "easeOut", delay: (i: number) => i * 0.032 });
          const run = m.animate(
            chars,
            { opacity: [0, 1], transform: ["translateY(0.7em)", "translateY(0)"] },
            { type: m.spring, duration: 0.75, bounce: 0.3, delay: (i: number) => i * 0.032 },
          );
          void Promise.resolve(run).finally(() => {
            if (gone) return;
            el.dataset.split = "done";
            // The letters rest without inline styles (no lingering layers).
            chars.forEach((c) => {
              c.style.removeProperty("filter");
              c.style.removeProperty("transform");
              c.style.removeProperty("opacity");
            });
          });
        });
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    io.observe(el);
    return () => {
      gone = true;
      io.disconnect();
    };
  }, [reveal, text]);

  let index = 0;
  const words = text.split(/(\s+)/);
  return (
    <Tag ref={ref} id={id} lang={lang} className={`${styles.split} ${reveal === "load" ? styles.load : ""} ${className ?? ""}`}>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true">
        {words.map((word, w) => {
          if (/^\s+$/.test(word) || word === "") return word ? " " : null;
          const parts = graphemes(word);
          if (parts.length > LONG_WORD)
            return (
              <span key={w} data-char="" className={`${styles.char} ${styles.long}`} style={{ "--i": index++ } as CSSProperties}>
                {word}
              </span>
            );
          return (
            <span key={w} className={styles.word}>
              {parts.map((g, i) => (
                <span key={i} data-char="" className={styles.char} style={{ "--i": index++ } as CSSProperties}>
                  {g}
                </span>
              ))}
            </span>
          );
        })}
      </span>
    </Tag>
  );
}
