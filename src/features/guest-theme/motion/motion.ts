// Guest animations (ADR-052) run on Motion (motion.dev), fetched only when
// the browser is idle after the menu is up, so it never delays the first
// tap. Everything here is a no-op under prefers-reduced-motion, and until
// the engine has arrived a component simply shows its resting state.
type Engine = typeof import("./engine");

let engine: Engine | null = null;
let loading: Promise<Engine | null> | null = null;

export const reducedMotion = () =>
  typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The engine if it has arrived (and motion is wanted), else null. */
export const motionNow = (): Engine | null => (reducedMotion() ? null : engine);

export function loadMotion(): Promise<Engine | null> {
  if (reducedMotion()) return Promise.resolve(null);
  loading ??= import("./engine").then(
    (m) => (engine = m),
    () => {
      loading = null; // offline: try again on the next request
      return null;
    },
  );
  return loading;
}

/** Fetch the engine once the browser has nothing better to do. */
export function warmMotion() {
  if (reducedMotion() || engine || loading) return;
  if ("requestIdleCallback" in window) window.requestIdleCallback(() => void loadMotion(), { timeout: 3000 });
  else setTimeout(() => void loadMotion(), 1200);
}
