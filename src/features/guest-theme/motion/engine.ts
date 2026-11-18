// The animation engine, loaded on demand (motion.ts). Motion's mini
// animate() runs on the browser's own animation engine (WAAPI) and Motion's
// spring generator turns springs into easing curves: about 5 KB gzipped
// together, against 45 KB for motion/react's <motion.div>. The spark and
// "fly to cart" effects ship here too: nothing on the page needs them first.
export { animate } from "motion/mini";
export { spring } from "motion";
export { burst } from "./burst";
export { fly } from "./fly-run";
