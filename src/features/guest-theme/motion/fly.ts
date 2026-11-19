import { loadMotion, reducedMotion } from "./motion";

// "Fly to cart": the dish, as a small plate (its photo, or an empty plate),
// arcs from the "+" to where the order lives, and the count there bounces
// on a spring as it lands. The landing spot is the first visible element
// marked data-fly-target, lowest value first (the order panel on a
// desktop is 1, the bottom bar's Order item 2); inside it, the element
// marked data-fly-bump bounces (the count badge), else the target itself.
// Decoration only: the cart has already changed when the plate takes off.
// The flight itself lives in the engine chunk (fly-run.ts).
export type FlyingDish = { photo: string | null };

export function flyToCart(from: Element | null, dish: FlyingDish) {
  if (!from || reducedMotion()) return;
  const start = from.getBoundingClientRect();
  void loadMotion().then((e) => e?.fly(from, start, dish));
}
