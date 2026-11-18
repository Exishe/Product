import { loadMotion, motionNow, reducedMotion } from "./motion";

// Click Spark, after React Bits (https://reactbits.dev/animations/click-spark,
// MIT + Commons Clause): rays burst from the tap and fade. Ours draws them
// as small spans animated with Motion instead of a page-wide canvas, in two
// of the theme's colours (the accent and the star: red and blush in Wine),
// with a soft flash at the centre, inside the café's theme wrapper. "big" is
// the celebration when the order is ready.
type Burst = { count: number; length: number; width: number; radius: number; duration: number };
const SIZES: Record<"normal" | "big", Burst> = {
  normal: { count: 12, length: 16, width: 3, radius: 34, duration: 0.6 },
  big: { count: 18, length: 26, width: 4, radius: 90, duration: 0.95 },
};
const COLORS = ["var(--guest-accent)", "var(--guest-star)"];

export function sparkFrom(target: Element | null, size: "normal" | "big" = "normal") {
  if (!target || reducedMotion()) return;
  const m = motionNow();
  // Not here yet (the very first tap): play as soon as it arrives.
  if (!m) {
    const r = target.getBoundingClientRect();
    void loadMotion().then((e) => e && burst(e, target, r, size));
    return;
  }
  burst(m, target, target.getBoundingClientRect(), size);
}

function burst(m: NonNullable<ReturnType<typeof motionNow>>, target: Element, r: DOMRect, size: "normal" | "big") {
  const { count, length, width, radius, duration } = SIZES[size];
  const root = target.closest(".guest-lux") ?? document.body;
  const layer = document.createElement("span");
  layer.setAttribute("aria-hidden", "true");
  layer.dataset.spark = size;
  layer.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;width:0;height:0;pointer-events:none;z-index:60`;
  const flash = document.createElement("span");
  const f = radius * 0.9;
  flash.style.cssText = `position:absolute;left:${-f}px;top:${-f}px;width:${f * 2}px;height:${f * 2}px;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--guest-star) 70%,transparent),transparent)`;
  layer.appendChild(flash);
  const rays: HTMLElement[] = [];
  for (let i = 0; i < count; i++) {
    const ray = document.createElement("span");
    ray.style.cssText = `position:absolute;left:${-width / 2}px;top:${-length / 2}px;width:${width}px;height:${length}px;border-radius:${width}px;background:${COLORS[i % 2]};transform-origin:50% 50%`;
    ray.dataset.angle = String((360 / count) * i);
    layer.appendChild(ray);
    rays.push(ray);
  }
  root.appendChild(layer);
  const runs = [
    m.animate(flash, { transform: ["scale(0.2)", "scale(1)"], opacity: [0.9, 0] }, { duration: duration * 0.7, ease: "easeOut" }),
    ...rays.map((ray, i) => {
      const a = ray.dataset.angle;
      // Every other ray flies a little further: the burst looks less stamped.
      const far = radius * (i % 2 ? 0.8 : 1);
      return m.animate(
        ray,
        {
          transform: [
            `rotate(${a}deg) translateY(-${radius * 0.3}px) scaleY(1.2)`,
            `rotate(${a}deg) translateY(-${far + length / 2}px) scaleY(0.15)`,
          ],
          opacity: [1, 1, 0],
        },
        { duration, ease: [0.16, 1, 0.3, 1] },
      );
    }),
  ];
  void Promise.all(runs).finally(() => layer.remove());
}
