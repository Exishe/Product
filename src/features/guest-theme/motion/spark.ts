import { motionNow } from "./motion";

// Click Spark, after React Bits (https://reactbits.dev/animations/click-spark,
// MIT + Commons Clause): eight short rays burst from the tap and fade. Ours
// draws them as small spans animated with Motion instead of a page-wide
// canvas, in the theme's glow colour, inside the café's theme wrapper.
const COUNT = 8;
const SIZE = 10;
const RADIUS = 18;

export function sparkFrom(target: Element | null) {
  const m = motionNow();
  if (!m || !target) return;
  const root = target.closest(".guest-lux") ?? document.body;
  const r = target.getBoundingClientRect();
  const layer = document.createElement("span");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;width:0;height:0;pointer-events:none;z-index:60`;
  const rays: HTMLElement[] = [];
  for (let i = 0; i < COUNT; i++) {
    const ray = document.createElement("span");
    ray.style.cssText = `position:absolute;left:-1px;top:${-SIZE / 2}px;width:2px;height:${SIZE}px;border-radius:2px;background:var(--guest-glow);transform-origin:50% 50%`;
    ray.dataset.angle = String((360 / COUNT) * i);
    layer.appendChild(ray);
    rays.push(ray);
  }
  root.appendChild(layer);
  const runs = rays.map((ray) => {
    const a = ray.dataset.angle;
    return m.animate(
      ray,
      {
        transform: [`rotate(${a}deg) translateY(-${RADIUS * 0.5}px) scaleY(1)`, `rotate(${a}deg) translateY(-${RADIUS + SIZE}px) scaleY(0.2)`],
        opacity: [1, 0],
      },
      { duration: 0.42, ease: "easeOut" },
    );
  });
  void Promise.all(runs).finally(() => layer.remove());
}
