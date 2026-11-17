// Waiter Run: an endless side-scrolling runner on a Yerevan street. A waiter
// balances a coffee on a tray, jumps (and double jumps) over café chairs,
// a sleeping cat, flower pots, puddles and stacks of crates, and grabs coffee
// cups on the way. No words on the canvas: the host shows title and rules.
import { C, clamp, fitCanvas, glyph, label, loop, pick, rand, roundRect, type Game, type Size } from "./engine";

type Kind = "chair" | "cat" | "pot" | "puddle" | "crates";
type Obstacle = { kind: Kind; x: number; w: number; h: number; n: number; seed: number };
type Pickup = { x: number; y: number; ph: number };
type Fly = { tray: boolean; x: number; y: number; vx: number; vy: number; r: number; vr: number };
type Pop = { x: number; y: number; t: number };
type Mode = "stand" | "run" | "jump" | "fall";

const KINDS: Kind[] = ["chair", "cat", "pot", "puddle"];
// Drawing size in design units (width, height); everything scales with `u`.
const SIZE: Record<Kind, [number, number]> = {
  chair: [34, 56],
  cat: [44, 26],
  pot: [30, 44],
  puddle: [66, 8],
  crates: [46, 138],
};
const BODY = [C.tufa, "#e3a283", "#cf8260"];
const WINDOW = "#6b3b2b";
const SILL = "#f0c6a8";
const WOOD = "#b8814f";
const WOOD_DARK = "#7d5532";
const SKIN = "#f3c9a5";

const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const mod = (a: number, b: number) => ((a % b) + b) % b;

export const game: Game = {
  mount(api) {
    // Layout, recomputed on resize. u scales every size; the lane sits at 72% height.
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
      gy = Math.round(H * 0.72);
      py = gy - 14 * u;
      xh = clamp(W * 0.22, 64 * u, 220 * u);
    };
    const { ctx, stop: stopFit } = fitCanvas(api.canvas, onResize);

    let state: "ready" | "run" | "fall" | "over" = "ready";
    let clock = 0;
    let t = 0; // seconds of running
    let speed = 0;
    let scroll = 0;
    let dist = 0;
    let got = 0;
    let score = -1;
    let hy = 0; // hero height above the pavement
    let vy = 0; // upwards
    let jumps = 0;
    let coy = 0;
    let buf = 0;
    let phase = 0;
    let until = 0;
    let fallT = 0;
    let shake = 0;
    const obs: Obstacle[] = [];
    let pickups: Pickup[] = [];
    let fly: Fly[] = [];
    let pops: Pop[] = [];

    const calc = () => Math.floor(dist / (10 * u)) + got * 10;

    // --- Rules ---------------------------------------------------------------

    const jump = (double: boolean) => {
      vy = (double ? 760 : 800) * u;
      jumps = double ? 2 : 1;
      coy = 0;
    };

    const tap = () => {
      if (api.isPaused()) return;
      if (state === "ready") {
        state = "run";
      } else if (state === "run") {
        if (hy <= 0 || (coy > 0 && jumps === 0)) jump(false);
        else if (jumps < 2) jump(true);
        else buf = 0.08; // a tap just before landing still jumps
      }
    };

    const spawn = () => {
      const crates = t > 18 && Math.random() < clamp(0.12 + (t - 18) / 400, 0, 0.3);
      const kind: Kind = crates ? "crates" : pick(KINDS);
      const n = (kind === "chair" || kind === "pot") && t > 30 && Math.random() < 0.3 ? 2 : 1;
      const [bw, bh] = SIZE[kind];
      const w = (bw * n + (n - 1) * 8) * u;
      const o: Obstacle = { kind, x: W + 60 * u, w, h: bh * u, n, seed: Math.random() };
      obs.push(o);
      // Always a fair gap: a full jump plus time to react, more after the crates.
      const gap = speed * (0.9 + rand(0, 0.5) + (crates ? 0.35 : 0));
      until = w + gap;
      const r = Math.random();
      if (r < 0.55) {
        const top = crates ? 190 : bh + 44;
        for (const k of [-1, 0, 1]) {
          pickups.push({ x: o.x + w / 2 + k * 44 * u, y: (top + (k === 0 ? 26 : 0)) * u, ph: rand(0, 6) });
        }
      } else if (r < 0.85) {
        const y = pick([26, 64, 98]) * u;
        const count = 1 + Math.floor(Math.random() * 3);
        for (let k = 0; k < count; k++) pickups.push({ x: o.x + w + gap * 0.5 + k * 40 * u, y, ph: rand(0, 6) });
      }
    };

    const hits = () => {
      const l = xh - 11 * u;
      const r = xh + 11 * u;
      const b = hy + 3 * u;
      for (const o of obs) {
        const top = o.kind === "puddle" ? o.h * 0.7 : o.h - 5 * u;
        if (r > o.x + 5 * u && l < o.x + o.w - 5 * u && b < top) return true;
      }
      return false;
    };

    const trip = () => {
      state = "fall";
      fallT = 0;
      shake = api.reducedMotion ? 0 : 0.3;
      vy = 480 * u;
      jumps = 2;
      const x = xh + 14 * u;
      const y = gy - hy - 84 * u;
      fly = [
        { tray: true, x, y, vx: 130 * u, vy: -640 * u, r: 0, vr: 7 },
        { tray: false, x, y: y - 8 * u, vx: 210 * u, vy: -780 * u, r: 0, vr: -9 },
      ];
    };

    const update = (dt: number) => {
      clock += dt;
      if (state === "ready" || state === "over") return;
      const g = 2600 * u;
      if (state === "run") {
        t += dt;
        speed = (260 + 200 * clamp(t / 120, 0, 1)) * u;
      } else {
        speed *= Math.exp(-5 * dt);
        fallT += dt;
        shake = Math.max(0, shake - dt);
      }
      const dx = speed * dt;
      scroll += dx;
      if (state === "run") dist += dx;
      phase += (dx / (120 * u)) * Math.PI * 2;

      // Hero physics.
      const wasAir = hy > 0;
      vy -= g * dt;
      hy += vy * dt;
      buf = Math.max(0, buf - dt);
      if (hy <= 0) {
        hy = 0;
        vy = 0;
        jumps = 0;
        coy = 0.08;
        if (wasAir && buf > 0 && state === "run") jump(false);
      } else {
        coy = Math.max(0, coy - dt);
      }

      for (const o of obs) o.x -= dx;
      for (const p of pickups) p.x -= dx;
      while (obs.length && obs[0]!.x + obs[0]!.w < -40) obs.shift();
      pickups = pickups.filter((p) => p.x > -40);

      if (state === "run") {
        until -= dx;
        if (until <= 0) spawn();
        for (const p of pickups) {
          if (p.y < 0) continue;
          if (Math.hypot(p.x - xh, gy - p.y - (gy - hy - 30 * u)) < 32 * u) {
            got++;
            pops.push({ x: p.x, y: gy - p.y, t: 0 });
            p.y = -1; // collected
          }
        }
        pickups = pickups.filter((p) => p.y >= 0);
        if (hits()) trip();
        const sc = calc();
        if (sc !== score) {
          score = sc;
          api.setScore(sc);
        }
      } else {
        for (const f of fly) {
          f.vy += g * dt;
          f.x += f.vx * dt;
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
      for (const p of pops) p.t += dt;
      pops = pops.filter((p) => p.t < 0.7);
    };

    // --- Drawing: the street --------------------------------------------------

    const sky = () => {
      const g = ctx.createLinearGradient(0, 0, 0, gy);
      g.addColorStop(0, C.sky);
      g.addColorStop(1, "#f1f8fb");
      ctx.fillStyle = g;
      ctx.fillRect(-20, -20, W + 40, H + 40);
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      for (let i = 0; i < 4; i++) {
        const span = W + 300;
        const x = mod(hash(i + 1) * span - clock * (5 + i * 2), span) - 150;
        const y = H * (0.07 + hash(i + 7) * 0.14);
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(u, u);
        roundRect(ctx, 0, 10, 96, 22, 11);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(30, 12, 14, 0, Math.PI * 2);
        ctx.arc(54, 8, 18, 0, Math.PI * 2);
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

    // Pale twin-peak mountains, tiled so they loop.
    const mountains = (pf: number) => {
      const P = Math.max(W * 1.3, 900 * u);
      const mh = H * 0.36;
      const base = py - 150 * u;
      const ridge = [
        [0, 0.05], [0.1, 0.3], [0.19, 0.7], [0.25, 1], [0.31, 0.62], [0.34, 0.45], [0.4, 0.72],
        [0.46, 0.42], [0.55, 0.3], [0.7, 0.22], [0.85, 0.12], [1, 0.05],
      ] as const;
      const off = mod(scroll * 0.03 * pf, P);
      for (let k = 0; k * P - off < W; k++) {
        const x0 = k * P - off;
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(x0, base + 40);
        for (const [fx, fh] of ridge) ctx.lineTo(x0 + fx * P, base - fh * mh);
        ctx.lineTo(x0 + P, base + 40);
        ctx.closePath();
        ctx.fillStyle = "#b8cfdf";
        ctx.fill();
        ctx.clip();
        ctx.fillStyle = "#f7fbfd";
        snow(x0 + 0.25 * P, base - mh, 0.25 * mh, 0.05 * P);
        snow(x0 + 0.4 * P, base - 0.72 * mh, 0.18 * mh, 0.04 * P);
        ctx.restore();
      }
    };

    // Tufa-stone buildings with arched windows, balconies and awnings.
    const buildings = (pf: number) => {
      const cell = 168 * u;
      const off = scroll * 0.22 * pf;
      for (let i = Math.floor(off / cell); i * cell - off < W; i++) {
        const bh = 150 + hash(i) * 150;
        const top = -bh;
        ctx.save();
        ctx.translate(i * cell - off, py);
        ctx.scale(u, u);
        ctx.fillStyle = BODY[Math.floor(hash(i + 9) * 3)]!;
        ctx.fillRect(0, top, 169, bh);
        ctx.fillStyle = C.tufaDark;
        ctx.fillRect(-2, top - 6, 173, 8);
        ctx.fillStyle = "rgba(110,50,30,0.14)";
        ctx.fillRect(159, top, 10, bh);
        const rows = Math.floor((bh - 64) / 50);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < 3; c++) {
            const wx = 20 + c * 55;
            const wy = top + 20 + r * 50;
            ctx.beginPath();
            ctx.moveTo(wx, wy + 32);
            ctx.lineTo(wx, wy + 11);
            ctx.arc(wx + 11, wy + 11, 11, Math.PI, 0);
            ctx.lineTo(wx + 22, wy + 32);
            ctx.closePath();
            ctx.fillStyle = WINDOW;
            ctx.fill();
            ctx.strokeStyle = SILL;
            ctx.lineWidth = 2.5;
            ctx.stroke();
            if (hash(i * 31 + r * 7 + c) > 0.7) {
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
        ctx.fillStyle = "#4e2a1f";
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
      const haze = ctx.createLinearGradient(0, py - 330 * u, 0, py);
      haze.addColorStop(0, "rgba(207,230,242,0)");
      haze.addColorStop(1, "rgba(207,230,242,0.3)");
      ctx.fillStyle = haze;
      ctx.fillRect(0, py - 330 * u, W, 330 * u);
    };

    // Trees and street lamps along the kerb.
    const trees = (pf: number) => {
      const cell = 230 * u;
      const off = scroll * 0.7 * pf;
      for (let i = Math.floor(off / cell) - 1; i * cell - off < W + 60 * u; i++) {
        const h = hash(i + 50);
        if (h > 0.7) continue;
        ctx.save();
        ctx.translate(i * cell - off + hash(i + 3) * 60 * u, py + 3 * u);
        ctx.scale(u, u);
        if (h < 0.4) {
          ctx.fillStyle = "#6b4a35";
          ctx.fillRect(-4, -72, 8, 72);
          ctx.fillStyle = C.tarragon;
          for (const [cx, cy, r] of [[0, -102, 34], [-22, -82, 26], [22, -84, 26]] as const) {
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = "#2f8a5a";
          ctx.beginPath();
          ctx.arc(-8, -112, 15, 0, Math.PI * 2);
          ctx.arc(14, -96, 11, 0, Math.PI * 2);
          ctx.fill();
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
          ctx.fillStyle = "rgba(242,162,58,0.25)";
          ctx.beginPath();
          ctx.arc(16, -143, 22, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = C.apricot;
          roundRect(ctx, 10, -150, 12, 14, 5);
          ctx.fill();
        }
        ctx.restore();
      }
    };

    const pavement = () => {
      const tops = [py, py + 34 * u, py + 82 * u, H + 20];
      for (let ri = 0; ri < 3; ri++) {
        const cw = (60 + ri * 34) * u;
        const first = Math.floor(scroll / cw);
        const off = mod(scroll, cw);
        for (let k = 0; k * cw - off < W; k++) {
          ctx.fillStyle = (k + first + ri) & 1 ? "#d7ddd3" : "#cdd5cb";
          ctx.fillRect(k * cw - off, tops[ri]!, cw + 1, tops[ri + 1]! - tops[ri]!);
        }
      }
      ctx.fillStyle = "#b3bfb2";
      ctx.fillRect(-20, py - 5 * u, W + 40, 5 * u);
    };

    // --- Drawing: obstacles, pickups, hero ------------------------------------

    const trayShape = () => {
      ctx.fillStyle = "#cdd5d8";
      roundRect(ctx, -18, -2, 36, 5, 2.5);
      ctx.fill();
      ctx.fillStyle = "#9aa6ab";
      roundRect(ctx, -18, 1, 36, 2.5, 1.2);
      ctx.fill();
    };

    const cupShape = () => {
      ctx.fillStyle = C.matsoni;
      ctx.strokeStyle = C.muted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, -2, 8, 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
      roundRect(ctx, -5.5, -11, 11, 9, 3.5);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(6, -7, 3, -1.2, 1.2);
      ctx.stroke();
      ctx.fillStyle = "#6f4327";
      ctx.beginPath();
      ctx.ellipse(0, -10.5, 4.4, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawObstacle = (o: Obstacle) => {
      ctx.save();
      ctx.translate(o.x, gy);
      ctx.scale(u, u);
      const w = o.w / u;
      if (o.kind !== "puddle") {
        ctx.fillStyle = "rgba(14,22,18,0.18)";
        ctx.beginPath();
        ctx.ellipse(w / 2, 2, w / 2, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let n = 0; n < o.n; n++) {
        ctx.save();
        ctx.translate(n * (SIZE[o.kind][0] + 8), 0);
        ctx.lineCap = "round";
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
          ctx.beginPath();
          ctx.ellipse(25, -45, 7, 9, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = C.apricot;
          roundRect(ctx, 2, -31, 29, 6, 3);
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
          for (const [fx, fy, col] of [[8, -41, C.pomegranate], [23, -42, C.apricot], [15, -46, C.matsoni]] as const) {
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.arc(fx, fy, 5, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = C.tufaDark;
          ctx.beginPath();
          ctx.moveTo(5, -26);
          ctx.lineTo(25, -26);
          ctx.lineTo(22, 0);
          ctx.lineTo(8, 0);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = C.apricotDeep;
          roundRect(ctx, 3, -30, 24, 6, 2);
          ctx.fill();
        } else if (o.kind === "cat") {
          ctx.fillStyle = C.ink;
          glyph(ctx, "🐈", 22, -18, 46);
          glyph(ctx, "💤", 38, -42 + Math.sin(clock * 2 + o.seed * 6) * 3, 16);
        } else if (o.kind === "puddle") {
          ctx.fillStyle = "rgba(150,196,220,0.9)";
          ctx.beginPath();
          ctx.ellipse(33, 3, 33, 6, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "rgba(235,246,251,0.8)";
          ctx.beginPath();
          ctx.ellipse(24, 2, 12, 2, 0, 0, Math.PI * 2);
          ctx.fill();
        } else {
          for (let j = 0; j < 3; j++) {
            const x = j === 0 ? 0 : (hash(o.seed * 90 + j) - 0.5) * 6;
            const y = -(j + 1) * 46;
            ctx.fillStyle = WOOD;
            ctx.fillRect(x, y, 46, 46);
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
        }
        ctx.restore();
      }
      ctx.restore();
    };

    const drawWaiter = (mode: Mode, rot: number, tray: boolean) => {
      const run = mode === "run";
      const s = Math.sin(phase);
      const cs = Math.cos(phase);
      const bob = run ? -Math.abs(s) * 2.5 : mode === "stand" ? Math.sin(clock * 3) * 0.8 : 0;
      const hip = -26 + bob;
      const lift = rot / 1.45;
      ctx.save();
      ctx.translate(xh, gy - hy - 12 * u * lift);
      ctx.rotate(rot);
      ctx.scale(u, u);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const leg = (fx: number, fy: number, col: string) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(0, hip);
        ctx.quadraticCurveTo(fx / 2 + 5, (hip + fy) / 2, fx, fy);
        ctx.stroke();
        ctx.fillStyle = C.ink;
        ctx.beginPath();
        ctx.ellipse(fx + 3, fy + 1, 7, 4, 0, 0, Math.PI * 2);
        ctx.fill();
      };
      const arm = (hx: number, hyy: number, col: string) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(mode === "jump" || mode === "run" ? -5 : -4, -48 + bob);
        ctx.lineTo(hx, hyy);
        ctx.stroke();
        ctx.fillStyle = SKIN;
        ctx.beginPath();
        ctx.arc(hx, hyy, 3.8, 0, Math.PI * 2);
        ctx.fill();
      };
      if (run) {
        leg(-s * 13, -3 - Math.max(0, -cs) * 9, "#1d212b");
        arm(-5 + s * 10, -30 + bob, "#e4e9e1");
        leg(s * 13, -3 - Math.max(0, cs) * 9, "#2b2f3a");
      } else if (mode === "jump") {
        leg(-10, -5, "#1d212b");
        arm(-12, -44, "#e4e9e1");
        leg(11, -13, "#2b2f3a");
      } else if (mode === "fall") {
        leg(-8, -4, "#1d212b");
        arm(-14, -40, "#e4e9e1");
        leg(8, -5, "#2b2f3a");
      } else {
        leg(-5, -2, "#1d212b");
        arm(-8, -30 + bob, "#e4e9e1");
        leg(5, -2, "#2b2f3a");
      }
      // Torso, apron, bow tie.
      ctx.fillStyle = C.matsoni;
      ctx.strokeStyle = C.line;
      ctx.lineWidth = 1.5;
      roundRect(ctx, -12, -54 + bob, 24, 32, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = C.apricot;
      roundRect(ctx, -9, -41 + bob, 19, 20, 6);
      ctx.fill();
      ctx.fillStyle = C.apricotDeep;
      roundRect(ctx, -3, -33 + bob, 9, 6, 2);
      ctx.fill();
      ctx.fillRect(-12, -41 + bob, 24, 2);
      ctx.fillStyle = C.pomegranate;
      ctx.beginPath();
      ctx.moveTo(1, -52 + bob);
      ctx.lineTo(-4, -56 + bob);
      ctx.lineTo(-4, -48 + bob);
      ctx.moveTo(1, -52 + bob);
      ctx.lineTo(6, -56 + bob);
      ctx.lineTo(6, -48 + bob);
      ctx.fill();
      // Head: hair, eye, moustache, cheek.
      ctx.fillStyle = SKIN;
      ctx.beginPath();
      ctx.arc(1, -66 + bob, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.ink;
      ctx.beginPath();
      ctx.arc(0, -67 + bob, 11.6, Math.PI * 1.02, Math.PI * 2.04);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.arc(6, -65 + bob, 1.7, 0, Math.PI * 2);
      ctx.ellipse(8, -61 + bob, 3.6, 1.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(176,33,58,0.25)";
      ctx.beginPath();
      ctx.arc(4, -60 + bob, 2.6, 0, Math.PI * 2);
      ctx.fill();
      // Front arm holds the tray up high.
      const hx = 15;
      const hyy = -79 + bob;
      ctx.strokeStyle = C.matsoni;
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(7, -48 + bob);
      ctx.lineTo(hx, hyy);
      ctx.stroke();
      ctx.fillStyle = SKIN;
      ctx.beginPath();
      ctx.arc(hx, hyy, 3.8, 0, Math.PI * 2);
      ctx.fill();
      if (tray) {
        ctx.translate(hx, hyy - 3);
        ctx.rotate(clamp(-vy / (900 * u), -1, 1) * 0.2);
        trayShape();
        cupShape();
      }
      ctx.restore();
    };

    const drawHud = () => {
      const s = clamp(u, 0.85, 1.2);
      const h = 36 * s;
      const y = 12;
      const pill = (x: number, w: number) => {
        ctx.globalAlpha = 0.78;
        ctx.fillStyle = C.matsoni;
        roundRect(ctx, x, y, w, h, h / 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      };
      const cu = String(got);
      const sc = String(Math.max(0, score));
      pill(12, 52 * s + cu.length * 13 * s);
      ctx.fillStyle = C.ink;
      glyph(ctx, "☕", 12 + 19 * s, y + h / 2 + 1, 20 * s);
      label(ctx, cu, 12 + 35 * s, y + h / 2 + 1, 20 * s, C.ink, "left");
      const w2 = 30 * s + sc.length * 14 * s;
      pill(W - 12 - w2, w2);
      label(ctx, sc, W - 12 - w2 / 2, y + h / 2 + 1, 22 * s, C.ink);
    };

    const draw = () => {
      const pf = api.reducedMotion ? 0.5 : 1;
      ctx.save();
      if (shake > 0) ctx.translate(rand(-1, 1) * shake * 30 * u, rand(-1, 1) * shake * 20 * u);
      sky();
      mountains(pf);
      buildings(pf);
      trees(pf);
      pavement();
      for (const o of obs) drawObstacle(o);
      for (const p of pickups) {
        ctx.fillStyle = C.ink;
        glyph(ctx, "☕", p.x, gy - p.y + Math.sin(clock * 4 + p.ph) * 3 * u, 30 * u);
      }
      const air = hy > 0;
      const sh = 1 - clamp(hy / (260 * u), 0, 0.6);
      ctx.fillStyle = "rgba(14,22,18,0.22)";
      ctx.beginPath();
      ctx.ellipse(xh, gy + 2 * u, 18 * u * sh, 5 * u * sh, 0, 0, Math.PI * 2);
      ctx.fill();
      const rot = state === "fall" || state === "over" ? 1.45 * (1 - Math.pow(1 - clamp(fallT / 0.45, 0, 1), 3)) : 0;
      drawWaiter(state === "ready" ? "stand" : rot > 0 ? "fall" : air ? "jump" : "run", rot, rot === 0);
      if (rot > 0.9 && state !== "over") {
        ctx.fillStyle = C.ink;
        glyph(ctx, "💫", xh + 40 * u, gy - 50 * u + Math.sin(clock * 9) * 4 * u, 24 * u);
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
      for (const p of pops) {
        ctx.globalAlpha = 1 - p.t / 0.7;
        label(ctx, "+10", p.x, p.y - p.t * 60 * u, 18 * u, C.apricotDeep);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      drawHud();
      if (state === "ready") {
        const hx = W / 2;
        const hyy = gy + (H - gy) * 0.55;
        const f = (clock * 1.1) % 1;
        ctx.globalAlpha = 1 - f;
        ctx.strokeStyle = C.tarragon;
        ctx.lineWidth = 3 * u;
        ctx.beginPath();
        ctx.arc(hx, hyy - 8 * u, (16 + f * 40) * u, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = C.ink;
        glyph(ctx, "👆", hx, hyy + Math.sin(clock * 6) * 4 * u, 46 * u * (1 + 0.12 * Math.sin(clock * 6)));
      }
    };

    // --- Input and loop -------------------------------------------------------

    const canvas = api.canvas;
    const prevTouch = canvas.style.touchAction;
    canvas.style.touchAction = "none";
    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      tap();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "ArrowUp") return;
      e.preventDefault();
      if (!e.repeat) tap();
    };
    canvas.addEventListener("pointerdown", onDown);
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
      window.removeEventListener("keydown", onKey);
      canvas.style.touchAction = prevTouch;
    };
  },
};
