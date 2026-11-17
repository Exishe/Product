"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import styles from "./carousel.module.css";

// A 3D circular carousel: cards stand on the wall of a cylinder seen from
// outside, turning slowly. Written for Pativ (no library, ~2 KB gzipped):
//
//   <CircularCarousel items={[{ src, alt, title, subtitle }]} preset="cylinder"
//     intro="rise" cardWidth={220} aspectRatio={1} speed={14} captions />
//
// - speed: degrees per second of the automatic turn (14 → one turn in ~26 s).
// - intro "rise": the first time the carousel scrolls into view, the cards
//   rise into place one after another while the cylinder sweeps a little.
// - Drag or swipe turns it, with inertia; hover, touch and keyboard focus
//   pause the automatic turn. Arrow keys, Home and End move between cards;
//   each card is a button (onSelect).
// - captions: the dish name and price of the card in front, under the cylinder.
// - Fewer than 6 items are repeated round the cylinder; the repeats are
//   hidden from screen readers and the keyboard.
// - prefers-reduced-motion: no cylinder and no turning, a plain row that
//   scrolls sideways instead (CSS swaps them, so there's no flash).
// The container's size comes from className (height) and its parent (width).

export type CarouselItem = {
  src: string;
  alt: string;
  title: string;
  subtitle?: string;
  /** Language of the title when it isn't the page's. */
  lang?: string;
};

type Props = {
  items: CarouselItem[];
  preset?: "cylinder";
  intro?: "rise" | "none";
  /** Largest card width in px; smaller screens get smaller cards. */
  cardWidth?: number;
  /** Width / height of the card photo. */
  aspectRatio?: number;
  /** Degrees per second. */
  speed?: number;
  captions?: boolean;
  /** Height of the 3D stage, e.g. "h-[340px] md:h-[480px]". */
  className?: string;
  label: string;
  hint: string;
  roleDescription: string;
  onSelect: (index: number) => void;
};

type Layout = { w: number; h: number; r: number; p: number; half: number };

const MIN_SLOTS = 8; // fewer than 6 dishes are repeated up to at least this
const REPEAT_BELOW = 6;
const RISE_MS = 900;
const RISE_STAGGER = 90;
const RESUME_AFTER_TOUCH = 2500;
const ease = (x: number) => 1 - (1 - x) ** 3;
const mod = (n: number, m: number) => ((n % m) + m) % m;

export function CircularCarousel({
  items,
  intro = "rise",
  cardWidth = 220,
  aspectRatio = 1,
  speed = 14,
  captions = true,
  className = "",
  label,
  hint,
  roleDescription,
  onSelect,
}: Props) {
  const n = items.length;
  const slots = n >= REPEAT_BELOW ? n : n * Math.ceil(MIN_SLOTS / n);
  const step = 360 / slots;
  const stage = useRef<HTMLDivElement>(null);
  const cards = useRef<(HTMLButtonElement | null)[]>([]);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [front, setFront] = useState(0);
  const [focusIdx, setFocusIdx] = useState(0);
  // Animation state lives in a ref: the loop writes styles directly.
  const anim = useRef({
    rot: intro === "rise" ? 40 : 0,
    vel: 0, // deg/ms while coasting after a drag
    auto: 0, // current automatic speed, eased toward the target
    target: null as number | null,
    introAt: intro === "rise" ? -1 : 0, // -1: not seen yet
    sweep: intro === "rise", // the opening sweep is still to run
    hover: false,
    focus: false,
    touchUntil: 0,
    drag: null as null | { x: number; rot: number; t: number; moved: boolean; id: number },
    lastFront: -1,
  });
  const hintId = useId();

  // Size the cylinder to the stage: on a phone it is wider than the screen
  // and the side cards slip past the edges; on a desktop it all shows.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => {
      const W = el.clientWidth;
      const H = el.clientHeight;
      if (!W || !H) return;
      const w = Math.round(Math.max(96, Math.min(cardWidth, W * 0.5, (H - 32) * aspectRatio)));
      const r = (w / 2 / Math.tan(Math.PI / slots)) * 1.12;
      setLayout({ w, h: Math.round(w / aspectRatio), r, p: Math.max(700, r * 2.8), half: W / 2 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cardWidth, aspectRatio, slots]);

  // The loop: automatic turn, drag inertia, keyboard targets, the intro.
  useEffect(() => {
    const el = stage.current;
    if (!el || !layout) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const a = anim.current;
    let frame = 0;
    let last = 0;
    let visible = false;

    const paint = (now: number) => {
      const introT = a.introAt < 0 ? -1 : now - a.introAt;
      for (let k = 0; k < slots; k++) {
        const card = cards.current[k];
        if (!card) continue;
        const deg = k * step + a.rot;
        const cos = Math.cos((deg * Math.PI) / 180);
        // Rise: lower and see-through until this card's turn comes.
        const rise = introT < 0 ? 0 : ease(Math.min(1, Math.max(0, (introT - k * RISE_STAGGER) / RISE_MS)));
        const lift = (1 - rise) * layout.h * 0.9;
        card.style.transform = `translate3d(-50%, calc(-50% + ${lift.toFixed(1)}px), ${(-layout.r).toFixed(1)}px) rotateY(${deg.toFixed(2)}deg) translateZ(${layout.r.toFixed(1)}px)`;
        // The far side shows faintly through, so it reads as a cylinder.
        card.style.opacity = String(rise * (cos >= 0 ? 0.55 + 0.45 * cos : 0.14 + 0.41 * (1 + cos)));
        card.style.pointerEvents = cos > 0.2 ? "" : "none";
        card.style.zIndex = String(Math.round(cos * 100) + 100);
      }
      const f = mod(Math.round(-a.rot / step), slots) % n;
      if (f !== a.lastFront) {
        a.lastFront = f;
        setFront(f);
      }
    };

    const tick = (now: number) => {
      frame = 0;
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      const paused = a.hover || a.focus || a.drag !== null || now < a.touchUntil;
      a.auto += ((paused ? 0 : speed / 1000) - a.auto) * Math.min(1, dt / 400);
      if (a.drag) {
        // the pointer handlers move rot
      } else if (a.target !== null) {
        const d = a.target - a.rot;
        a.rot += d * Math.min(1, dt / 120);
        if (Math.abs(d) < 0.05) {
          a.rot = a.target;
          a.target = null;
        }
      } else if (Math.abs(a.vel) > 0.002) {
        a.rot += a.vel * dt;
        a.vel *= Math.pow(0.94, dt / 16);
      } else if (a.sweep && a.introAt >= 0) {
        // the opening sweep from +40° back to the start
        const t = Math.min(1, (now - a.introAt) / (RISE_MS + slots * RISE_STAGGER));
        a.rot = 40 * (1 - ease(t));
        if (t === 1) a.sweep = false;
      } else {
        a.rot -= a.auto * dt;
      }
      a.rot = mod(a.rot + 180, 360) - 180;
      if (a.target !== null) a.target = a.rot + (mod(a.target - a.rot + 180, 360) - 180);
      paint(now);
      if (visible && document.visibilityState === "visible") frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!frame && visible) {
        last = 0;
        frame = requestAnimationFrame(tick);
      }
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = Boolean(entry?.isIntersecting);
        if (visible && a.introAt < 0) a.introAt = performance.now();
        if (visible) start();
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    const onVis = () => start();
    document.addEventListener("visibilitychange", onVis);

    // Drag: horizontal movement turns the cylinder so the front card follows
    // the finger; vertical movement is left to the page (touch-action: pan-y).
    const degPerPx = 180 / (Math.PI * layout.r);
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      a.drag = { x: e.clientX, rot: a.rot, t: performance.now(), moved: false, id: e.pointerId };
      a.vel = 0;
      a.target = null;
      a.sweep = false;
      if (e.pointerType !== "mouse") a.touchUntil = Infinity;
      start();
    };
    const move = (e: PointerEvent) => {
      const d = a.drag;
      if (!d || e.pointerId !== d.id) return;
      const dx = e.clientX - d.x;
      if (!d.moved && Math.abs(dx) > 6) {
        d.moved = true;
        el.setPointerCapture(e.pointerId);
      }
      if (!d.moved) return;
      const now = performance.now();
      const next = d.rot + dx * degPerPx;
      const dt = Math.max(1, now - d.t);
      a.vel = a.vel * 0.6 + ((next - a.rot) / dt) * 0.4;
      a.rot = next;
      d.t = now;
      d.rot = next;
      d.x = e.clientX;
    };
    const up = (e: PointerEvent) => {
      const d = a.drag;
      if (!d || e.pointerId !== d.id) return;
      if (performance.now() - d.t > 80) a.vel = 0; // held still before letting go
      a.drag = null;
      if (e.pointerType !== "mouse") a.touchUntil = performance.now() + RESUME_AFTER_TOUCH;
      if (d.moved) {
        // the click that ends a drag must not open a dish
        const swallow = (c: Event) => {
          c.stopPropagation();
          c.preventDefault();
        };
        el.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => el.removeEventListener("click", swallow, { capture: true }), 300);
      }
    };
    const enter = (e: PointerEvent) => {
      if (e.pointerType === "mouse") a.hover = true;
    };
    const leave = (e: PointerEvent) => {
      if (e.pointerType === "mouse") a.hover = false;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerenter", enter);
    el.addEventListener("pointerleave", leave);
    paint(performance.now());
    return () => {
      cancelAnimationFrame(frame);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("pointerenter", enter);
      el.removeEventListener("pointerleave", leave);
    };
  }, [layout, slots, step, n, speed, intro]);

  // Bring item i's own (first) card to the front and focus it.
  const goTo = (i: number) => {
    const a = anim.current;
    const idx = mod(i, n);
    a.target = -idx * step;
    a.vel = 0;
    a.sweep = false;
    setFocusIdx(idx);
    cards.current[idx]?.focus({ preventScroll: true });
  };

  const current = items[front];
  return (
    <div
      role="region"
      aria-roledescription={roleDescription}
      aria-label={label}
      aria-describedby={hintId}
      className={styles.root}
    >
      <p id={hintId} className="sr-only">
        {hint}
      </p>
      <div
        ref={stage}
        className={`${styles.stage} ${className}`}
        style={layout ? ({ perspective: `${layout.p.toFixed(0)}px` } as CSSProperties) : undefined}
        onFocus={() => {
          anim.current.focus = true;
        }}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) anim.current.focus = false;
        }}
      >
        <span aria-hidden="true" className={styles.floor} />
        <ul className={styles.ring}>
          {Array.from({ length: slots }, (_, k) => {
            const i = k % n;
            const item = items[i]!;
            const repeat = k >= n;
            return (
              <li key={k} aria-hidden={repeat || undefined}>
                <button
                  ref={(b) => {
                    cards.current[k] = b;
                  }}
                  type="button"
                  className={styles.card}
                  style={{
                    width: layout?.w ?? cardWidth,
                    height: layout?.h ?? cardWidth / aspectRatio,
                    opacity: 0,
                  }}
                  tabIndex={!repeat && i === focusIdx ? 0 : -1}
                  aria-label={repeat ? undefined : [item.title, item.subtitle].filter(Boolean).join(", ")}
                  onFocus={() => {
                    if (repeat) return;
                    setFocusIdx(i);
                    const a = anim.current;
                    a.sweep = false;
                    a.target = a.rot + (mod(-i * step - a.rot + 180, 360) - 180);
                  }}
                  onKeyDown={(e) => {
                    const go = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: n - 1 }[e.key];
                    if (go === undefined) return;
                    e.preventDefault();
                    goTo(go);
                  }}
                  onClick={() => onSelect(i)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- public Storage URL, already sized webp */}
                  <img src={item.src} alt="" draggable={false} decoding="async" loading="lazy" />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      {captions && current && (
        <p aria-hidden="true" className={styles.caption} key={front}>
          <span className="display-face block text-[1.375rem] leading-tight md:text-2xl" lang={current.lang}>
            {current.title}
          </span>
          {current.subtitle && <span className="num text-gold-deep mt-0.5 block text-sm font-semibold">{current.subtitle}</span>}
        </p>
      )}
      {/* Reduced motion: the same dishes in a plain row (CSS shows one or the other). */}
      <ul className={`${styles.row} overflow-x-auto`}>
        {items.map((item, i) => (
          <li key={i}>
            <button type="button" className={styles.rowCard} onClick={() => onSelect(i)}>
              {/* eslint-disable-next-line @next/next/no-img-element -- public Storage URL, already sized webp */}
              <img src={item.src} alt="" decoding="async" loading="lazy" />
              <span className="display-face mt-2 block text-lg leading-tight" lang={item.lang}>
                {item.title}
              </span>
              {item.subtitle && <span className="num text-gold-deep block text-sm font-semibold">{item.subtitle}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
