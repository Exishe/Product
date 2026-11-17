// Waiter Run: an endless side-scrolling runner on a Yerevan street. A waiter
// balances a coffee on a tray, jumps (and double jumps) over café chairs, a
// sleeping cat, flower pots, puddles and crates, slides under awnings, laundry
// lines and hanging signs, and grabs coffee cups on the way. No words on the
// canvas: the host shows title and rules.
//
// Art direction
// - Mood: a warm late afternoon on a pink-tufa Yerevan street under Ararat;
//   cheerful hurry, a waiter who never spills.
// - Camera and scale: side view following the runner at about a quarter of the
//   width, the lane in the lower middle (64% of the height). Design units scale
//   with u = height / 700; the view widens up to 12% as the run speeds up (none
//   with reduced motion). Layered 2.5D: sky, Ararat, hazy city, tufa houses,
//   trees and lamps, pavement in perspective, road, dark foreground posts.
// - Shapes: the waiter round and soft; low obstacles stand on the ground with a
//   wide base (jump them); high ones hang from rods or ropes that leave the top
//   of the screen, with a hard dark underside and a shadow on the ground below
//   (slide under them); the city is arches and soft rectangles.
// - Values: the waiter's white shirt and apricot apron are the brightest shapes,
//   obstacles carry the darkest darks; the background stays in a narrow, light,
//   hazy range that fades with distance.
// - Palette: tufa pink for the world, apricot for the hero and the reward,
//   pomegranate and basalt for threats, tarragon for leaves and signs, sky blue
//   for distance. Light is warm (peach sun, amber lamps and windows), shadows
//   are cool violet-blue.
// - Detail: on the waiter's face and tray, the cups and the obstacle outlines;
//   kept out of the background and from behind the lane.
// - Rules: flat vector fills, no outlines; one light from the upper left, cool
//   shade on right faces and undersides, soft elliptical contact shadows.
// - Signature: the steaming coffee on the tray that tilts with every jump and
//   never falls until the crash, under a warm-lit twin-peaked Ararat.
import { C, clamp, fitCanvas, label, loop, pick, rand, roundRect, type Game, type Size } from "./engine";

type Kind = "chair" | "cat" | "pot" | "puddle" | "crates" | "awning" | "laundry" | "sign";
type Obstacle = { kind: Kind; x: number; w: number; h: number; hi: boolean; seed: number };
type Pickup = { x: number; y: number; ph: number };
type Fly = { tray: boolean; x: number; y: number; vx: number; vy: number; r: number; vr: number };
/** k: 0 dust, 1 sparkle, 2 coffee drop, 3 ring. */
type Part = { x: number; y: number; vx: number; vy: number; t: number; life: number; r: number; k: number; c: string };
type Pop = { x: number; y: number; t: number };
type Mode = "stand" | "run" | "jump" | "slide" | "fall";

// [width, height] in design units; for the hanging kinds the height is the
// clearance underneath, which a sliding waiter fits under and a standing one doesn't.
const SIZE: Record<Kind, [number, number]> = {
  chair: [34, 56],
  cat: [48, 30],
  pot: [30, 44],
  puddle: [66, 8],
  crates: [46, 138],
  awning: [100, 52],
  laundry: [124, 52],
  sign: [56, 52],
};
const HANGING: Kind[] = ["awning", "laundry", "sign"];
// Hand-made chunks: [seconds of running before it may appear, kinds with the
// gap in seconds of running between them]. Gaps scale with speed, so every
// chunk stays passable as the run speeds up.
const CHUNKS: [number, string][] = [
  [0, "chair"],
  [0, "pot"],
  [0, "cat"],
  [0, "awning"],
  [0, "sign"],
  [4, "puddle"],
  [4, "laundry"],
  [10, "pot .85 chair"],
  [12, "awning .9 cat"],
  [14, "chair .9 sign"],
  [18, "crates"],
  [22, "laundry .85 puddle"],
  [28, "cat .8 pot .85 chair"],
  [32, "sign .8 awning"],
  [36, "pot .9 crates"],
  [42, "awning .8 chair .9 laundry"],
];
const SAFE = 4.5; // no obstacle spawns before this; the first one arrives after ~5.5 s

const BODY = [C.tufa, "#e3a283", "#cf8260"];
const WINDOW = "#6b3b2b";
const LIT = "#f7c77e";
const SILL = "#f0c6a8";
const WOOD = "#c08a55";
const WOOD_DARK = "#7d5532";
const SKIN = "#f3c9a5";
const SHADE = "rgba(52,40,110,0.2)"; // cool shadow
const DARK = "#3e3850";
const DUST = "#eadccb";
const COFFEE = "#6f4327";

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const mod = (a: number, b: number) => ((a % b) + b) % b;
const TAU = Math.PI * 2;

export const game: Game = {
  mount(api) {
    // Layout, recomputed on resize. u scales every size; the lane sits at 64% height.
    let W = 1;
    let H = 1;
    let u = 1;
    let gy = 0; // y of the hero's feet
    let py = 0; // back edge of the pavement
    let xh = 0; // hero x
    const onResize = (s: Size) => {
      W = s.w;
      H = s.h;
      u = clamp(H / 700, 0.7, 1.3);
      gy = Math.round(H * 0.64);
      py = gy - 22 * u;
      xh = clamp(W * 0.24, 70 * u, 230 * u);
    };
    const { ctx, stop: stopFit } = fitCanvas(api.canvas, onResize);

    let state: "ready" | "run" | "fall" | "over" = "ready";
    let clock = 0;
    let t = 0; // seconds of running
    let speed = 0;
    let z = 1; // view scale: below 1 the view widens
    let VW = 1; // visible width in world units
    let scroll = 0;
    let dist = 0;
    let got = 0;
    let score = -1;
    let hy = 0; // hero height above the pavement
    let vy = 0; // upwards
    let jumps = 0;
    let buf = 0; // a jump pressed just before landing
    let slideBuf = 0; // a slide asked for in the air
    let slide = 0; // seconds of slide left
    let slides = 0;
    let sq = 0; // squash (<0) and stretch (>0)
    let sqv = 0;
    let phase = 0;
    let step = false;
    let until = 0;
    let queue: string[] = [];
    let lastChunk = "";
    let fallT = 0;
    let dir = 1; // fall forwards (tripped) or backwards (head first into something)
    let lost = false;
    let shake = 0;
    let flash = 0;
    const obs: Obstacle[] = [];
    let pickups: Pickup[] = [];
    let fly: Fly[] = [];
    let parts: Part[] = [];
    let pops: Pop[] = [];

    const calc = () => Math.floor(dist / (10 * u)) + got * 10;

    const puff = (x: number, y: number, n: number, k = 0, c = DUST, sp = 60) => {
      for (let i = 0; i < n && parts.length < 160; i++) {
        const a = k === 0 ? rand(Math.PI, TAU) : rand(0, TAU);
        const v = rand(0.4, 1) * sp * u;
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: rand(0.35, 0.6), r: rand(3, 6) * u, k, c });
      }
    };

    // --- Rules ---------------------------------------------------------------

    const jump = (double: boolean) => {
      vy = (double ? 760 : 800) * u;
      jumps = double ? 2 : 1;
      slide = 0;
      sq = 0.22;
      sqv = 0;
      api.sfx(double ? "boing" : "jump");
      if (double) parts.push({ x: xh, y: gy - hy, vx: 0, vy: 0, t: 0, life: 0.3, r: 8 * u, k: 3, c: "#ffffff" });
      else puff(xh, gy, 4);
    };

    const startSlide = () => {
      vy = 0;
      jumps = 0;
      buf = 0;
      slideBuf = 0;
      if (slide <= 0) {
        api.sfx("slip");
        sq = -0.12;
      }
      slide = 0.6;
      slides++;
    };

    const begin = () => {
      state = "run";
      for (let k = 0; k < 5; k++) pickups.push({ x: VW * 0.75 + k * 40 * u, y: 24 * u, ph: k });
    };

    const tapJump = () => {
      if (api.isPaused()) return;
      if (state === "ready") return begin();
      if (state !== "run") return;
      if (hy <= 0) jump(false);
      else if (jumps < 2) jump(true);
      else buf = 0.12; // a tap just before landing still jumps
    };

    const tapSlide = () => {
      if (api.isPaused()) return;
      if (state === "ready") return begin();
      if (state !== "run") return;
      if (hy <= 0) startSlide();
      else {
        // In the air: drop fast and slide on landing.
        vy = Math.min(vy, -1700 * u);
        slideBuf = 0.3;
        buf = 0;
      }
    };

    const spawn = () => {
      if (!queue.length) {
        const ok = CHUNKS.filter((c) => c[0] <= t && c[1] !== lastChunk);
        lastChunk = pick(ok)[1];
        queue = lastChunk.split(" ");
      }
      const kind = queue.shift() as Kind;
      const gapS = queue.length ? Number(queue.shift()) : rand(1.05, 1.5) - 0.3 * clamp(t / 120, 0, 1);
      const [bw, bh] = SIZE[kind];
      const hi = HANGING.includes(kind);
      const w = bw * u;
      const o: Obstacle = { kind, x: VW + 40 * u, w, h: bh * u, hi, seed: Math.random() };
      obs.push(o);
      const gap = speed * gapS;
      until = w + gap;
      // Cups along the risky line: over a jump, under a slide.
      const r = Math.random();
      if (r < 0.6) {
        for (const k of [-1, 0, 1]) {
          const y = hi ? 22 : kind === "crates" ? 175 : bh + 40 + (k ? 0 : 24);
          pickups.push({ x: o.x + w / 2 + k * (hi ? 30 : 42) * u, y: y * u, ph: rand(0, 6) });
        }
      } else if (r < 0.85 && !queue.length) {
        for (let k = 0; k < 3; k++) pickups.push({ x: o.x + w + gap * 0.5 + (k - 1) * 34 * u, y: 24 * u, ph: k });
      }
    };

    const hits = () => {
      const l = xh - 11 * u;
      const r = xh + 11 * u;
      const top = hy + (slide > 0 ? 32 : 68) * u;
      for (const o of obs) {
        if (r <= o.x + 5 * u || l >= o.x + o.w - 5 * u) continue;
        if (o.hi ? top > o.h + 4 * u : hy + 3 * u < (o.kind === "puddle" ? o.h * 0.7 : o.h - 5 * u)) return o;
      }
      return null;
    };

    const crash = (o: Obstacle) => {
      state = "fall";
      fallT = 0;
      dir = o.hi ? -1 : 1;
      slide = 0;
      shake = api.reducedMotion ? 0 : 0.3;
      flash = 0.18;
      vy = 480 * u;
      jumps = 2;
      api.sfx("hit");
      // A head-first knock says "ouch!", a trip goes "whoa".
      api.sfx(o.hi ? "ouch" : "whoa");
      const x = xh + 14 * u;
      const y = gy - hy - 84 * u;
      fly = [
        { tray: true, x, y, vx: 130 * u * dir, vy: -640 * u, r: 0, vr: 7 * dir },
        { tray: false, x, y: y - 8 * u, vx: 210 * u * dir, vy: -780 * u, r: 0, vr: -9 * dir },
      ];
      puff(x, y, 12, 2, COFFEE, 260);
      puff(xh, gy, 8);
    };

    const update = (dt: number) => {
      clock += dt;
      flash = Math.max(0, flash - dt);
      sqv += (-sq * 320 - sqv * 16) * dt;
      sq += sqv * dt;
      const g = 2600 * u;
      let dx = 0;
      if (state === "run" || state === "fall") {
        if (state === "run") {
          t += dt;
          const k = clamp(t / 120, 0, 1);
          speed = (260 + 200 * k) * u;
          z = 1 - (api.reducedMotion ? 0 : 0.12) * k;
        } else {
          speed *= Math.exp(-5 * dt);
          fallT += dt;
          shake = Math.max(0, shake - dt);
          if (fallT > 0.45 && !lost) {
            lost = true;
            api.sfx("lose");
          }
        }
        VW = W / z;
        dx = speed * dt;
        scroll += dx;
        if (state === "run") dist += dx;
        phase += (dx / (120 * u)) * TAU;

        // Hero physics.
        const wasAir = hy > 0;
        const fallV = vy;
        vy -= g * dt;
        hy += vy * dt;
        buf = Math.max(0, buf - dt);
        slideBuf = Math.max(0, slideBuf - dt);
        slide = Math.max(0, slide - dt);
        if (hy <= 0) {
          hy = 0;
          vy = 0;
          jumps = 0;
          if (wasAir) {
            if (fallV < -300 * u) {
              sq = -0.28;
              sqv = 0;
              puff(xh, gy, 7, 0, DUST, 90);
              if (state === "run") api.sfx("land");
            }
            if (state === "run") {
              if (slideBuf > 0) startSlide();
              else if (buf > 0) jump(false);
            }
          }
          if (state === "run") {
            // Footstep dust in time with the stride, a spray while sliding.
            const s = Math.sin(phase) >= 0;
            if (slide > 0) {
              if (Math.random() < 0.5) puff(xh + 22 * u, gy, 1, 0, DUST, 120);
            } else if (s !== step) puff(xh - 4 * u, gy, 2, 0, DUST, 40);
            step = s;
          }
        }

        for (const o of obs) o.x -= dx;
        for (const p of pickups) p.x -= dx;
        while (obs.length && obs[0]!.x + obs[0]!.w < -40 * u) obs.shift();
        pickups = pickups.filter((p) => p.x > -40);
      } else VW = W / z;

      if (state === "run") {
        until -= dx;
        if (t > SAFE && until <= 0) spawn();
        const cy = gy - hy - (slide > 0 ? 16 : 36) * u;
        for (const p of pickups) {
          if (Math.hypot(p.x - xh, gy - p.y - cy) < 30 * u) {
            got++;
            const y = gy - p.y;
            pops.push({ x: p.x, y, t: 0 });
            puff(p.x, y, 8, 1, C.apricot, 150);
            parts.push({ x: p.x, y, vx: 0, vy: 0, t: 0, life: 0.35, r: 10 * u, k: 3, c: "#fff3d6" });
            api.sfx("coin");
            // Every tenth cup the waiter is pleased with himself.
            if (got % 10 === 0) api.sfx("mmm");
            p.y = -1; // collected
          }
        }
        pickups = pickups.filter((p) => p.y >= 0);
        const o = hits();
        if (o) crash(o);
        const sc = calc();
        if (sc !== score) {
          score = sc;
          api.setScore(sc);
        }
      } else if (state === "fall") {
        for (const f of fly) {
          f.vy += g * dt;
          f.x += f.vx * dt - dx;
          f.y += f.vy * dt;
          f.r += f.vr * dt;
          if (f.y > gy) {
            f.y = gy;
            f.vy *= -0.35;
            f.vx *= 0.7;
            f.vr *= 0.6;
          }
        }
        if (fallT > 1.2) {
          state = "over";
          api.gameOver(calc());
        }
      }
      for (const p of parts) {
        p.t += dt;
        p.x += p.vx * dt - dx;
        p.y += p.vy * dt;
        if (p.k === 2) {
          p.vy += g * 0.6 * dt;
          if (p.y > gy) p.vx = p.vy = 0;
        } else {
          p.vx *= 0.94;
          p.vy *= 0.94;
        }
      }
      parts = parts.filter((p) => p.t < p.life);
      for (const p of pops) p.t += dt;
      pops = pops.filter((p) => p.t < 0.7);
    };

    // --- Drawing: shared shapes ---------------------------------------------

    const blob = (x: number, y: number, rx: number, ry: number, col: string) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
      ctx.fill();
    };

    // Four-point sparkle star.
    const star = (x: number, y: number, r: number) => {
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.quadraticCurveTo(x, y, x, y + r);
      ctx.quadraticCurveTo(x, y, x - r, y);
      ctx.quadraticCurveTo(x, y, x, y - r);
      ctx.fill();
    };

    const trayShape = () => {
      ctx.fillStyle = "#dfe5e8";
      roundRect(ctx, -18, -2, 36, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = "#9aa6b8";
      roundRect(ctx, -18, 1, 36, 2.5, 1.2);
      ctx.fill();
    };

    // A coffee cup on a saucer, bottom at 0. With `flat`, one colour (signs, HUD).
    const cupShape = (flat?: string) => {
      blob(0, -2, 8, 2.2, flat ?? "#e7e9ef");
      ctx.fillStyle = flat ?? C.matsoni;
      roundRect(ctx, -5.5, -11, 11, 9, 3.5);
      ctx.fill();
      ctx.strokeStyle = flat ?? C.matsoni;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(6, -7, 2.6, -1.2, 1.2);
      ctx.stroke();
      if (!flat) {
        ctx.fillStyle = SHADE;
        roundRect(ctx, 1.5, -11, 4, 9, 2);
        ctx.fill();
        blob(0, -10.5, 4.4, 1.5, COFFEE);
      }
    };

    const steam = (a: number) => {
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.lineWidth = 1.6;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (const k of [-2, 2]) {
        const w = Math.sin(clock * 5 + k) * 1.5;
        ctx.moveTo(k, -14);
        ctx.bezierCurveTo(k + 3 + w, -17, k - 3 - w, -20, k + w, -24);
      }
      ctx.stroke();
    };

    // --- Drawing: the street --------------------------------------------------

    const sky = (top: number, bot: number) => {
      const g = ctx.createLinearGradient(0, top, 0, py);
      g.addColorStop(0, "#8ec2e2");
      g.addColorStop(0.55, "#cfe6f2");
      g.addColorStop(1, "#fbe1c6");
      ctx.fillStyle = g;
      ctx.fillRect(-20, top - 20, VW + 40, bot - top + 40);
      // Low warm sun, upper left: the light every shade in the scene answers to.
      const sx = VW * 0.16;
      const sy = H * 0.2;
      const R = 230 * u;
      const r = ctx.createRadialGradient(sx, sy, 0, sx, sy, R);
      r.addColorStop(0, "rgba(255,240,205,0.95)");
      r.addColorStop(0.1, "rgba(255,226,175,0.6)");
      r.addColorStop(1, "rgba(255,214,160,0)");
      ctx.fillStyle = r;
      ctx.fillRect(sx - R, sy - R, R * 2, R * 2);
      for (let i = 0; i < 4; i++) {
        const span = VW + 300;
        const x = mod(hash(i + 1) * span - clock * (5 + i * 2), span) - 150;
        const y = H * (0.07 + hash(i + 7) * 0.14);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(u, u);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        roundRect(ctx, 0, 10, 96, 22, 11);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(30, 12, 14, 0, TAU);
        ctx.arc(54, 8, 18, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
    };

    // Snow cap: a jagged lower edge `d` below the peak, `hw` wide each side.
    const snow = (px: number, top: number, d: number, hw: number) => {
      ctx.beginPath();
      ctx.moveTo(px - hw * 1.3, top - 8);
      ctx.lineTo(px + hw * 1.3, top - 8);
      for (const [fx, fy] of [[1.3, 1], [0.6, 0.55], [0.3, 1], [0, 0.6], [-0.35, 1.05], [-0.7, 0.55], [-1.3, 1]] as const) {
        ctx.lineTo(px + fx * hw, top + fy * d);
      }
      ctx.closePath();
      ctx.fill();
    };

    // Ararat's twin peaks, tiled so they loop: sunlit left faces, cool right ones.
    const mountains = (pf: number) => {
      const P = Math.max(W * 1.3, 900 * u);
      const mh = H * 0.36;
      const base = py - 150 * u;
      const ridge = [
        [0, 0.05], [0.1, 0.3], [0.19, 0.7], [0.25, 1], [0.31, 0.62], [0.34, 0.45], [0.4, 0.72],
        [0.46, 0.42], [0.55, 0.3], [0.7, 0.22], [0.85, 0.12], [1, 0.05],
      ] as const;
      const off = mod(scroll * 0.03 * pf, P);
      for (let k = 0; k * P - off < VW; k++) {
        const x0 = k * P - off;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x0, base + 60);
        for (const [fx, fh] of ridge) ctx.lineTo(x0 + fx * P, base - fh * mh);
        ctx.lineTo(x0 + P, base + 60);
        ctx.closePath();
        ctx.fillStyle = "#c2d2e6";
        ctx.fill();
        ctx.clip();
        ctx.fillStyle = "#fff7ee";
        snow(x0 + 0.25 * P, base - mh, 0.25 * mh, 0.05 * P);
        snow(x0 + 0.4 * P, base - 0.72 * mh, 0.18 * mh, 0.04 * P);
        ctx.fillStyle = "rgba(70,72,140,0.17)";
        for (const [fx, fh, s] of [[0.25, 1, 0.3], [0.4, 0.72, 0.28]] as const) {
          ctx.beginPath();
          ctx.moveTo(x0 + fx * P, base - fh * mh);
          ctx.lineTo(x0 + (fx + 0.02) * P, base + 60);
          ctx.lineTo(x0 + (fx + s) * P, base + 60);
          ctx.fill();
        }
        ctx.restore();
      }
    };

    // A hazy far city that peeks over the lower houses.
    const city = (pf: number) => {
      const cell = 44 * u;
      const off = scroll * 0.1 * pf;
      for (let i = Math.floor(off / cell); i * cell - off < VW; i++) {
        const h = (50 + hash(i + 77) * 120) * u;
        const x = i * cell - off;
        ctx.fillStyle = hash(i + 5) > 0.5 ? "#d9c3cc" : "#cfbac8";
        ctx.fillRect(x, py - 60 * u - h, cell - 5 * u, h + 60 * u);
      }
    };

    // Tufa-stone buildings with arched windows, balconies and café fronts.
    const buildings = (pf: number) => {
      const cell = 168 * u;
      const off = scroll * 0.22 * pf;
      for (let i = Math.floor(off / cell); i * cell - off < VW; i++) {
        const bh = 150 + hash(i) * 150;
        const top = -bh;
        ctx.save();
        ctx.translate(i * cell - off, py);
        ctx.scale(u, u);
        ctx.fillStyle = BODY[Math.floor(hash(i + 9) * 3)]!;
        ctx.fillRect(0, top, 169, bh);
        ctx.fillStyle = "rgba(255,226,190,0.18)";
        ctx.fillRect(0, top, 14, bh);
        ctx.fillStyle = SHADE;
        ctx.fillRect(155, top, 14, bh);
        ctx.fillRect(0, top + 2, 169, 6);
        ctx.fillStyle = C.tufaDark;
        ctx.fillRect(-2, top - 6, 173, 8);
        ctx.fillStyle = "#9a5d48";
        ctx.fillRect(0, -10, 169, 10);
        const rows = Math.floor((bh - 64) / 50);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < 3; c++) {
            const wx = 20 + c * 55;
            const wy = top + 20 + r * 50;
            const h = hash(i * 31 + r * 7 + c);
            ctx.beginPath();
            ctx.moveTo(wx, wy + 32);
            ctx.lineTo(wx, wy + 11);
            ctx.arc(wx + 11, wy + 11, 11, Math.PI, 0);
            ctx.lineTo(wx + 22, wy + 32);
            ctx.closePath();
            ctx.fillStyle = h < 0.2 ? LIT : WINDOW;
            ctx.fill();
            ctx.strokeStyle = SILL;
            ctx.lineWidth = 2.5;
            ctx.stroke();
            if (h > 0.7) {
              ctx.fillStyle = C.basalt3;
              ctx.fillRect(wx - 5, wy + 31, 32, 3);
              ctx.strokeStyle = C.basalt3;
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              for (let k = 0; k < 5; k++) {
                ctx.moveTo(wx - 3 + k * 7, wy + 31);
                ctx.lineTo(wx - 3 + k * 7, wy + 22);
              }
              ctx.stroke();
            }
          }
        }
        ctx.beginPath();
        ctx.moveTo(62, 0);
        ctx.lineTo(62, -28);
        ctx.arc(77, -28, 15, Math.PI, 0);
        ctx.lineTo(92, 0);
        ctx.fillStyle = hash(i + 2) > 0.5 ? "#7a4632" : "#4e2a1f";
        ctx.fill();
        if (hash(i + 4) > 0.45) {
          for (let k = 0; k < 5; k++) {
            ctx.fillStyle = k % 2 ? C.matsoni : C.apricot;
            ctx.fillRect(44 + k * 13.2, -54, 13.2, 12);
            ctx.beginPath();
            ctx.arc(50.6 + k * 13.2, -42, 6.6, 0, Math.PI);
            ctx.fill();
          }
        }
        ctx.restore();
      }
      // Aerial haze: the far street fades into the sky.
      const haze = ctx.createLinearGradient(0, py - 330 * u, 0, py);
      haze.addColorStop(0, "rgba(214,226,240,0)");
      haze.addColorStop(1, "rgba(236,226,232,0.38)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, py - 330 * u, VW, 330 * u);
    };

    // Trees and street lamps along the back kerb.
    const trees = (pf: number) => {
      const cell = 230 * u;
      const off = scroll * 0.7 * pf;
      for (let i = Math.floor(off / cell) - 1; i * cell - off < VW + 60 * u; i++) {
        const h = hash(i + 50);
        if (h > 0.7) continue;
        ctx.save();
        ctx.translate(i * cell - off + hash(i + 3) * 60 * u, py + 3 * u);
        ctx.scale(u, u);
        blob(6, 0, 30, 4, SHADE);
        if (h < 0.4) {
          ctx.fillStyle = "#6b4a35";
          ctx.fillRect(-4, -72, 8, 72);
          for (const [cx, cy, r] of [[0, -102, 34], [-22, -82, 26], [22, -84, 26]] as const) blob(cx, cy, r, r, "#1d5a3e");
          for (const [cx, cy, r] of [[-6, -108, 26], [-24, -86, 17], [14, -96, 18]] as const) blob(cx, cy, r, r, C.tarragon);
          blob(-12, -116, 12, 12, "#3f9a62");
        } else {
          ctx.fillStyle = C.basalt3;
          ctx.fillRect(-2.5, -140, 5, 140);
          ctx.fillRect(-7, -6, 14, 6);
          ctx.strokeStyle = C.basalt3;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(0, -138);
          ctx.quadraticCurveTo(0, -152, 16, -150);
          ctx.stroke();
          const r = ctx.createRadialGradient(16, -142, 0, 16, -142, 34);
          r.addColorStop(0, "rgba(255,200,110,0.6)");
          r.addColorStop(1, "rgba(255,200,110,0)");
          ctx.fillStyle = r;
          ctx.fillRect(-18, -176, 68, 68);
          ctx.fillStyle = "#ffd28a";
          roundRect(ctx, 10, -150, 12, 14, 5);
          ctx.fill();
        }
        ctx.restore();
      }
    };

    // Pavement in perspective, a kerb, the road and its dashes.
    const street = (bot: number) => {
      const front = gy + 46 * u;
      const g = ctx.createLinearGradient(0, py, 0, front);
      g.addColorStop(0, "#efe1d2");
      g.addColorStop(1, "#d3c8c8");
      ctx.fillStyle = g;
      ctx.fillRect(-20, py, VW + 40, front - py);
      ctx.fillStyle = "#c4ab9b";
      ctx.fillRect(-20, py - 4 * u, VW + 40, 4 * u);
      const cw = 58 * u;
      const vp = VW * 0.5;
      ctx.strokeStyle = "rgba(120,96,120,0.2)";
      ctx.lineWidth = 1.5 * u;
      ctx.beginPath();
      for (let x = -mod(scroll, cw) - cw; x < VW + cw * 2; x += cw) {
        ctx.moveTo(x, py);
        ctx.lineTo(x + (x - vp) * 0.32, front);
      }
      ctx.moveTo(-20, py + 26 * u);
      ctx.lineTo(VW + 20, py + 26 * u);
      ctx.stroke();
      ctx.fillStyle = "#f5ede3";
      ctx.fillRect(-20, front, VW + 40, 5 * u);
      ctx.fillStyle = "#a597a3";
      ctx.fillRect(-20, front + 5 * u, VW + 40, 9 * u);
      const rg = ctx.createLinearGradient(0, front + 14 * u, 0, bot);
      rg.addColorStop(0, "#8f8a9f");
      rg.addColorStop(1, "#6c6781");
      ctx.fillStyle = rg;
      ctx.fillRect(-20, front + 14 * u, VW + 40, bot - front);
      const dw = 120 * u;
      const ly = front + 14 * u + (bot - front) * 0.42;
      ctx.fillStyle = "rgba(246,240,232,0.55)";
      for (let x = -mod(scroll * 1.25, dw); x < VW; x += dw) ctx.fillRect(x, ly, dw * 0.45, 5 * u);
    };

    // Dark foreground bollards and chains, the fastest layer.
    const foreground = (bot: number, pf: number) => {
      const cell = 150 * u;
      const off = scroll * 1.45 * pf;
      ctx.strokeStyle = "#2f2a40";
      ctx.lineWidth = 3 * u;
      for (let i = Math.floor(off / cell) - 1; i * cell - off < VW + cell; i++) {
        const x = i * cell - off;
        ctx.beginPath();
        ctx.moveTo(x, bot - 46 * u);
        ctx.quadraticCurveTo(x + cell / 2, bot - 10 * u, x + cell, bot - 46 * u);
        ctx.stroke();
        ctx.fillStyle = "#2f2a40";
        roundRect(ctx, x - 9 * u, bot - 60 * u, 18 * u, 70 * u, 8 * u);
        ctx.fill();
        ctx.fillStyle = "#5b5272";
        roundRect(ctx, x - 6 * u, bot - 57 * u, 5 * u, 50 * u, 3 * u);
        ctx.fill();
      }
    };

    // --- Drawing: obstacles ---------------------------------------------------

    const hanger = (x: number, y: number) => {
      ctx.moveTo(x, y);
      ctx.lineTo(x, -3000);
    };

    const drawObstacle = (o: Obstacle) => {
      ctx.save();
      ctx.translate(o.x, gy);
      ctx.scale(u, u);
      const w = o.w / u;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const sw = Math.sin(clock * 2.4 + o.seed * 6);
      if (o.hi) blob(w / 2 + 6, 3, w / 2 + 4, 6, "rgba(52,40,110,0.3)");
      else if (o.kind !== "puddle") blob(w / 2 + 3, 1, w / 2 + 4, 4.5, "rgba(52,40,110,0.24)");
      if (o.kind === "chair") {
        ctx.strokeStyle = "#5b3a29";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(6, -26);
        ctx.lineTo(4, 0);
        ctx.moveTo(28, -26);
        ctx.lineTo(31, 0);
        ctx.moveTo(31, -26);
        ctx.lineTo(31, -56);
        ctx.stroke();
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(25, -45, 7, 9, 0, 0, TAU);
        ctx.moveTo(8, -12);
        ctx.lineTo(29, -12);
        ctx.stroke();
        ctx.fillStyle = C.apricot;
        roundRect(ctx, 2, -31, 29, 6, 3);
        ctx.fill();
        ctx.fillStyle = C.apricotDeep;
        roundRect(ctx, 2, -27.5, 29, 2.5, 1.2);
        ctx.fill();
      } else if (o.kind === "pot") {
        ctx.strokeStyle = "#3f8a5c";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(15, -26);
        ctx.lineTo(15, -42);
        ctx.moveTo(15, -32);
        ctx.lineTo(8, -39);
        ctx.moveTo(15, -32);
        ctx.lineTo(23, -40);
        ctx.stroke();
        for (const [fx, fy, col] of [[8, -41, C.pomegranate], [23, -42, C.apricot], [15, -46, C.matsoni]] as const) blob(fx, fy, 5, 5, col);
        ctx.fillStyle = C.tufaDark;
        ctx.beginPath();
        ctx.moveTo(5, -26);
        ctx.lineTo(25, -26);
        ctx.lineTo(22, 0);
        ctx.lineTo(8, 0);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = SHADE;
        ctx.fillRect(16, -26, 8, 26);
        ctx.fillStyle = C.apricotDeep;
        roundRect(ctx, 3, -30, 24, 6, 2);
        ctx.fill();
      } else if (o.kind === "cat") {
        // A sleeping cat loaf, tail wrapped round, little z's rising.
        ctx.strokeStyle = DARK;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(6, -6);
        ctx.quadraticCurveTo(-4, -2, 8, -1.5);
        ctx.lineTo(28, -1.5);
        ctx.stroke();
        blob(22, -12, 21, 12, DARK);
        blob(17, -19, 12, 4, "#5f5876");
        ctx.fillStyle = DARK;
        ctx.beginPath();
        ctx.arc(38, -17, 9.5, 0, TAU);
        ctx.moveTo(31, -22);
        ctx.lineTo(33, -32);
        ctx.lineTo(38, -25);
        ctx.moveTo(40, -25);
        ctx.lineTo(46, -31);
        ctx.lineTo(46.5, -20);
        ctx.fill();
        blob(38, -3, 6, 3, C.matsoni);
        ctx.strokeStyle = "#cfc6de";
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.arc(41, -18, 2.5, 0.3, Math.PI - 0.3);
        ctx.stroke();
        ctx.strokeStyle = DARK;
        ctx.lineWidth = 1.6;
        for (let k = 0; k < 2; k++) {
          const f = (clock * 0.6 + k * 0.5 + o.seed) % 1;
          const s = 2.5 + f * 2.5;
          const zx = 46 + f * 10;
          const zy = -34 - f * 22;
          ctx.globalAlpha = 1 - f;
          ctx.beginPath();
          ctx.moveTo(zx - s, zy - s);
          ctx.lineTo(zx + s, zy - s);
          ctx.lineTo(zx - s, zy + s);
          ctx.lineTo(zx + s, zy + s);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (o.kind === "puddle") {
        blob(33, 3, 33, 6, "rgba(130,176,214,0.9)");
        blob(24, 2, 12, 2, "rgba(255,240,226,0.85)");
      } else if (o.kind === "crates") {
        for (let j = 0; j < 3; j++) {
          const x = j === 0 ? 0 : (hash(o.seed * 90 + j) - 0.5) * 6;
          const y = -(j + 1) * 46;
          ctx.fillStyle = WOOD;
          ctx.fillRect(x, y, 46, 46);
          ctx.fillStyle = SHADE;
          ctx.fillRect(x + 34, y, 12, 46);
          ctx.strokeStyle = WOOD_DARK;
          ctx.lineWidth = 3;
          ctx.strokeRect(x + 1.5, y + 1.5, 43, 43);
          ctx.beginPath();
          ctx.moveTo(x + 4, y + 4);
          ctx.lineTo(x + 42, y + 42);
          ctx.moveTo(x + 42, y + 4);
          ctx.lineTo(x + 4, y + 42);
          ctx.stroke();
        }
      } else if (o.kind === "awning") {
        // A striped café canopy hung on rods from above: its scalloped edge is the line to duck under.
        ctx.strokeStyle = C.basalt3;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        hanger(10, -94);
        hanger(90, -94);
        ctx.stroke();
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = i % 2 ? "#fbefe9" : C.pomegranate;
          ctx.beginPath();
          ctx.moveTo(i * 20 + 2, -92);
          ctx.lineTo(i * 20 + 22, -92);
          ctx.lineTo(i * 21 + 21, -64);
          ctx.lineTo(i * 21 - 1, -64);
          ctx.arc(i * 21 + 10, -64, 11, Math.PI, 0, true);
          ctx.fill();
        }
        ctx.fillStyle = "rgba(255,236,214,0.45)";
        ctx.fillRect(2, -92, 100, 4);
        ctx.fillStyle = "rgba(40,24,60,0.32)";
        ctx.fillRect(-1, -66, 106, 3);
        ctx.fillStyle = C.basalt3;
        roundRect(ctx, -2, -97, 106, 6, 3);
        ctx.fill();
      } else if (o.kind === "laundry") {
        // A sagging line between two balconies, clothes down to the clearance.
        ctx.strokeStyle = "#e9e3dc";
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-300, -1100);
        ctx.lineTo(0, -132);
        ctx.quadraticCurveTo(62, -72, 124, -132);
        ctx.lineTo(424, -1100);
        ctx.stroke();
        const ry = (x: number) => {
          const f = x / 124;
          return -132 + 2 * f * (1 - f) * 60;
        };
        const items: [number, string, number, number][] = [
          [10, C.apricot, 22, 28],
          [38, C.tarragon, 20, 0],
          [66, C.pomegranate, 18, 0],
          [92, "#7fa8d8", 22, 30],
          [114, C.matsoni, 9, 18],
        ];
        for (const [x, col, cw, lh] of items) {
          const top = ry(x + cw / 2);
          const len = lh || -52 - top;
          ctx.save();
          ctx.translate(x + cw / 2, top);
          ctx.rotate(sw * 0.06 * (1 + (x % 3)));
          ctx.fillStyle = col;
          if (lh === 28 || lh === 30) {
            // A shirt: body and sleeves.
            ctx.fillRect(-cw / 2, 0, cw, len);
            ctx.beginPath();
            ctx.moveTo(-cw / 2, 0);
            ctx.lineTo(-cw / 2 - 7, 9);
            ctx.lineTo(-cw / 2, 12);
            ctx.moveTo(cw / 2, 0);
            ctx.lineTo(cw / 2 + 7, 9);
            ctx.lineTo(cw / 2, 12);
            ctx.fill();
          } else if (col === C.tarragon) {
            // Trousers: two legs.
            ctx.fillRect(-cw / 2, 0, cw, 10);
            ctx.fillRect(-cw / 2, 0, cw / 2 - 1.5, len);
            ctx.fillRect(1.5, 0, cw / 2 - 1.5, len);
          } else {
            roundRect(ctx, -cw / 2, 0, cw, len, 2);
            ctx.fill();
          }
          ctx.fillStyle = SHADE;
          ctx.fillRect(cw / 2 - 5, 0, 5, len);
          ctx.fillStyle = WOOD_DARK;
          ctx.fillRect(-2, -3, 4, 6);
          ctx.restore();
        }
      } else {
        // A hanging café sign on an iron bracket.
        ctx.strokeStyle = C.basalt3;
        ctx.lineWidth = 3;
        ctx.beginPath();
        hanger(28, -120);
        ctx.moveTo(-8, -120);
        ctx.lineTo(64, -120);
        ctx.stroke();
        ctx.save();
        ctx.translate(28, -120);
        ctx.rotate(sw * 0.05);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-18, 0);
        ctx.lineTo(-18, 24);
        ctx.moveTo(18, 0);
        ctx.lineTo(18, 24);
        ctx.stroke();
        ctx.fillStyle = C.tarragon;
        roundRect(ctx, -28, 24, 56, 44, 8);
        ctx.fill();
        ctx.fillStyle = "rgba(14,22,18,0.3)";
        roundRect(ctx, -28, 60, 56, 8, 4);
        ctx.fill();
        ctx.strokeStyle = "rgba(251,252,248,0.5)";
        roundRect(ctx, -24, 28, 48, 36, 6);
        ctx.stroke();
        ctx.translate(-2, 56);
        ctx.scale(1.4, 1.4);
        cupShape(C.matsoni);
        ctx.restore();
      }
      ctx.restore();
    };

    // --- Drawing: the waiter --------------------------------------------------

    const drawWaiter = (mode: Mode, rot: number) => {
      const run = mode === "run";
      const sl = mode === "slide";
      const s = Math.sin(phase);
      const cs = Math.cos(phase);
      const bob = run ? -Math.abs(s) * 2.5 : mode === "stand" ? Math.sin(clock * 3) * 0.8 : 0;
      const hip = sl ? -11 : -26 + bob;
      ctx.save();
      ctx.translate(xh, gy - hy - (12 * u * Math.abs(rot)) / 1.45);
      ctx.rotate(rot);
      ctx.scale(u * (1 - sq * 0.5), u * (1 + sq));
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const leg = (fx: number, fy: number, col: string) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(0, hip);
        ctx.quadraticCurveTo(fx / 2 + 5, (hip + fy) / 2, fx, fy);
        ctx.stroke();
        blob(fx + 3, fy + 1, 7, 4, C.ink);
      };
      const arm = (hx: number, hyy: number, col: string, front = false) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(front ? 7 : -5, hip - 22);
        ctx.lineTo(hx, hyy);
        ctx.stroke();
        blob(hx, hyy, 3.8, 3.8, SKIN);
      };
      const back = "#1d212b";
      const fore = "#2b2f3a";
      // Leg end points per pose: [back x, back y, front x, front y].
      const L = run
        ? [-s * 13, -3 - Math.max(0, -cs) * 9, s * 13, -3 - Math.max(0, cs) * 9]
        : { jump: [-10, -5, 11, -13], slide: [18, -4, 28, -3], fall: [-8, -4, 8, -5], stand: [-5, -2, 5, -2] }[mode as "jump"]!;
      leg(L[0]!, L[1]!, back);
      // Upper body turns about the hip: a lean while running, lying back in a slide.
      const lean = () => {
        ctx.save();
        ctx.translate(0, hip);
        ctx.rotate(sl ? -1.15 : run ? 0.07 : 0);
        ctx.translate(0, -hip);
      };
      lean();
      arm(sl ? -20 : run ? -5 + s * 10 : mode === "stand" ? -8 : -13, sl ? hip - 4 : run || mode === "stand" ? hip - 4 : hip - 17, "#e4e9e1");
      ctx.restore();
      leg(L[2]!, L[3]!, fore);
      lean();
      // Torso, apron, bow tie.
      ctx.fillStyle = C.matsoni;
      roundRect(ctx, -12, hip - 28, 24, 32, 10);
      ctx.fill();
      ctx.fillStyle = "rgba(52,40,110,0.12)";
      roundRect(ctx, 4, hip - 28, 8, 30, 4);
      ctx.fill();
      ctx.fillStyle = C.apricot;
      roundRect(ctx, -9, hip - 15, 19, 20, 6);
      ctx.fill();
      ctx.fillStyle = C.apricotDeep;
      roundRect(ctx, -3, hip - 7, 9, 6, 2);
      ctx.fill();
      ctx.fillRect(-12, hip - 15, 24, 2);
      ctx.fillStyle = C.pomegranate;
      ctx.beginPath();
      ctx.moveTo(1, hip - 26);
      ctx.lineTo(-4, hip - 30);
      ctx.lineTo(-4, hip - 22);
      ctx.moveTo(1, hip - 26);
      ctx.lineTo(6, hip - 30);
      ctx.lineTo(6, hip - 22);
      ctx.fill();
      // Head: hair, eye, moustache, cheek.
      const hd = hip - 40;
      blob(1, hd, 11, 11, SKIN);
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.arc(0, hd - 1, 11.6, Math.PI * 1.02, Math.PI * 2.04);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      if (mode === "fall") {
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 1.4;
        ctx.moveTo(4, hd - 3);
        ctx.lineTo(8, hd + 1);
        ctx.moveTo(8, hd - 3);
        ctx.lineTo(4, hd + 1);
        ctx.stroke();
        ctx.beginPath();
      } else ctx.arc(6, hd + 1, 1.7, 0, TAU);
      ctx.ellipse(8, hd + 5, 3.6, 1.5, 0, 0, TAU);
      ctx.fill();
      blob(4, hd + 6, 2.6, 2.6, "rgba(176,33,58,0.25)");
      // Front arm holds the tray: up high, or low over the knees in a slide.
      const hx = sl ? 22 : 15;
      const hyy = sl ? hip + 4 : hip - 53;
      arm(hx, hyy, C.matsoni, true);
      if (mode !== "fall") {
        ctx.translate(hx, hyy - 3);
        ctx.rotate(sl ? 1.15 : clamp(-vy / (900 * u), -1, 1) * 0.2);
        trayShape();
        cupShape();
        steam(0.6);
      }
      ctx.restore();
      ctx.restore();
    };

    // --- HUD and hints ---------------------------------------------------------

    const drawHud = () => {
      const s = clamp(u, 0.85, 1.2);
      const h = 36 * s;
      const y = 12;
      const pill = (x: number, w: number) => {
        ctx.fillStyle = "rgba(251,252,248,0.82)";
        roundRect(ctx, x, y, w, h, h / 2);
        ctx.fill();
      };
      const cu = String(got);
      const sc = String(Math.max(0, score));
      pill(12, 52 * s + cu.length * 13 * s);
      ctx.save();
      ctx.translate(12 + 20 * s, y + h / 2 + 7 * s);
      ctx.scale(1.25 * s, 1.25 * s);
      cupShape(C.apricotDeep);
      ctx.restore();
      label(ctx, cu, 12 + 36 * s, y + h / 2 + 1, 20 * s, C.ink, "left");
      const w2 = 30 * s + sc.length * 14 * s;
      pill(W - 12 - w2, w2);
      label(ctx, sc, W - 12 - w2 / 2, y + h / 2 + 1, 22 * s, C.ink);
    };

    const chevrons = (x: number, y: number, s: number) => {
      ctx.strokeStyle = C.tarragon;
      ctx.lineWidth = 4 * s;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (let k = 0; k < 2; k++) {
        const f = (clock * 1.6 + k * 0.5) % 1;
        ctx.globalAlpha = Math.sin(f * Math.PI);
        const yy = y + (k * 12 + f * 10) * s;
        ctx.beginPath();
        ctx.moveTo(x - 10 * s, yy - 6 * s);
        ctx.lineTo(x, yy + 4 * s);
        ctx.lineTo(x + 10 * s, yy - 6 * s);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    // A drawn pointing hand, fingertip at 0, 0.
    const hand = () => {
      ctx.fillStyle = C.matsoni;
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-5, 2);
      ctx.arcTo(-5, -4, 0, -4, 5);
      ctx.arcTo(5, -4, 5, 2, 5);
      ctx.lineTo(5, 18);
      ctx.lineTo(18, 21);
      ctx.arcTo(25, 23, 24, 30, 6);
      ctx.lineTo(22, 46);
      ctx.lineTo(-4, 46);
      ctx.lineTo(-15, 30);
      ctx.arcTo(-18, 24, -12, 24, 4);
      ctx.lineTo(-5, 28);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };

    // --- Frame ----------------------------------------------------------------

    const draw = () => {
      const pf = api.reducedMotion ? 0.5 : 1;
      const top = gy - gy / z;
      const bot = gy + (H - gy) / z;
      ctx.save();
      if (shake > 0) ctx.translate(rand(-1, 1) * shake * 30 * u, rand(-1, 1) * shake * 20 * u);
      ctx.translate(0, gy);
      ctx.scale(z, z);
      ctx.translate(0, -gy);
      sky(top, bot);
      mountains(pf);
      city(pf);
      buildings(pf);
      trees(pf);
      street(bot);
      for (const o of obs) drawObstacle(o);
      for (const p of pickups) {
        const y = gy - p.y + Math.sin(clock * 4 + p.ph) * 3 * u;
        ctx.save();
        ctx.translate(p.x, y + 8 * u);
        ctx.scale(u * 1.4, u * 1.4);
        const r = ctx.createRadialGradient(0, -6, 0, 0, -6, 17);
        r.addColorStop(0, "rgba(255,214,140,0.6)");
        r.addColorStop(1, "rgba(255,214,140,0)");
        ctx.fillStyle = r;
        ctx.fillRect(-17, -23, 34, 34);
        cupShape();
        steam(0.8);
        ctx.restore();
      }
      const sh = 1 - clamp(hy / (260 * u), 0, 0.6);
      blob(xh + (slide > 0 ? -8 : 2) * u, gy + 2 * u, (slide > 0 ? 34 : 18) * u * sh, 5 * u * sh, "rgba(52,40,110,0.26)");
      const rot = state === "fall" || state === "over" ? dir * 1.45 * (1 - Math.pow(1 - clamp(fallT / 0.45, 0, 1), 3)) : 0;
      drawWaiter(state === "ready" ? "stand" : rot ? "fall" : slide > 0 ? "slide" : hy > 0 ? "jump" : "run", rot);
      if (Math.abs(rot) > 0.9 && state !== "over") {
        // Dizzy stars circling the head.
        const cx = xh + dir * 66 * u;
        const cy = gy - 34 * u;
        ctx.fillStyle = C.apricot;
        for (let k = 0; k < 3; k++) {
          const a = clock * 6 + (k * TAU) / 3;
          star(cx + Math.cos(a) * 16 * u, cy + Math.sin(a) * 6 * u, 5 * u);
        }
      }
      for (const f of fly) {
        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.rotate(f.r);
        ctx.scale(u, u);
        if (f.tray) trayShape();
        else cupShape();
        ctx.restore();
      }
      for (const p of parts) {
        const f = p.t / p.life;
        ctx.globalAlpha = 1 - f;
        ctx.fillStyle = p.c;
        if (p.k === 0) {
          ctx.globalAlpha = 0.7 * (1 - f);
          blob(p.x, p.y, p.r * (1 + f), p.r * (1 + f), p.c);
        } else if (p.k === 1) star(p.x, p.y, p.r * (1.4 - f));
        else if (p.k === 2) blob(p.x, p.y, p.r * 0.6, p.r * 0.6, p.c);
        else {
          ctx.strokeStyle = p.c;
          ctx.lineWidth = 3 * u * (1 - f);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, p.r + f * 30 * u, (p.r + f * 30 * u) * 0.6, 0, 0, TAU);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      for (const p of pops) {
        ctx.globalAlpha = 1 - p.t / 0.7;
        label(ctx, "+10", p.x, p.y - 18 * u - p.t * 60 * u, 18 * u * (1 + 0.5 * Math.max(0, 1 - p.t * 8)), C.apricotDeep, "center", 800);
      }
      ctx.globalAlpha = 1;
      foreground(bot, pf);
      // Speed lines once the run is fast.
      const k = (speed / u - 330) / 130;
      if (state === "run" && k > 0 && !api.reducedMotion) {
        ctx.strokeStyle = `rgba(255,255,255,${0.45 * clamp(k, 0, 1)})`;
        ctx.lineWidth = 2 * u;
        ctx.beginPath();
        for (let i = 0; i < 9; i++) {
          const span = VW * 1.6;
          const x = mod(hash(i + 9) * span - clock * speed * 1.6, span) - VW * 0.3;
          const y = top + (0.15 + hash(i * 3.1) * 0.8) * (gy - top);
          ctx.moveTo(x, y);
          ctx.lineTo(x + (50 + hash(i) * 80) * u, y);
        }
        ctx.stroke();
      }
      // Until the first slide, point down when a hanging obstacle comes.
      if (state === "run" && !slides && obs.some((o) => o.hi && o.x - xh > 0 && o.x - xh < speed * 1.3)) chevrons(xh, gy - 132 * u, u);
      ctx.restore();
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,255,255,${(flash / 0.18) * 0.3})`;
        ctx.fillRect(0, 0, W, H);
      }
      drawHud();
      if (state === "ready") {
        const hx = W / 2;
        const hyy = gy + (H - gy) * 0.4;
        const f = (clock * 1.1) % 1;
        ctx.globalAlpha = 1 - f;
        ctx.strokeStyle = C.tarragon;
        ctx.lineWidth = 3 * u;
        ctx.beginPath();
        ctx.arc(hx, hyy, (12 + f * 34) * u, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(hx, hyy + (2 + Math.sin(clock * 6) * 3) * u);
        ctx.scale(u * 1.1, u * 1.1);
        hand();
        ctx.restore();
        chevrons(hx + 70 * u, hyy - 6 * u, u);
      }
    };

    // --- Input and loop -------------------------------------------------------

    const canvas = api.canvas;
    const prevTouch = canvas.style.touchAction;
    canvas.style.touchAction = "none";
    // Tap jumps at once; dragging down afterwards turns it into a slide.
    let ptr: { id: number; x: number; y: number; done: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, done: false };
      tapJump();
    };
    const onMove = (e: PointerEvent) => {
      if (!ptr || ptr.id !== e.pointerId || ptr.done) return;
      const dy = e.clientY - ptr.y;
      if (dy > 22 && dy > Math.abs(e.clientX - ptr.x)) {
        ptr.done = true;
        tapSlide();
      }
    };
    const onUp = () => {
      ptr = null;
    };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      const j = k === " " || k === "ArrowUp" || k === "w";
      if (!j && k !== "ArrowDown" && k !== "s") return;
      e.preventDefault();
      if (e.repeat) return;
      if (j) tapJump();
      else tapSlide();
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    window.addEventListener("keydown", onKey);

    api.setScore(0);
    const stopLoop = loop(api, (dt, paused) => {
      if (!paused) update(dt);
      draw();
    });

    return () => {
      stopLoop();
      stopFit();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      window.removeEventListener("keydown", onKey);
      canvas.style.touchAction = prevTouch;
    };
  },
};
