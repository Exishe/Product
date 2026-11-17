// Makes the 4:3 card pictures in public/games/<id>.webp from real frames:
// builds each game with scripts/game-harness.mjs, opens it at phone size,
// plays a few seconds, and crops the most telling band of the screen.
//
//   node scripts/game-thumbs.mjs [id...]
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { chromium, devices } from "playwright";

const root = resolve(import.meta.dirname, "..");
const out = join(root, ".game-harness");
// Where to cut the 4:3 band (top of the band, as a share of the screen
// height) and which keys keep the game lively while we wait.
const SHOTS = {
  merge: { top: 0.18, keys: ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"], wait: 4000 },
  slice: { top: 0.3, keys: [], swipe: true, wait: 3500 },
  runner: { top: 0.3, keys: [" "], wait: 6500 },
  fighter: { top: 0.16, keys: ["ArrowRight", "x", "z"], wait: 3500 },
  platformer: { top: 0.2, keys: ["ArrowRight", "ArrowRight", " "], wait: 3000 },
};
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
const executablePath = process.env.PW_CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath });
for (const id of ids) {
  const shot = SHOTS[id];
  execFileSync("node", [join(root, "scripts/game-harness.mjs"), id], { stdio: "ignore" });
  const page = await browser.newPage({ ...devices["iPhone 13"], deviceScaleFactor: 2 });
  await page.goto(`file://${join(out, `${id}.html`)}`);
  const end = Date.now() + shot.wait;
  let i = 0;
  while (Date.now() < end) {
    if (shot.swipe) {
      const y = 260 + (i % 3) * 60;
      await page.mouse.move(40, y);
      await page.mouse.down();
      await page.mouse.move(350, y - 40, { steps: 5 });
      await page.mouse.up();
    } else if (shot.keys.length) await page.keyboard.press(shot.keys[i % shot.keys.length]);
    i++;
    await page.waitForTimeout(260);
  }
  const vw = 390;
  const vh = 664;
  const h = Math.round((vw * 3) / 4);
  const png = await page.screenshot({ clip: { x: 0, y: Math.min(vh - h, Math.round(vh * shot.top)), width: vw, height: h } });
  await sharp(png).resize(480, 360).webp({ quality: 78 }).toFile(join(root, "public/games", `${id}.webp`));
  await page.close();
  console.log(id, "ok");
}
await browser.close();
