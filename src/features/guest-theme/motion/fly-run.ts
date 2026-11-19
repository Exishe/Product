import { spring } from "motion";
import { animate } from "motion/mini";
import type { FlyingDish } from "./fly";

// The moving half of "fly to cart" (fly.ts), shipped in the lazily loaded
// engine chunk (engine.ts) so the menu's first JavaScript stays small.
const SIZE = 46;
const DURATION = 0.72;
const STEPS = 14;

function landing(): HTMLElement | null {
  const visible = Array.from(document.querySelectorAll<HTMLElement>("[data-fly-target]")).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  });
  visible.sort((a, b) => Number(a.dataset.flyTarget) - Number(b.dataset.flyTarget));
  return visible[0] ?? null;
}

export function fly(from: Element, start: DOMRect, dish: FlyingDish) {
  const target = landing();
  if (!target) return;
  const end = target.getBoundingClientRect();
  const root = from.closest(".guest-lux") ?? document.body;
  const sx = start.left + start.width / 2;
  const sy = start.top + start.height / 2;
  // The panel: land on its heading; the bar's item: on its icon.
  const ex = end.left + end.width / 2;
  const ey = target.dataset.flyTarget === "1" ? end.top + 40 : end.top + end.height * 0.35;
  // A throw: up and over, the arc higher the further it goes.
  const cx = (sx + ex) / 2;
  const cy = Math.min(sy, ey) - Math.max(90, Math.abs(ex - sx) * 0.35);

  const plate = document.createElement("span");
  plate.setAttribute("aria-hidden", "true");
  plate.dataset.flying = "";
  plate.style.cssText =
    `position:fixed;left:0;top:0;width:${SIZE}px;height:${SIZE}px;border-radius:50%;overflow:hidden;` +
    `display:grid;place-items:center;pointer-events:none;z-index:61;background:var(--guest-dish);` +
    `box-shadow:0 0 0 3px var(--guest-badge),0 10px 24px -8px rgb(0 0 0 / 0.5);will-change:transform`;
  if (dish.photo) {
    const img = document.createElement("img");
    img.src = dish.photo;
    img.alt = "";
    img.style.cssText = "width:100%;height:100%;object-fit:cover";
    plate.appendChild(img);
  }
  root.appendChild(plate);

  const frames: string[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const p = i / STEPS;
    // Quick out of the button, slowing as it drops into the cart.
    const t = 1 - (1 - p) ** 2;
    const x = (1 - t) ** 2 * sx + 2 * (1 - t) * t * cx + t ** 2 * ex - SIZE / 2;
    const y = (1 - t) ** 2 * sy + 2 * (1 - t) * t * cy + t ** 2 * ey - SIZE / 2;
    const s = i === 0 ? 0.6 : 1.1 - 0.65 * t;
    frames.push(
      `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(t * 300).toFixed(0)}deg) scale(${s.toFixed(3)})`,
    );
  }
  const run = animate(
    plate,
    { transform: frames, opacity: [1, 1, 1, 0.85] },
    { duration: DURATION, ease: "linear" },
  );
  void Promise.resolve(run).finally(() => {
    plate.remove();
    land(target);
  });
}

function land(target: HTMLElement) {
  // The bar may have re-rendered (a link became a button): look again.
  const now = target.isConnected ? target : landing();
  if (!now) return;
  const bump = now.querySelector<HTMLElement>("[data-fly-bump]") ?? now;
  bump.dataset.bumped = "";
  void Promise.resolve(
    animate(bump, { transform: ["scale(1.7)", "scale(1)"] }, { type: spring, duration: 0.6, bounce: 0.6 }),
  ).finally(() => {
    bump.style.removeProperty("transform");
  });
  if (now !== bump)
    void Promise.resolve(
      animate(
        now,
        { transform: ["translateY(-4px)", "translateY(0px)"] },
        { type: spring, duration: 0.5, bounce: 0.5 },
      ),
    ).finally(() => now.style.removeProperty("transform"));
}
