import { loadMotion, reducedMotion } from "./motion";

// A spark at the tap: rays burst out and fade. The idea is a common one; the
// owner picked it from the React Bits gallery ("Click Spark"). This is our
// own implementation; no React Bits code is used or copied here (ADR-065).
// The rays are small spans animated with Motion (no canvas), in two of the
// theme's colours (the glow and the star: red and blush in Wine), with a
// soft flash at the centre, inside the café's theme wrapper. "big" is the
// celebration when the order is ready.
// The drawing lives in the engine chunk (burst.ts).
export function sparkFrom(target: Element | null, size: "normal" | "big" = "normal") {
  if (!target || reducedMotion()) return;
  const r = target.getBoundingClientRect();
  // Plays at once if the engine is here, else as soon as it arrives.
  void loadMotion().then((e) => e?.burst(target, r, size));
}
