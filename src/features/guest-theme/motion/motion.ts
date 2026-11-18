// Guest animations (ADR-052) run on Motion (motion.dev), fetched as its own
// small chunk right after the page has painted and hydrated, when the
// browser is idle (or after a second at the latest), or at once on the
// guest's first scroll, touch or key. It never delays the first paint or the
// first tap. Everything here is a no-op under prefers-reduced-motion, and
// until the engine has arrived a component simply shows its resting state.
type Engine = typeof import("./engine");

let engine: Engine | null = null;
let loading: Promise<Engine | null> | null = null;
let warmed = false;
let arrive: (m: Engine) => void = () => {};
// Settles once, when the engine first arrives (never under reduced motion).
const arrived = new Promise<Engine>((resolve) => {
  arrive = resolve;
});

export const reducedMotion = () =>
  typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The engine if it has arrived (and motion is wanted), else null. */
export const motionNow = (): Engine | null => (reducedMotion() ? null : engine);

export function loadMotion(): Promise<Engine | null> {
  if (reducedMotion()) return Promise.resolve(null);
  loading ??= import("./engine").then(
    (m) => {
      engine = m;
      arrive(m);
      return m;
    },
    () => {
      loading = null; // offline: try again on the next request
      return null;
    },
  );
  return loading;
}

const FIRST_TOUCH = ["pointerdown", "touchstart", "scroll", "keydown", "wheel"] as const;
const IDLE_TIMEOUT = 1000;

/**
 * Fetch the engine soon after first paint: when the browser is next idle
 * (at most a second later), or at once on the guest's first interaction.
 * Safe to call from every component; only the first call schedules.
 */
export function warmMotion(): () => void {
  if (typeof window === "undefined" || reducedMotion() || engine || loading || warmed) return () => {};
  warmed = true;
  const go = () => {
    FIRST_TOUCH.forEach((e) => window.removeEventListener(e, go));
    void loadMotion();
  };
  FIRST_TOUCH.forEach((e) => window.addEventListener(e, go, { once: true, passive: true }));
  if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: IDLE_TIMEOUT });
  else setTimeout(go, 300);
  // The schedule is shared by every component, so unmounting one keeps it.
  return () => {};
}

/**
 * The engine once it has arrived (warming it if nobody has yet), or null
 * under reduced motion or if it has not arrived within `within` ms (offline,
 * a very slow network): callers then just show the resting state.
 */
export function motionReady(within = 2500): Promise<Engine | null> {
  if (reducedMotion()) return Promise.resolve(null);
  if (engine) return Promise.resolve(engine);
  warmMotion();
  return Promise.race([arrived, new Promise<null>((r) => setTimeout(() => r(null), within))]);
}
