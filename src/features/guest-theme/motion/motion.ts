// Guest animations (ADR-052) run on Motion (motion.dev), fetched only after
// the guest first scrolls, touches or types, and then when the browser is
// idle: a guest on 3G who only reads spends no bytes on decoration, and it
// never delays the first tap. Everything here is a no-op under prefers-reduced-motion, and until
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

const FIRST_TOUCH = ["pointerdown", "touchstart", "scroll", "keydown", "wheel"] as const;

/** Fetch the engine after the guest's first interaction, once the browser is idle. */
export function warmMotion(): () => void {
  if (reducedMotion() || engine || loading) return () => {};
  const go = () => {
    stop();
    if ("requestIdleCallback" in window) window.requestIdleCallback(() => void loadMotion(), { timeout: 1500 });
    else setTimeout(() => void loadMotion(), 300);
  };
  const stop = () => FIRST_TOUCH.forEach((e) => window.removeEventListener(e, go));
  FIRST_TOUCH.forEach((e) => window.addEventListener(e, go, { once: true, passive: true }));
  return stop;
}
