// Makes the 4:3 card pictures in public/games/<id>.webp from real frames:
// builds each game with scripts/game-harness.mjs, opens it, plays a few
// seconds, and crops the most telling band of the screen.
//
//   node scripts/game-thumbs.mjs [id...]
//
// Each shot names the viewport it plays in (a phone, or a landscape 4:3 box
// when the whole board has to fit, as for the merge grid), where to cut the
// 4:3 band (`top`, a share of the screen height) and how to keep the game
// lively. `snapMid` takes the picture in the middle of a swipe, so the slice
// trail and the veggies in flight are in it.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";
import { chromium, devices } from "playwright";

const root = resolve(import.meta.dirname, "..");
const out = join(root, ".game-harness");
const phone = { width: 390, height: 664 };
const SHOTS = {
  // The board is square, so a phone crop cuts a row off: play in a landscape
  // box and cut a 4:3 window around the whole board instead.
  merge: {
    view: { width: 520, height: 390 },
    clip: { x: 80, y: 12, width: 360, height: 270 },
    keys: ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown", "ArrowUp", "ArrowLeft"],
    wait: 7000,
  },
  slice: { view: { width: 520, height: 520 }, top: 0.12, swipe: true, snapMid: true, wait: 2600 },
  runner: { view: { width: 560, height: 520 }, top: 0.12, keys: [" ", "", ""], wait: 6500 },
  fighter: { view: phone, top: 0.16, keys: ["ArrowRight", "x", "z"], wait: 3500 },
  platformer: { view: phone, top: 0.2, keys: ["ArrowRight", "ArrowRight", " "], wait: 3000 },
};
const ids = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS);
const executablePath =
  process.env.PW_CHROMIUM_PATH ??
  (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const browser = await chromium.launch({ executablePath });
for (const id of ids) {
  const shot = SHOTS[id];
  execFileSync("node", [join(root, "scripts/game-harness.mjs"), id], { stdio: "ignore" });
  const page = await browser.newPage({ ...devices["iPhone 13"], viewport: shot.view, deviceScaleFactor: 2 });
  await page.goto(`file://${join(out, `${id}.html`)}`);
  const { width: vw, height: vh } = shot.view;
  const h = Math.round((vw * 3) / 4);
  const clip = shot.clip ?? { x: 0, y: Math.min(vh - h, Math.round(vh * shot.top)), width: vw, height: h };
  const end = Date.now() + shot.wait;
  let i = 0;
  let png = null;
  while (Date.now() < end) {
    if (shot.swipe) {
      const y = vh * (0.45 + (i % 3) * 0.08);
      await page.mouse.move(vw * 0.1, y);
      await page.mouse.down();
      await page.mouse.move(vw * 0.9, y - 40, { steps: 5 });
      await page.mouse.up();
    } else if (shot.keys[i % shot.keys.length]) await page.keyboard.press(shot.keys[i % shot.keys.length]);
    i++;
    await page.waitForTimeout(260);
  }
  if (shot.snapMid) {
    // A slow diagonal swipe with the shot taken halfway along it.
    await page.mouse.move(vw * 0.08, vh * 0.75);
    await page.mouse.down();
    await page.mouse.move(vw * 0.5, vh * 0.5, { steps: 6 });
    png = await page.screenshot({ clip });
    await page.mouse.up();
  }
  png ??= await page.screenshot({ clip });
  await sharp(png)
    .resize(480, 360)
    .webp({ quality: 78 })
    .toFile(join(root, "public/games", `${id}.webp`));
  await page.close();
  console.log(id, "ok");
}
await browser.close();
