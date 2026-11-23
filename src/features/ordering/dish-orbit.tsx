"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Plate, dishPhotoUrl } from "@/features/menu/guest-menu/ui";
import type { Locale } from "@/i18n/routing";
import { formatAmd } from "@/lib/format/money";
import { useGuestI18n } from "./guest-i18n-context";

export type OrbitDish = { id: string; name: string; image: string | null; price: number };

// Dishes on an orbit: plates ride an ellipse, the one in front is large and
// sharp, the ones behind are smaller and fainter, and the ring turns slowly by
// itself. Drag it, press the arrows, or tap a plate to bring it to the front;
// the front dish is named under the ring with its price. The idea comes from
// the "Dish Orbit Carousel" the owner picked on 21st.dev; this is our own code
// (a requestAnimationFrame loop and CSS transforms, no animation library). It
// pauses while a finger or the pointer is on it, and under reduced motion it
// does not turn by itself (the arrows and a tap still move it).
const SPEED = 0.16; // radians per second while it turns by itself
const TAU = Math.PI * 2;

export function DishOrbit({ dishes, menuHref }: { dishes: OrbitDish[]; menuHref: string }) {
  const { t, locale } = useGuestI18n();
  const box = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const angle = useRef(0); // where the ring is
  const target = useRef<number | null>(null); // where it is going, when a plate or arrow was used
  const paused = useRef(false);
  const drag = useRef<{ x: number; angle: number; moved: boolean } | null>(null);
  const reduced = useRef(false);
  const [front, setFront] = useState(0);
  const n = dishes.length;
  const step = n > 0 ? TAU / n : 0;

  useEffect(() => {
    if (n === 0) return;
    reduced.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    let shown = -1;
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const el = box.current;
      if (target.current !== null) {
        // Ease towards the chosen plate.
        const diff = target.current - angle.current;
        angle.current += diff * Math.min(1, dt * 7);
        if (Math.abs(diff) < 0.002) {
          angle.current = target.current;
          target.current = null;
        }
      } else if (!paused.current && !reduced.current && !drag.current) angle.current += SPEED * dt;
      if (el) {
        const w = el.clientWidth;
        const rx = Math.max(90, Math.min(w * 0.36, 360));
        const ry = 26;
        const base = w < 420 ? 128 : 176;
        let best = 0;
        let bestDepth = -2;
        items.current.forEach((li, i) => {
          if (!li) return;
          // 0 at the front, turning one way as the angle grows.
          const a = i * step - angle.current;
          const depth = Math.cos(a); // 1 front, -1 back
          const k = (depth + 1) / 2;
          const scale = 0.5 + 0.5 * k;
          li.style.transform = `translate(calc(-50% + ${(Math.sin(a) * rx).toFixed(1)}px), ${(depth * ry).toFixed(1)}px) scale(${scale.toFixed(3)})`;
          li.style.opacity = String((0.3 + 0.7 * k).toFixed(2));
          li.style.zIndex = String(Math.round(k * 100));
          li.style.width = `${base}px`;
          if (depth > bestDepth) {
            bestDepth = depth;
            best = i;
          }
        });
        if (best !== shown) {
          shown = best;
          setFront(best);
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [n, step]);

  if (n === 0) return null;

  // Brings plate `i` to the front by the shortest way round.
  const bring = (i: number) => {
    const want = i * step;
    let diff = (((want - angle.current) % TAU) + TAU) % TAU;
    if (diff > Math.PI) diff -= TAU;
    target.current = angle.current + diff;
  };
  const turn = (by: number) => {
    const at = Math.round(angle.current / step) + by;
    target.current = at * step;
  };
  const current = dishes[front] ?? dishes[0]!;

  return (
    <div
      className="select-none"
      onPointerEnter={(e) => {
        if (e.pointerType === "mouse") paused.current = true;
      }}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") paused.current = false;
      }}
    >
      <div
        ref={box}
        className="relative h-[15rem] touch-pan-y overflow-hidden md:h-[17.5rem]"
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, angle: angle.current, moved: false };
          target.current = null;
          e.currentTarget.setPointerCapture?.(e.pointerId);
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          const el = box.current;
          if (!d || !el) return;
          const dx = e.clientX - d.x;
          if (Math.abs(dx) > 4) d.moved = true;
          // A drag across the ring's half width turns it a quarter.
          angle.current = d.angle - (dx / Math.max(120, el.clientWidth * 0.5)) * (Math.PI / 2);
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          // Settle on the nearest plate after a drag.
          if (d?.moved) target.current = Math.round(angle.current / step) * step;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <ul className="m-0 list-none p-0" aria-label={t("order.recommended")}>
          {dishes.map((d, i) => (
            <li
              key={d.id}
              ref={(el) => {
                items.current[i] = el;
              }}
              className="absolute top-2 left-1/2 will-change-transform"
              style={{ width: 150 }}
            >
              <button
                type="button"
                aria-label={d.name}
                aria-current={i === front ? "true" : undefined}
                onClick={() => {
                  if (!drag.current?.moved) bring(i);
                }}
                className="block w-full rounded-full focus-visible:outline-offset-4"
              >
                <Plate src={d.image ? dishPhotoUrl(d.image) : null} size={300} className="aspect-square w-full" />
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          aria-label={t("order.recPrev")}
          onClick={() => turn(-1)}
          className="absolute top-1/2 left-1 z-[200] grid size-11 -translate-y-1/2 place-items-center rounded-full border border-neutral-900 bg-white text-neutral-900 transition-transform duration-150 hover:scale-105 active:scale-90"
        >
          <ChevronLeft size={20} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={t("order.recNext")}
          onClick={() => turn(1)}
          className="absolute top-1/2 right-1 z-[200] grid size-11 -translate-y-1/2 place-items-center rounded-full border border-neutral-900 bg-white text-neutral-900 transition-transform duration-150 hover:scale-105 active:scale-90"
        >
          <ChevronRight size={20} aria-hidden />
        </button>
      </div>
      <div className="mt-1 text-center" aria-live="polite">
        <p className="display-face text-[1.5rem] leading-tight [overflow-wrap:anywhere]">{current.name}</p>
        <p className="num text-accent-text mt-0.5 font-semibold">{formatAmd(current.price, locale as Locale)}</p>
        <a
          href={menuHref}
          className="bg-add text-on-add rounded-pill mt-3 inline-flex min-h-11 items-center px-6 font-semibold transition-transform duration-150 hover:-translate-y-0.5 active:scale-95"
        >
          {t("order.orderMore")}
        </a>
      </div>
    </div>
  );
}
