// The public demo cafés (owner, Nov 2026): they wear black and white, with a
// switch to blue and white at the top of the menu (globals.css, demo-palette.tsx).
const DEMO_SLUGS: ReadonlySet<string> = new Set(["demo-cafe", "pativ-demo"]);

export const isDemoCafe = (slug: string) => DEMO_SLUGS.has(slug);

export const DEMO_PALETTE_KEY = "pativ-demo-palette";
