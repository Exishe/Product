// Builds one waiting-room game (src/features/games/<id>.ts) into a standalone
// page with a fake host, opens it at phone size in Chromium, plays a few
// seconds of random input and saves screenshots. For developing a game
// without placing an order.
//
//   node scripts/game-harness.mjs <id> [outDir]
//
// Prints console errors, the scores the game reported and the file paths.
// The page (outDir/<id>.html) can also be opened by your own Playwright script:
// window.__api.paused = true pauses it, window.__scores lists setScore calls,
// window.__over is the gameOver score (or null).
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "vite";
import { chromium, devices } from "playwright";

const id = process.argv[2];
if (!id) {
  console.error("usage: node scripts/game-harness.mjs <id> [outDir]");
  process.exit(1);
}
const root = resolve(import.meta.dirname, "..");
const out = resolve(process.argv[3] ?? join(root, ".game-harness"));
mkdirSync(out, { recursive: true });

const entry = join(out, `${id}-entry.ts`);
writeFileSync(
  entry,
  `import { game } from ${JSON.stringify(join(root, "src/features/games", `${id}.ts`))};
const canvas = document.getElementById("c") as HTMLCanvasElement;
const w = window as unknown as { __scores: number[]; __over: number | null; __api: { paused: boolean }; __stop: () => void };
w.__scores = []; w.__over = null; w.__api = { paused: false };
w.__stop = game.mount({
  canvas,
  setScore: (s) => { w.__scores.push(s); },
  sfx: () => {},
  gameOver: (s) => { w.__over = s; },
  isPaused: () => w.__api.paused,
  reducedMotion: false,
  locale: "hy",
});
`,
);

await build({
  root: out,
  logLevel: "warn",
  resolve: { alias: { "@": join(root, "src") } },
  build: {
    outDir: out,
    emptyOutDir: false,
    minify: true,
    lib: { entry, formats: ["iife"], name: "game", fileName: () => `${id}.js` },
  },
});

writeFileSync(
  join(out, `${id}.html`),
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;background:#0e1612;overscroll-behavior:none}canvas{display:block;width:100vw;height:100dvh;touch-action:none}</style>
</head><body><canvas id="c"></canvas><script src="${id}.js"></script></body></html>`,
);

// The project's pinned Playwright may not have its own browser here; use the
// preinstalled Chromium when there is one (or PW_CHROMIUM_PATH).
const executablePath = process.env.PW_CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage({ ...devices["iPhone 13"] });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(`file://${join(out, `${id}.html`)}`);
await page.waitForTimeout(600);
await page.screenshot({ path: join(out, `${id}-1.png`) });

const vw = 390;
const vh = 664;
for (let i = 0; i < 25; i++) {
  const x = 40 + Math.random() * (vw - 80);
  const y = 120 + Math.random() * (vh - 200);
  if (i % 3 === 0) {
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + (Math.random() - 0.5) * 240, y + (Math.random() - 0.5) * 240, { steps: 6 });
    await page.mouse.up();
  } else if (i % 3 === 1) {
    await page.touchscreen.tap(x, y);
  } else {
    await page.keyboard.press(["ArrowLeft", "ArrowRight", "ArrowUp", " ", "x"][i % 5]);
  }
  await page.waitForTimeout(120);
}
await page.screenshot({ path: join(out, `${id}-2.png`) });
await page.waitForTimeout(2500);
await page.screenshot({ path: join(out, `${id}-3.png`) });
const result = await page.evaluate(() => ({ scores: window.__scores.slice(-5), over: window.__over }));
await browser.close();

console.log(JSON.stringify({ errors, ...result, files: [1, 2, 3].map((n) => join(out, `${id}-${n}.png`)), page: join(out, `${id}.html`) }, null, 2));
