import { loadMotion, motionNow, reducedMotion } from "./motion";

// "Fly to cart": the dish, as a small plate (its photo or its initial),
// arcs from the "+" to where the order lives, and the count there bounces
// on a spring as it lands. The landing spot is the first visible element
// marked data-fly-target, lowest value first (the order panel on a
// desktop is 1, the bottom bar's Order item 2); inside it, the element
// marked data-fly-bump bounces (the count badge), else the target itself.
// Decoration only: the cart has already changed when the plate takes off.
const SIZE = 46;
const DURATION = 0.72;
const STEPS = 14;

type Engine = NonNullable<ReturnType<typeof motionNow>>;
export type FlyingDish = { photo: string | null; initial: string };

function landing(): HTMLElement | null {
  const visible = Array.from(document.querySelectorAll<HTMLElement>("[data-fly-target]")).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
  });
  visible.sort((a, b) => Number(a.dataset.flyTarget) - Number(b.dataset.flyTarget));
  return visible[0] ?? null;
}

export function flyToCart(from: Element | null, dish: FlyingDish) {
  if (!from || reducedMotion()) return;
  const start = from.getBoundingClientRect();
  const m = motionNow();
  if (m) fly(m, from, start, dish);
  else void loadMotion().then((e) => e && fly(e, from, start, dish));
}

function fly(m: Engine, from: Element, start: DOMRect, dish: FlyingDish) {
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
    `display:grid;place-items:center;pointer-events:none;z-index:61;background:var(--guest-plate);` +
    `color:var(--guest-accent-text);font-family:var(--font-display);font-size:22px;line-height:1;` +
    `box-shadow:0 0 0 3px var(--guest-accent),0 10px 24px -8px rgb(0 0 0 / 0.5);will-change:transform`;
  if (dish.photo) {
    const img = document.createElement("img");
    img.src = dish.photo;
    img.alt = "";
    img.style.cssText = "width:100%;height:100%;object-fit:cover";
    plate.appendChild(img);
  } else plate.textContent = dish.initial;
  root.appendChild(plate);

  const frames: string[] = [];
  for (let i = 0; i <= STEPS; i++) {
    const p = i / STEPS;
    // Quick out of the button, slowing as it drops into the cart.
    const t = 1 - (1 - p) ** 2;
    const x = (1 - t) ** 2 * sx + 2 * (1 - t) * t * cx + t ** 2 * ex - SIZE / 2;
    const y = (1 - t) ** 2 * sy + 2 * (1 - t) * t * cy + t ** 2 * ey - SIZE / 2;
    const s = i === 0 ? 0.6 : 1.1 - 0.65 * t;
    frames.push(`translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(t * 300).toFixed(0)}deg) scale(${s.toFixed(3)})`);
  }
  const run = m.animate(plate, { transform: frames, opacity: [1, 1, 1, 0.85] }, { duration: DURATION, ease: "linear" });
  void Promise.resolve(run).finally(() => {
    plate.remove();
    land(m, target);
  });
}

function land(m: Engine, target: HTMLElement) {
  // The bar may have re-rendered (a link became a button): look again.
  const now = target.isConnected ? target : landing();
  if (!now) return;
  const bump = now.querySelector<HTMLElement>("[data-fly-bump]") ?? now;
  bump.dataset.bumped = "";
  void Promise.resolve(
    m.animate(bump, { transform: ["scale(1.7)", "scale(1)"] }, { type: m.spring, duration: 0.6, bounce: 0.6 }),
  ).finally(() => {
    bump.style.removeProperty("transform");
  });
  if (now !== bump)
    void Promise.resolve(
      m.animate(now, { transform: ["translateY(-4px)", "translateY(0px)"] }, { type: m.spring, duration: 0.5, bounce: 0.5 }),
    ).finally(() => now.style.removeProperty("transform"));
}
