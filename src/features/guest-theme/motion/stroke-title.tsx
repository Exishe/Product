"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ElementType } from "react";
import { reducedMotion } from "./motion";
import styles from "./motion.module.css";

// A heading that is drawn as an outline and then filled in. The owner picked
// the idea from the React Bits gallery ("Stroke Text"). This is our own
// implementation (SVG text, CSS keyframes, IntersectionObserver); no React Bits
// code and no animation library (gsap) is used (ADR-065), and it is fast: a
// title is drawn and filled in well under a second.
// - Before the browser has measured the fonts, and always under reduced
//   motion, the heading is plain text, so nothing waits on JavaScript.
// - Then the text is set as SVG, broken into lines to the width it has, one
//   <tspan> per letter (by grapheme, so Armenian «և» stays whole), each
//   letter's outline drawn on with stroke-dashoffset and its fill fading in.
// - It plays once, when the heading first comes into view.
// Screen readers get the plain text; the drawing is aria-hidden.
const DRAW = 0.42; // seconds an outline takes to draw
const STAGGER = 0.016; // seconds between letters
const MAX_STAGGER = 0.3; // however long the title, the last letter starts by now

let segmenter: Intl.Segmenter | null | undefined;
function graphemes(text: string): string[] {
  if (segmenter === undefined)
    segmenter =
      typeof Intl !== "undefined" && "Segmenter" in Intl
        ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
        : null;
  return segmenter ? Array.from(segmenter.segment(text), (s) => s.segment) : Array.from(text);
}

type Layout = { lines: string[]; width: number; lineHeight: number; fontSize: number };

/** Breaks `text` into lines no wider than `width`, measured in the heading's own font. */
function measure(el: HTMLElement, text: string): Layout | null {
  const cs = getComputedStyle(el);
  const fontSize = parseFloat(cs.fontSize);
  const width = el.clientWidth;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx || !width || !fontSize) return null;
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${fontSize}px ${cs.fontFamily}`;
  const lineHeight = parseFloat(cs.lineHeight) || fontSize * 1.1;
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return { lines, width, lineHeight, fontSize };
}

export function StrokeTitle({
  text,
  as: Tag = "h2",
  className,
  id,
  lang,
}: {
  text: string;
  as?: ElementType;
  className?: string;
  id?: string;
  lang?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  // Without IntersectionObserver it plays at once (the svg only exists in the browser).
  const [played, setPlayed] = useState(() => typeof window !== "undefined" && !("IntersectionObserver" in window));

  // Measured once the fonts are in, and again when the width changes.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    let gone = false;
    const run = () => {
      if (gone) return;
      const next = measure(el, text);
      if (next)
        setLayout((was) =>
          was && was.width === next.width && was.fontSize === next.fontSize && was.lines.join("|") === next.lines.join("|")
            ? was
            : next,
        );
    };
    run();
    void document.fonts?.ready.then(run);
    document.fonts?.addEventListener?.("loadingdone", run);
    const resized = new ResizeObserver(run);
    resized.observe(el);
    return () => {
      gone = true;
      resized.disconnect();
      document.fonts?.removeEventListener?.("loadingdone", run);
    };
  }, [text]);

  // Plays once, when it first scrolls into view.
  useEffect(() => {
    const el = ref.current;
    if (!el || !layout || played) return;
    if (!("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        io.disconnect();
        setPlayed(true);
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [layout, played]);

  let index = 0;
  const total = layout ? layout.lines.reduce((n, l) => n + graphemes(l).length, 0) : 0;
  const step = total > 1 ? Math.min(STAGGER, MAX_STAGGER / (total - 1)) : 0;
  return (
    <Tag ref={ref} id={id} lang={lang} className={`${styles.stroke} ${className ?? ""}`}>
      <span className="sr-only">{text}</span>
      {layout ? (
        <svg
          aria-hidden="true"
          className={styles.strokeSvg}
          data-played={played || undefined}
          width={layout.width}
          height={layout.lineHeight * layout.lines.length}
          viewBox={`0 0 ${layout.width} ${layout.lineHeight * layout.lines.length}`}
          style={
            {
              "--dash": layout.fontSize * 6,
              "--draw": `${DRAW}s`,
              "--sw": Math.max(0.9, layout.fontSize / 40),
            } as CSSProperties
          }
        >
          {layout.lines.map((line, row) => (
            <text
              key={row}
              x={0}
              y={layout.lineHeight * row + layout.lineHeight / 2 + layout.fontSize * 0.3}
              className={styles.strokeText}
            >
              {graphemes(line).map((g, i) => (
                <tspan key={i} className={styles.strokeChar} style={{ "--d": `${(index++ * step).toFixed(3)}s` } as CSSProperties}>
                  {g}
                </tspan>
              ))}
            </text>
          ))}
        </svg>
      ) : (
        <span aria-hidden="true">{text}</span>
      )}
    </Tag>
  );
}
