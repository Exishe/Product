"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Plate, dishPhotoUrl } from "@/features/menu/guest-menu/ui";
import type { Locale } from "@/i18n/routing";
import { formatAmd } from "@/lib/format/money";
import { useGuestI18n } from "./guest-i18n-context";
import styles from "./dish-orbit.module.css";

export type OrbitDish = {
  id: string;
  name: string;
  image: string | null;
  price: number;
  description?: string;
  /** The dish has required choices: it is chosen on the menu, not added from here. */
  choose?: boolean;
};

// «Recommended for you»: the owner's Dish Orbit Carousel (21st.dev), as our own
// code. One dish is shown large; changing dish swings its plate out over the top
// on a wide orbit while the next plate swings in from the other side, the two
// title lines wipe out and back in (the thin one from the right, the heavy one
// from the left), the card's text crosses over, and a pastel arc behind the
// scene stretches along the orbit and takes the new dish's colour. It turns by
// itself every few seconds while it is on screen, and an arrow, a dot, a
// thumbnail or a swipe jumps. The original is driven by gsap and the page
// scroll; this one is plain Web Animations (no library, nothing pinned), and
// under reduced motion the dish just changes. ADR-094 area pass: no ranking
// eyebrow and no decorative swoosh; the dish reads name, price, description,
// then one outline «Add · price» (a filled button would compete with the
// page's one primary); in the stacked layout (the order page's column, a
// phone) a «‹ 1 / 9 ›» counter with two 44 px arrows sits on the heading's
// row instead of the dots (ADR-098), so the dish itself has one control.
const SWING = 50; // degrees a plate travels round the orbit's pivot
const ORBIT = { x: 299, y: -450, r: 650, w: 118 }; // the band's circle, in canvas px
const REST = [
  [50, 98],
  [46, 124],
  [60, 126],
  [40, 100],
];
const SWEEP = [38, 146];
const EVERY = 5200; // ms between dishes on their own
const HIDE_1 = "inset(0% 0% 0% 100%)"; // the thin line wipes in from the right
const HIDE_2 = "inset(0% 100% 0% 0%)"; // the heavy line from the left
const SHOW = "inset(0% 0% 0% 0%)";
const TINTS = [
  "var(--guest-band)",
  "var(--guest-chip)",
  "color-mix(in srgb, var(--guest-add) 14%, var(--guest-page))",
  "color-mix(in srgb, var(--guest-accent-text) 12%, var(--guest-page))",
];

const wrap = (i: number, n: number) => ((i % n) + n) % n;

/** The band along the orbit: thick in the middle, tapering to both ends. Angles in degrees. */
function arcPath(a0: number, a1: number, steps = 48): string {
  const out: string[] = [];
  const inn: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = ((a0 + (a1 - a0) * t) * Math.PI) / 180;
    const h = (ORBIT.w / 2) * Math.pow(Math.sin(Math.PI * t), 0.45);
    out.push(`${(ORBIT.x + Math.cos(a) * (ORBIT.r + h)).toFixed(1)} ${(ORBIT.y + Math.sin(a) * (ORBIT.r + h)).toFixed(1)}`);
    inn.push(`${(ORBIT.x + Math.cos(a) * (ORBIT.r - h)).toFixed(1)} ${(ORBIT.y + Math.sin(a) * (ORBIT.r - h)).toFixed(1)}`);
  }
  return `M${out.join("L")}L${inn.reverse().join("L")}Z`;
}

/** The thin first line and the heavy last word: «Cheese pie with herbs» -> «Cheese pie with» / «herbs». */
function titleParts(name: string): [string, string] {
  const words = name.trim().split(/\s+/);
  if (words.length < 2) return ["", name];
  return [words.slice(0, -1).join(" "), words[words.length - 1] ?? ""];
}

const fit = (chars: number, max: number, width: number, em: number) => Math.min(max, width / (Math.max(1, chars) * em));

export function DishOrbit({
  dishes,
  menuHref,
  onAdd,
  heading,
}: {
  dishes: OrbitDish[];
  menuHref: string;
  /** The section's heading; the stacked layout puts the counter on its row. */
  heading?: ReactNode;
  /** Puts a dish without required choices in this table's cart and opens it on the menu. */
  onAdd?: (itemId: string) => void;
}) {
  const { t, locale } = useGuestI18n();
  const n = dishes.length;
  const [index, setIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const plates = useRef<(HTMLDivElement | null)[]>([]);
  const heads = useRef<(HTMLDivElement | null)[]>([]);
  const bodies = useRef<(HTMLDivElement | null)[]>([]);
  const arcEl = useRef<SVGPathElement>(null);
  const arc = useRef({ a0: REST[0]![0]!, a1: REST[0]![1]! });
  const shown = useRef(0);
  const running = useRef<Animation[]>([]);
  const frame = useRef(0);
  const paused = useRef(false);
  const visible = useRef(true);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const reduced = useRef(false);

  // The canvas is scaled to the card's width; under 768 px (the order page's column, a phone) it is stacked instead.
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fitCanvas = () => el.style.setProperty("--s", String(el.clientWidth / 960));
    fitCanvas();
    const resized = new ResizeObserver(fitCanvas);
    resized.observe(el);
    const seen = new IntersectionObserver(([e]) => (visible.current = Boolean(e?.isIntersecting)));
    seen.observe(el);
    return () => {
      resized.disconnect();
      seen.disconnect();
    };
  }, []);

  const drawArc = () => arcEl.current?.setAttribute("d", arcPath(arc.current.a0, arc.current.a1));

  // Moves the band's two angles to new ones over `ms`.
  const tweenArc = (to: number[], ms: number, delay = 0) => {
    const from = { ...arc.current };
    const t0 = performance.now() + delay;
    cancelAnimationFrame(frame.current);
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / ms));
      const e = 1 - Math.pow(1 - k, 3); // ease out
      arc.current.a0 = from.a0 + (to[0]! - from.a0) * e;
      arc.current.a1 = from.a1 + (to[1]! - from.a1) * e;
      drawArc();
      if (k < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };

  // The swap: only the outgoing and incoming dish move; the rest stay hidden.
  useEffect(() => {
    const from = shown.current;
    const to = index;
    const set = (list: (HTMLDivElement | null)[], i: number, on: boolean) => {
      const el = list[i];
      if (!el) return;
      if (on) el.setAttribute("data-on", "");
      else el.removeAttribute("data-on");
    };
    const rest = REST[to % REST.length]!;
    root.current?.style.setProperty("--tint", TINTS[to % TINTS.length]!);
    running.current.forEach((a) => a.cancel());
    running.current = [];
    if (from === to || reduced.current) {
      for (let i = 0; i < n; i++) {
        set(plates.current, i, i === to);
        set(heads.current, i, i === to);
        set(bodies.current, i, i === to);
      }
      arc.current = { a0: rest[0]!, a1: rest[1]! };
      drawArc();
      shown.current = to;
      return;
    }
    const dir = (index - from + n) % n <= n / 2 ? 1 : -1;
    const go = (el: Element | null | undefined, keyframes: Keyframe[], ms: number, easing: string, delay = 0) => {
      if (!el) return;
      const a = el.animate(keyframes, { duration: ms, easing, delay, fill: "both" });
      running.current.push(a);
    };
    const fromPlate = plates.current[from];
    const toPlate = plates.current[to];
    const fromHead = heads.current[from];
    const toHead = heads.current[to];
    const fromBody = bodies.current[from];
    const toBody = bodies.current[to];
    // plates: out over the top, the next swings in from the far side
    set(plates.current, to, true);
    go(fromPlate, [{ transform: "rotate(0deg)" }, { transform: `rotate(${SWING * dir}deg)` }], 620, "cubic-bezier(0.5,0,0.9,0.5)");
    go(toPlate, [{ transform: `rotate(${-SWING * dir}deg)`, opacity: 0.2 }, { transform: "rotate(0deg)", opacity: 1 }], 950, "cubic-bezier(0.15,0.8,0.2,1)", 300);
    // titles: the old ones wipe out, then the new ones wipe in
    const [o1, o2] = [fromHead?.querySelector("[data-t1]"), fromHead?.querySelector("[data-t2]")];
    const [i1, i2] = [toHead?.querySelector("[data-t1]"), toHead?.querySelector("[data-t2]")];
    go(o1, [{ clipPath: SHOW }, { clipPath: HIDE_1 }], 420, "cubic-bezier(0.5,0,0.9,0.5)");
    go(o2, [{ clipPath: SHOW }, { clipPath: HIDE_2 }], 420, "cubic-bezier(0.5,0,0.9,0.5)", 60);
    go(i1, [{ clipPath: HIDE_1 }, { clipPath: SHOW }], 700, "cubic-bezier(0.15,0.8,0.2,1)", 550);
    go(i2, [{ clipPath: HIDE_2 }, { clipPath: SHOW }], 700, "cubic-bezier(0.15,0.8,0.2,1)", 620);
    const swapAt = window.setTimeout(() => {
      set(heads.current, from, false);
      set(heads.current, to, true);
    }, 500);
    // card: cross over, the new rows rise in turn
    go(fromBody, [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-6px)" }], 300, "ease-in", 50);
    const bodySwap = window.setTimeout(() => {
      set(bodies.current, from, false);
      set(bodies.current, to, true);
    }, 380);
    if (toBody)
      Array.from(toBody.children).forEach((row, k) =>
        go(row, [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }], 500, "ease-out", 400 + k * 60),
      );
    // the band stretches along the orbit, then settles into the next dish's span
    tweenArc(SWEEP, 600);
    const settle = window.setTimeout(() => tweenArc(rest, 850), 600);
    const done = window.setTimeout(() => {
      running.current.forEach((a) => a.cancel());
      running.current = [];
      for (let i = 0; i < n; i++) {
        set(plates.current, i, i === to);
        set(heads.current, i, i === to);
        set(bodies.current, i, i === to);
      }
    }, 1350);
    shown.current = to;
    return () => {
      [swapAt, bodySwap, settle, done].forEach(window.clearTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the swap runs on a change of dish only
  }, [index, n]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  // On its own every few seconds, while on screen and not touched.
  useEffect(() => {
    if (n < 2) return;
    const timer = window.setInterval(() => {
      if (!paused.current && visible.current && !reduced.current && !document.hidden) setIndex((i) => wrap(i + 1, n));
    }, EVERY);
    return () => window.clearInterval(timer);
  }, [n]);

  if (n === 0) return null;
  const go = (to: number) => setIndex(wrap(to, n));
  const start = Math.max(0, Math.min(index - 1, n - 4));
  const current = dishes[index] ?? dishes[0]!;
  const status = `${index + 1} / ${n}: ${current.name}`;

  return (
    <div
      ref={root}
      className={styles.root}
      role="region"
      aria-roledescription="carousel"
      aria-label={t("order.recommended")}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") go(index + 1);
        else if (e.key === "ArrowLeft") go(index - 1);
      }}
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") paused.current = true;
      }}
      onPointerLeave={() => {
        paused.current = false;
      }}
      onPointerDown={(e) => {
        swipe.current = { x: e.clientX, y: e.clientY };
        paused.current = true;
      }}
      onPointerUp={(e) => {
        const s = swipe.current;
        swipe.current = null;
        if (e.pointerType !== "mouse") paused.current = false;
        if (!s) return;
        const dx = e.clientX - s.x;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.4) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      <div className={styles.top}>
        {heading}
        <div className={styles.counter}>
          <button type="button" className={styles.step} aria-label={t("order.recPrev")} onClick={() => go(index - 1)}>
            <ChevronLeft size={20} aria-hidden />
          </button>
          <span className={`num ${styles.count}`} aria-hidden="true">
            {index + 1} / {n}
          </span>
          <button type="button" className={styles.step} aria-label={t("order.recNext")} onClick={() => go(index + 1)}>
            <ChevronRight size={20} aria-hidden />
          </button>
        </div>
      </div>
      <div className={styles.scaler}>
        <div className={styles.canvas}>
          <svg className={styles.arc} viewBox="0 0 960 520" aria-hidden="true">
            <path ref={arcEl} d={arcPath(REST[0]![0]!, REST[0]![1]!)} />
          </svg>

          <div className={styles.pager} role="tablist" aria-label={t("order.recommended")}>
            {dishes.map((d, i) => (
              <button
                key={d.id}
                type="button"
                role="tab"
                className={styles.dot}
                aria-selected={i === index}
                aria-current={i === index ? "true" : undefined}
                aria-label={d.name}
                onClick={() => go(i)}
              >
                <i />
              </button>
            ))}
          </div>

          <div className={styles.plates}>
            {dishes.map((d, i) => (
              <div
                key={d.id}
                ref={(el) => {
                  plates.current[i] = el;
                }}
                className={styles.orbit}
                data-on={i === 0 ? "" : undefined}
                aria-hidden={i !== index}
              >
                <Plate src={d.image ? dishPhotoUrl(d.image) : null} size={300} className="aspect-square size-full" />
              </div>
            ))}
          </div>

          <div className={styles.head} aria-live="polite">
            {dishes.map((d, i) => {
              const [a, b] = titleParts(d.name);
              return (
                <div
                  key={d.id}
                  ref={(el) => {
                    heads.current[i] = el;
                  }}
                  className={styles.hd}
                  data-on={i === 0 ? "" : undefined}
                  aria-hidden={i !== index}
                >
                  <h3 style={{ margin: 0, font: "inherit" }}>
                    {a && (
                      <span data-t1="" className={styles.t1} style={{ fontSize: `${fit(a.length, 22, 330, 0.5)}px` } as CSSProperties}>
                        {a}
                      </span>
                    )}
                    <span data-t2="" className={styles.t2} style={{ fontSize: `${fit(b.length, 24, 330, 0.62)}px` } as CSSProperties}>
                      {b}
                    </span>
                  </h3>
                </div>
              );
            })}
          </div>

          <div className={styles.acts}>
            {onAdd && !current.choose ? (
              <button
                type="button"
                onClick={() => onAdd(current.id)}
                className="border-line-strong text-ink hover:bg-chip rounded-pill inline-flex min-h-12 items-center gap-2 border px-6 font-semibold transition-transform duration-150 active:scale-95"
              >
                {t("sheet.add")}
                <span aria-hidden="true">·</span>
                <span className="num whitespace-nowrap">{formatAmd(current.price, locale as Locale)}</span>
              </button>
            ) : (
              <a
                href={menuHref}
                className="border-line-strong text-ink hover:bg-chip rounded-pill inline-flex min-h-12 items-center border px-6 font-semibold transition-transform duration-150 active:scale-95"
              >
                {t("order.toMenu")}
              </a>
            )}
          </div>

          <div className={styles.card}>
            <div className={styles.bodies}>
              {dishes.map((d, i) => (
                <div
                  key={d.id}
                  ref={(el) => {
                    bodies.current[i] = el;
                  }}
                  className={styles.body}
                  data-on={i === 0 ? "" : undefined}
                  aria-hidden={i !== index}
                >
                  <span className={styles.badge}>{formatAmd(d.price, locale as Locale)}</span>
                  <p className={styles.desc}>{d.description || d.name}</p>
                </div>
              ))}
            </div>
          </div>

          <div className={styles.strip}>
            <button type="button" className={styles.arrow} aria-label={t("order.recPrev")} onClick={() => go(index - 1)}>
              <ChevronLeft size={20} aria-hidden />
            </button>
            <div className={styles.win}>
              <div className={styles.track} style={{ transform: `translateX(${-start * 118}px)` }}>
                {dishes.map((d, i) => (
                  <div key={d.id} className={styles.th}>
                    <button type="button" className={styles.thBtn} aria-current={i === index ? "true" : undefined} onClick={() => go(i)}>
                      <Plate src={d.image ? dishPhotoUrl(d.image) : null} size={112} className="size-14" />
                      <span className={styles.thName}>{d.name}</span>
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <button type="button" className={styles.arrow} aria-label={t("order.recNext")} onClick={() => go(index + 1)}>
              <ChevronRight size={20} aria-hidden />
            </button>
          </div>
        </div>
      </div>
      <p className={styles.sr} aria-live="polite">
        {status}
      </p>
    </div>
  );
}
