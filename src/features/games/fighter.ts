// "Yard Fighters": a one-on-one cartoon scuffle in an old Yerevan courtyard.
// The Chef (the guest) and the Baker (the phone) trade ladle jabs, heavy kicks
// and spinning lavash discs. Hits make flour puffs, sparks and stars; a
// knocked-out fighter sits down dizzy. Best of three rounds. No words on the
// canvas: numbers and drawn shapes only.
//
// Art direction
// - Mood: a sunny Saturday squabble between neighbours; warm, loud, never mean.
// - Camera and scale: 2.5D side view, one static stage under a slightly raised
//   camera (perspective paving, layered wall, pergola); the world is 300 units
//   tall and scales to the arena, with small nudges and a KO zoom.
// - Shapes: the Chef tall and slim (toque, scarf, ladle), the Baker round and
//   wide (flat cap, moustache, apron, rolling pin); the yard soft and rounded.
// - Values: the fighters carry the strongest contrast (ink outlines, white
//   coats); the yard stays in a narrower mid range of warm stone.
// - Palette: tufa pink and apricot for the yard, tarragon (Chef) against
//   pomegranate (Baker) in the HUD, gold for stars and sparks; key light warm
//   from the right, shadows shifted cool towards violet.
// - Detail: faces, hands and props get the detail; the wall behind the fight
//   is kept quiet, the laundry and grapes stay up out of the play line.
// - Rules: saturated 2.5D cartoon; bold ink outlines on the fighters only; each
//   fighter shape is shaded light-to-shadow from the right with a warm rim
//   light; soft cool floor shadows; no outlines in the background.
// - Signature: flour puffs on every hit, and a spinning lavash for a special.
import { C, clamp, createPad, fitCanvas, label, loop, rand, roundRect, type Game, type PadButton, type Size } from "./engine";

type State = "idle" | "walk" | "punch" | "kick" | "throw" | "block" | "hit" | "stag" | "ko" | "win";
type Fighter = {
  cpu: boolean;
  x: number; // world units from the arena's left edge
  y: number; // height above the floor
  vx: number;
  vy: number;
  kb: number; // knock-back speed, decays
  face: number;
  hp: number;
  chip: number; // the trail behind the health bar
  st: State;
  t: number;
  stun: number; // how long the current hit or stagger lasts
  done: boolean; // this attack already landed (or the disc left the hand)
  inv: number;
  cd: number;
  wins: number;
  sq: number; // squash (+) or stretch (-), decays to 0
  fl: number; // white hit flash
  buf: string; // the last press, kept for 120 ms (input buffer)
  bt: number;
};
type Intent = { mv: number; block: boolean; jump: boolean; a: boolean; b: boolean; c: boolean };
type Disc = { x: number; vx: number; owner: Fighter; spin: number };
// k: 0 flour puff, 1 star, 2 spark, 3 ring, 4 impact burst.
type Bit = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; k: number; c: string };
type Mat = readonly [string, string, string]; // light, base, cool shadow

const ROUND = 45;
const WALK = 105;
const GRAV = 1300;
const TAU = Math.PI * 2;
const INK = C.ink;
const BUFFER = 0.12;
// Attack timing in seconds: [duration, active from, active to, reach, damage].
// The punch is light (out at once, short); the kick is heavy (wind-up, commits).
const ATK = { punch: [0.22, 0.035, 0.11, 34, 6], kick: [0.56, 0.24, 0.34, 54, 13], throw: [0.4, 0.17, 0.17, 0, 0] } as const;
const M = {
  skin: ["#ffe2c4", "#f4bb92", "#c98488"],
  coat: ["#ffffff", "#f2efe9", "#b4bcd8"],
  shirt: ["#fff7e2", "#f5dfb6", "#c6aaa8"],
  apron: ["#5cc48e", "#23804f", "#1c4a58"],
  navy: ["#56698a", "#2d3b55", "#1a2036"],
  brown: ["#b88050", "#87562f", "#4c3046"],
  scarf: ["#ffd07a", "#f2a23a", "#c45a62"],
  wood: ["#f6c890", "#d9a066", "#97606a"],
  steel: ["#ffffff", "#c9d2d8", "#7a84a8"],
  shoe: ["#5a5f6e", "#262a33", "#0d0f18"],
  gold: ["#fff3a8", "#ffcf3f", "#cf7f2a"],
} satisfies Record<string, Mat>;

const star = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number, n = 5, inner = 0.45, fill = "#ffd23f") => {
  ctx.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const rr = i % 2 ? r * inner : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.strokeStyle = C.apricotDeep;
  ctx.stroke();
};

// A chunky stroke. With a material it gets an ink outline, a cool shadow
// side and a warm lit side (l: the light's direction in local x).
const limb = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, m: Mat | string, l = 1) => {
  ctx.lineCap = "round";
  const seg = (lw: number, c: string, ox = 0, oy = 0) => {
    ctx.lineWidth = lw;
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.moveTo(x1 + ox, y1 + oy);
    ctx.lineTo(x2 + ox, y2 + oy);
    ctx.stroke();
  };
  if (typeof m === "string") return seg(w, m);
  seg(w + 3.4, INK);
  seg(w, m[1]);
  seg(w * 0.45, m[2], -l * w * 0.24, w * 0.2);
  seg(w * 0.3, m[0], l * w * 0.26, -w * 0.14);
};

const blob = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
};

export const game: Game = {
  mount(api) {
    const canvas = api.canvas;
    const calm = api.reducedMotion;
    const prevTouch = canvas.style.touchAction;
    canvas.style.touchAction = "none";

    // Layout in CSS px; the world is 300 units tall, fighters about 110.
    let ax = 0;
    let aw = 1;
    let ah = 1;
    let u = 1;
    let ww = 300;
    let floorY = 1;
    let bg: HTMLCanvasElement | null = null;
    let btns: { id: PadButton; x: number; y: number; r: number }[] = [];

    const mk = (cpu: boolean): Fighter => ({
      cpu, x: 0, y: 0, vx: 0, vy: 0, kb: 0, face: 1, hp: 100, chip: 100, st: "idle", t: 0, stun: 0, done: false, inv: 0, cd: 0, wins: 0, sq: 0, fl: 0, buf: "", bt: 0,
    });
    const P = mk(false);
    const B = mk(true);
    let discs: Disc[] = [];
    let bits: Bit[] = [];
    let round = 1;
    let phase: "intro" | "fight" | "ko" = "intro";
    let phaseT = 0;
    let fightT = 0; // the "fight!" flash
    let timer = ROUND;
    let over = false;
    let reported = false;
    let score = 0;
    let dealt = 0;
    let bonus = 0;
    let shake = 0;
    let stop = 0; // hit-stop, real seconds
    let slow = 0; // slow motion after the final KO, real seconds
    let flash = 0;
    let camX = 0;
    let zoom = 1;
    let now = 0;

    const setScore = () => {
      const s = Math.round(dealt) + bonus;
      if (s !== score) {
        score = s;
        api.setScore(score);
      }
    };

    const paintBg = (s: Size) => {
      const c = document.createElement("canvas");
      const dpr = canvas.width / s.w;
      c.width = canvas.width;
      c.height = canvas.height;
      const b = c.getContext("2d");
      if (!b) return null;
      b.scale(dpr, dpr);
      const W = s.w;
      const wallTop = ah * 0.2;
      const floorTop = ah * 0.62;
      // Golden-hour sky.
      let g = b.createLinearGradient(0, 0, 0, wallTop);
      g.addColorStop(0, "#ffae5c");
      g.addColorStop(1, "#ffe0a6");
      b.fillStyle = g;
      b.fillRect(0, 0, W, wallTop + 2);
      // Tufa wall with stone courses, warmer towards the sun on the right.
      g = b.createLinearGradient(0, 0, W, 0);
      g.addColorStop(0, "#c97a6a");
      g.addColorStop(1, "#ec9a6e");
      b.fillStyle = g;
      b.fillRect(0, wallTop, W, floorTop - wallTop);
      b.strokeStyle = "rgba(150,80,70,0.35)";
      b.lineWidth = 1.2;
      const row = Math.max(10, ah * 0.045);
      for (let y = wallTop, i = 0; y < floorTop; y += row, i++) {
        b.beginPath();
        b.moveTo(0, y);
        b.lineTo(W, y);
        for (let x = (i % 2) * row; x < W; x += row * 2) {
          b.moveTo(x, y);
          b.lineTo(x, Math.min(floorTop, y + row));
        }
        b.stroke();
      }
      b.fillStyle = C.tufaDark;
      b.fillRect(0, wallTop - 4, W, 8);
      // Arched doorways and a window with geraniums.
      const arch = (x: number, top: number, w: number, bottom: number, fill: string) => {
        b.beginPath();
        b.moveTo(x, bottom);
        b.lineTo(x, top + w / 2);
        b.arc(x + w / 2, top + w / 2, w / 2, Math.PI, 0);
        b.lineTo(x + w, bottom);
        b.closePath();
        b.fillStyle = fill;
        b.fill();
        b.lineWidth = Math.max(3, w * 0.09);
        b.strokeStyle = "#a95f4f";
        b.stroke();
      };
      const dw = aw * 0.17;
      arch(ax + aw * 0.12, floorTop - (floorTop - wallTop) * 0.78, dw, floorTop, "#2c2a3e");
      arch(ax + aw * 0.66, floorTop - (floorTop - wallTop) * 0.74, dw, floorTop, "#3f6f86");
      b.strokeStyle = "rgba(19,36,27,0.35)";
      b.lineWidth = 1.5;
      b.beginPath();
      b.moveTo(ax + aw * 0.66 + dw / 2, floorTop - (floorTop - wallTop) * 0.6);
      b.lineTo(ax + aw * 0.66 + dw / 2, floorTop);
      b.stroke();
      const wx = ax + aw * 0.42;
      const wy = wallTop + (floorTop - wallTop) * 0.22;
      arch(wx, wy, dw * 0.7, wy + dw * 0.9, "#34506a");
      b.fillStyle = C.tufaDark;
      b.fillRect(wx - 6, wy + dw * 0.9, dw * 0.7 + 12, 6);
      for (let i = 0; i < 4; i++) blob(b, wx + 4 + i * dw * 0.16, wy + dw * 0.86, dw * 0.08, i % 2 ? "#d61f45" : "#ff4d6a");
      // Laundry line.
      const lx0 = ax + aw * 0.03;
      const lx1 = ax + aw * 0.97;
      const ly = wallTop + ah * 0.05;
      const sag = ah * 0.07;
      b.strokeStyle = "rgba(19,36,27,0.5)";
      b.lineWidth = 1.2;
      b.beginPath();
      b.moveTo(lx0, ly);
      b.quadraticCurveTo((lx0 + lx1) / 2, ly + sag * 2, lx1, ly);
      b.stroke();
      const cloth = ["#ffb03a", "#9fd6f2", "#ffc9d2", "#fff8ea", "#63d398", "#ffe066"];
      for (let i = 0; i < 6; i++) {
        const t = 0.12 + i * 0.15;
        const x = lx0 + (lx1 - lx0) * t;
        const y = ly + sag * 4 * t * (1 - t);
        const cw = aw * (i % 2 ? 0.06 : 0.08);
        const ch = ah * (i % 3 ? 0.08 : 0.11);
        b.fillStyle = cloth[i]!;
        roundRect(b, x - cw / 2, y, cw, ch, 3);
        b.fill();
        b.fillStyle = "rgba(80,60,140,0.22)"; // the cool shadow side
        b.fillRect(x - cw / 2, y + 2, cw * 0.3, ch - 4);
        b.fillStyle = C.tufaDark;
        b.fillRect(x - cw / 2 + 2, y - 2, 3, 6);
        b.fillRect(x + cw / 2 - 5, y - 2, 3, 6);
      }
      // Floor: paving in perspective.
      g = b.createLinearGradient(0, floorTop, 0, ah);
      g.addColorStop(0, "#c48f78");
      g.addColorStop(1, "#ecc69a");
      b.fillStyle = g;
      b.fillRect(0, floorTop, W, ah - floorTop);
      const cx = ax + aw / 2;
      const tw = aw / 7;
      b.strokeStyle = "rgba(122,74,60,0.3)";
      b.lineWidth = 1;
      b.beginPath();
      for (let i = -12; i <= 12; i++) {
        b.moveTo(cx + i * tw * 0.7, floorTop);
        b.lineTo(cx + i * tw * 1.6, ah);
      }
      for (let j = 1; j < 6; j++) {
        const y = floorTop + (ah - floorTop) * (j / 6) ** 1.5;
        b.moveTo(0, y);
        b.lineTo(W, y);
      }
      b.stroke();
      g = b.createLinearGradient(0, floorTop, 0, floorTop + ah * 0.06);
      g.addColorStop(0, "rgba(70,40,90,0.32)");
      g.addColorStop(1, "rgba(70,40,90,0)");
      b.fillStyle = g;
      b.fillRect(0, floorTop, W, ah * 0.06);
      // Nardi table with two stools at the back right.
      const nx = ax + aw * 0.86;
      const ny = floorTop + ah * 0.06;
      const nw = aw * 0.15;
      b.fillStyle = "rgba(70,40,90,0.25)";
      b.beginPath();
      b.ellipse(nx - nw * 0.2, ny + ah * 0.085, nw * 0.9, ah * 0.012, 0, 0, TAU);
      b.fill();
      for (const sx of [nx - nw * 0.75, nx + nw * 0.75, nx - nw * 0.4, nx + nw * 0.4]) {
        const stool = Math.abs(sx - nx) > nw * 0.5;
        b.fillStyle = "#6b4128";
        b.fillRect(sx - 1.5, ny + (stool ? ah * 0.05 : 0), 3, stool ? ah * 0.035 : ah * 0.08);
        if (stool) {
          b.fillStyle = "#9a6038";
          roundRect(b, sx - nw * 0.14, ny + ah * 0.035, nw * 0.28, ah * 0.018, 2);
          b.fill();
        }
      }
      b.fillStyle = "#9a6038";
      roundRect(b, nx - nw / 2, ny - ah * 0.02, nw, ah * 0.03, 2);
      b.fill();
      b.fillStyle = "#f0dcb4";
      b.fillRect(nx - nw * 0.45, ny - ah * 0.028, nw * 0.9, ah * 0.016);
      for (let i = 0; i < 10; i++) {
        const x = nx - nw * 0.43 + i * nw * 0.086;
        b.fillStyle = i % 2 ? C.pomegranate : "#3a2a20";
        b.beginPath();
        b.moveTo(x, ny - ah * 0.028);
        b.lineTo(x + nw * 0.04, ny - ah * 0.016);
        b.lineTo(x + nw * 0.08, ny - ah * 0.028);
        b.fill();
      }
      blob(b, nx - nw * 0.2, ny - ah * 0.033, ah * 0.008, C.matsoni);
      blob(b, nx + nw * 0.15, ny - ah * 0.033, ah * 0.008, INK);
      // Pergola: posts, beam, vine and grapes.
      b.fillStyle = "#6e4630";
      b.fillRect(ax + 2, 0, aw * 0.025, floorTop + ah * 0.1);
      b.fillRect(ax + aw * 0.975 - 2, 0, aw * 0.025, floorTop + ah * 0.1);
      b.fillRect(0, ah * 0.17, W, ah * 0.025);
      for (let x = (ax % 40) - 40; x < W; x += Math.max(26, aw * 0.08)) b.fillRect(x, 0, aw * 0.012, ah * 0.19);
      const leaves = ["#25704a", "#1d8a4c", "#43a857", "#7bd36a"];
      for (let x = -10, i = 0; x < W + 10; x += 9, i++) {
        const y = ah * 0.17 + Math.sin(i * 1.7) * ah * 0.025;
        blob(b, x, y, ah * (0.022 + ((i * 7) % 5) * 0.004), leaves[i % 4]!);
        if (i % 3 === 0) blob(b, x + 4, y - ah * 0.06, ah * 0.02, leaves[(i + 1) % 4]!);
      }
      for (const t of [0.08, 0.3, 0.55, 0.8]) {
        const gx = ax + aw * t;
        const gy = ah * 0.2;
        const gr = ah * 0.012;
        for (let r = 0; r < 4; r++) {
          for (let k = 0; k <= 3 - r; k++) blob(b, gx + (k - (3 - r) / 2) * gr * 1.7, gy + r * gr * 1.5, gr, k % 2 ? "#7a3596" : "#4f2463");
        }
      }
      // Warm sun from the right: a glow and a few soft shafts across the wall.
      g = b.createLinearGradient(W, 0, 0, ah);
      g.addColorStop(0, "rgba(255,190,90,0.35)");
      g.addColorStop(1, "rgba(120,90,200,0.12)");
      b.fillStyle = g;
      b.fillRect(0, 0, W, ah);
      b.fillStyle = "rgba(255,230,160,0.13)";
      for (let k = 0; k < 3; k++) {
        const x = ax + aw * (0.5 + k * 0.22);
        b.beginPath();
        b.moveTo(x, ah * 0.2);
        b.lineTo(x + aw * 0.08, ah * 0.2);
        b.lineTo(x - aw * 0.3, ah);
        b.lineTo(x - aw * 0.42, ah);
        b.fill();
      }
      // The pad's panel: dark basalt with a tufa lip.
      g = b.createLinearGradient(0, ah, 0, s.h);
      g.addColorStop(0, C.basalt3);
      g.addColorStop(1, C.basalt);
      b.fillStyle = g;
      b.fillRect(0, ah, W, s.h - ah);
      b.fillStyle = C.tufaDark;
      b.fillRect(0, ah, W, 4);
      return c;
    };

    const layout = (s: Size) => {
      const ph = s.h - ah;
      const r = clamp(Math.min(s.w * 0.085, ph * 0.16), 26, 40);
      const L = Math.max(12, ax + 8);
      const R = Math.min(s.w - 12, ax + aw - 8);
      const cy = ah + ph * 0.5;
      const cx = L + r * 2.5;
      const d = r * 1.5;
      btns = [
        { id: "left", x: cx - d, y: cy, r },
        { id: "right", x: cx + d, y: cy, r },
        { id: "up", x: cx, y: cy - d, r },
        { id: "down", x: cx, y: cy + d, r },
        { id: "a", x: R - r * 3.4, y: cy + r * 0.85, r: r * 1.15 },
        { id: "b", x: R - r * 1.15, y: cy - r * 0.2, r: r * 1.15 },
        { id: "c", x: R - r * 3.4, y: cy - r * 1.5, r: r * 0.95 },
      ];
      return btns.map((b) => ({ ...b, icon: "" }));
    };

    const fit = fitCanvas(canvas, (s) => {
      ah = Math.round(s.h * 0.62);
      aw = Math.min(s.w, ah * 1.7);
      ax = (s.w - aw) / 2;
      u = ah / 300;
      ww = aw / u;
      floorY = ah * 0.93;
      bg = paintBg(s);
      for (const f of [P, B]) f.x = clamp(f.x, 28, ww - 28);
    });
    const ctx = fit.ctx;
    const pad = createPad(canvas, layout);

    // Shading for the fighters: L is the sun's direction in the fighter's
    // local x (the sun is on the world's right, the fighter may be mirrored).
    let L = 1;
    const paint = (path: () => void, m: Mat, x: number, y: number, r: number, lw = 2.4) => {
      const g = ctx.createLinearGradient(x + L * r, y - r, x - L * r * 0.6, y + r);
      g.addColorStop(0, m[0]);
      g.addColorStop(0.45, m[1]);
      g.addColorStop(1, m[2]);
      path();
      ctx.fillStyle = g;
      ctx.fill();
      if (!lw) return;
      // Rim light: the shape's own edge, nudged away from the sun, clipped inside.
      ctx.save();
      ctx.clip();
      ctx.translate(-L * 2.4, 2.4);
      path();
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = "rgba(255,236,170,0.85)";
      ctx.stroke();
      ctx.restore();
      path();
      ctx.lineWidth = lw;
      ctx.strokeStyle = INK;
      ctx.stroke();
    };
    const circ = (x: number, y: number, r: number) => () => {
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
    };
    const ball = (x: number, y: number, r: number, m: Mat, lw = 2) => paint(circ(x, y, r), m, x, y, r, lw);
    const rr = (x: number, y: number, w: number, h: number, r: number, m: Mat) => paint(() => roundRect(ctx, x, y, w, h, r), m, x + w / 2, y + h / 2, Math.max(w, h) / 2);

    const reset = () => {
      for (const f of [P, B]) {
        Object.assign(f, { x: ww * (f.cpu ? 0.72 : 0.28), y: 0, vx: 0, vy: 0, kb: 0, face: f.cpu ? -1 : 1, hp: 100, chip: 100, st: "idle", t: 0, done: false, inv: 0, cd: 0, buf: "" });
      }
      discs = [];
      timer = ROUND;
      phase = "intro";
      phaseT = 0;
      api.sfx("tap");
    };
    reset();

    const setSt = (f: Fighter, st: State) => {
      f.st = st;
      f.t = 0;
      f.done = false;
    };

    const add = (x: number, y: number, k: number, n: number, sp: number, max: number, r: number, c = "#fffaf0") => {
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        const v = sp * rand(0.5, 1);
        bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + (k === 1 ? 90 : k ? 0 : 25), life: 0, max, r: k ? r : r * rand(0.6, 1.1), k, c });
      }
    };
    // Impact: a ring, a comic burst, sparks, flour and stars.
    const fx = (x: number, y: number, heavy: boolean, blocked: boolean) => {
      add(x, y, 3, 1, 0, 0.22, heavy ? 22 : 15, blocked ? "#bfe6ff" : "#fff6d0");
      add(x, y, 2, blocked ? 5 : heavy ? 11 : 7, heavy ? 340 : 260, 0.2, 0, blocked ? "#dff3ff" : "#fff0a0");
      if (blocked) return;
      add(x, y, 4, 1, 0, 0.13, heavy ? 30 : 19);
      add(x, y, 0, heavy ? 8 : 4, heavy ? 90 : 60, 0.55, heavy ? 10 : 7);
      add(x, y, 1, heavy ? 3 : 1, heavy ? 130 : 100, 0.75, 6);
    };

    // The Baker's brain. It only learns of the guest's attack after a human
    // delay; it guards more against mashing and counters what it blocks.
    const ai = { mv: 0, think: 0, react: 0, guard: 0, counter: 0, starts: [] as number[] };
    const lvl = () => Math.min(round, 3) - 1;

    const start = (f: Fighter, st: "punch" | "kick" | "throw") => {
      setSt(f, st);
      api.sfx("whoosh");
      if (!f.cpu) {
        ai.starts = ai.starts.filter((t) => now - t < 1.5);
        ai.starts.push(now);
        ai.react = now + rand(0.3, 0.4) - lvl() * 0.07;
      }
    };

    const endRound = (winner: Fighter) => {
      phase = "ko";
      phaseT = 0;
      const loser = winner === P ? B : P;
      setSt(loser, "ko");
      setSt(winner, "win");
      winner.wins++;
      discs = [];
      add(loser.x, 60, 4, 1, 0, 0.2, 36);
      add(loser.x, 60, 1, 7, 170, 1.1, 8);
      api.sfx(winner === P ? "win" : "lose");
      if (!calm) flash = 0.18;
      if (winner === P) bonus += 300 + Math.ceil(timer) * 5;
      if (winner.wins >= 2) {
        over = true;
        slow = 1.3;
        if (winner === P) bonus += 1000;
      }
      setScore();
    };

    // from: +1 when the blow travels to the right.
    const hurt = (att: Fighter, def: Fighter, dmg: number, from: number, hx: number, hy: number, heavy: boolean) => {
      if (def.inv > 0 || def.st === "ko" || phase !== "fight") return false;
      const blocked = def.st === "block" && def.face === -from;
      const d = blocked ? dmg * 0.15 : dmg;
      def.hp = Math.max(0, def.hp - d);
      def.kb = from * (blocked ? 110 : heavy ? 330 : 160);
      fx(hx, hy, heavy, blocked);
      if (blocked) {
        att.kb = -from * 70;
        def.fl = 0.12;
        // A blocked heavy leaves its user open for a moment.
        if (att.st === "kick") {
          setSt(att, "stag");
          att.stun = 0.5;
        }
        if (def.cpu && Math.random() < [0.3, 0.6, 0.9][lvl()]!) ai.counter = now + rand(0.04, 0.1);
        api.sfx("block");
      } else {
        setSt(def, "hit");
        def.stun = heavy ? 0.42 : 0.26;
        def.inv = def.stun + 0.04;
        def.vx = 0;
        if (heavy && def.y <= 0) def.vy = 150;
        def.fl = 0.1;
        api.sfx(heavy ? "heavy" : "hit");
        if (!calm) {
          shake = heavy ? 0.22 : 0.1;
          camX = from * (heavy ? 9 : 5);
        }
      }
      if (!calm) stop = blocked ? 0.04 : heavy ? 0.13 : 0.06;
      if (!att.cpu) {
        dealt += d;
        setScore();
      }
      if (def.hp <= 0) endRound(att);
      return true;
    };

    const act = (f: Fighter, o: Fighter, dt: number, i: Intent) => {
      f.t += dt;
      f.inv = Math.max(0, f.inv - dt);
      f.cd = Math.max(0, f.cd - dt);
      f.fl = Math.max(0, f.fl - dt);
      f.sq -= Math.sign(f.sq) * Math.min(Math.abs(f.sq), dt);
      const ground = f.y <= 0;
      const atk = f.st === "punch" || f.st === "kick" || f.st === "throw";
      if ((atk && f.t >= ATK[f.st as "punch"][0]) || ((f.st === "hit" || f.st === "stag") && f.t >= f.stun)) setSt(f, "idle");
      for (const k of ["c", "b", "a", "jump"] as const) {
        if (i[k]) {
          f.buf = k;
          f.bt = now;
        }
      }
      if (phase === "fight") {
        if (f.st === "punch" || f.st === "kick") {
          const [, on, off, reach, dmg] = ATK[f.st];
          const dx = (o.x - f.x) * f.face;
          if (!f.done && f.t >= on && f.t <= off && dx > 0 && dx < reach + 16 && Math.abs(o.y - f.y) < 55) {
            f.done = true;
            const heavy = f.st === "kick";
            hurt(f, o, dmg, f.face, f.x + f.face * (reach - 4), f.y + (heavy ? 40 : 62), heavy);
          }
          if (ground) f.vx = 0;
        } else if (f.st === "throw") {
          if (ground) f.vx = 0;
          if (!f.done && f.t >= ATK.throw[1]) {
            f.done = true;
            discs.push({ x: f.x + f.face * 30, vx: f.face * 230, owner: f, spin: 0 });
            api.sfx("whoosh");
          }
        } else if (f.st !== "hit" && f.st !== "stag") {
          f.face = o.x > f.x ? 1 : -1;
          // A press made up to 120 ms ago still comes out now.
          const k = now - f.bt <= BUFFER ? f.buf : "";
          if (k === "c" && f.cd <= 0) {
            start(f, "throw");
            f.cd = 3;
          } else if (k === "b") start(f, "kick");
          else if (k === "a") start(f, "punch");
          else if (k === "jump" && ground) {
            f.vy = 430;
            f.vx = i.mv * WALK * 1.15;
            f.sq = -0.12;
            setSt(f, "idle");
            api.sfx("jump");
          } else if (ground && i.block) {
            if (f.st !== "block") setSt(f, "block");
            f.vx = 0;
          } else if (ground) {
            f.vx = i.mv * WALK;
            const st: State = i.mv ? "walk" : "idle";
            if (f.st !== st) setSt(f, st);
          }
          if (k && (k !== "jump" || ground)) f.buf = "";
        }
      }
      if (f.st === "ko" || f.st === "win") f.vx = 0;
      if (!ground || f.vy > 0) {
        f.vy -= GRAV * dt;
        f.y += f.vy * dt;
        if (f.y <= 0) {
          f.y = 0;
          f.vy = 0;
          f.sq = 0.16;
          if (f.st === "idle") f.vx = 0;
          add(f.x - 12, 2, 0, 2, 40, 0.4, 6);
          add(f.x + 12, 2, 0, 2, 40, 0.4, 6);
          api.sfx("land");
        }
      }
      f.x = clamp(f.x + (f.vx + f.kb) * dt, 28, ww - 28);
      f.kb *= Math.exp(-7 * dt);
      f.chip = f.chip > f.hp ? Math.max(f.hp, f.chip - 30 * dt) : f.hp;
    };

    const cpu = (dt: number): Intent => {
      const l = lvl();
      const out: Intent = { mv: ai.mv, block: false, jump: false, a: false, b: false, c: false };
      const dx = P.x - B.x;
      const dist = Math.abs(dx);
      const dir = Math.sign(dx);
      // React to what the guest started a moment ago: a kick still winding
      // up can be blocked; a string of presses makes it hold its guard.
      if (ai.react && now >= ai.react) {
        ai.react = 0;
        const mash = ai.starts.filter((t) => now - t < 1.5).length >= 3;
        const live = (P.st === "kick" || P.st === "punch") && P.t < ATK[P.st][2];
        const p = mash ? [0.12, 0.45, 0.9][l]! : live ? [0.15, 0.35, 0.55][l]! : 0;
        if (dist < 95 && Math.random() < p) ai.guard = now + (mash ? 0.7 : 0.35);
      }
      if (ai.counter && now >= ai.counter) {
        ai.counter = 0;
        ai.guard = 0;
        if (dist < 50) out.a = true;
        else if (dist < 72) out.b = true;
        return out;
      }
      if (now < ai.guard) {
        out.block = true;
        out.mv = 0;
        return out;
      }
      ai.think -= dt;
      if (ai.think > 0) return out;
      ai.think = rand(0.42, 0.62) - l * 0.07;
      const r = Math.random();
      ai.mv = 0;
      const threat = discs.some((d) => d.owner === P && Math.abs(d.x - B.x) < 130 && Math.sign(B.x - d.x) === Math.sign(d.vx));
      if (threat && r < 0.25 + l * 0.2) {
        if (Math.random() < 0.5) out.jump = true;
        else ai.guard = now + 0.5;
      } else if (P.st === "stag" && dist < 72) out.b = true;
      else if (dist < 48) {
        if (r < 0.35 + l * 0.1) out.a = true;
        else if (r < 0.55 + l * 0.08) out.b = true;
        else if (r < 0.75) ai.mv = -dir;
      } else if (dist < 70) {
        if (r < 0.3 + l * 0.1) out.b = true;
        else ai.mv = dir;
      } else if (dist > 110 && B.cd <= 0 && r < 0.2 + l * 0.08) out.c = true;
      else {
        ai.mv = dir;
        if (r > 0.93) out.jump = true;
      }
      out.mv = ai.mv;
      return out;
    };

    const update = (rdt: number) => {
      // Hit-stop: the world freezes for a few frames; presses wait in the pad.
      if (stop > 0) {
        stop -= rdt;
        return;
      }
      let dt = rdt;
      if (slow > 0) {
        slow -= rdt;
        dt *= 0.3;
      }
      const s = pad.state;
      const me: Intent = { mv: (s.right ? 1 : 0) - (s.left ? 1 : 0), block: s.down, jump: pad.consume("up"), a: pad.consume("a"), b: pad.consume("b"), c: pad.consume("c") };
      now += dt;
      phaseT += dt;
      fightT = Math.max(0, fightT - dt);
      if (phase === "intro" && phaseT > 1.2) {
        phase = "fight";
        fightT = 0.6;
        api.sfx("whoosh");
      }
      if (phase === "ko" && phaseT > (over ? 2 : 1.9)) {
        if (over) {
          if (!reported) {
            reported = true;
            api.gameOver(score);
          }
          return;
        }
        round++;
        reset();
        return;
      }
      const idle: Intent = { mv: 0, block: false, jump: false, a: false, b: false, c: false };
      const fight = phase === "fight";
      act(P, B, dt, fight ? me : idle);
      act(B, P, dt, fight ? cpu(dt) : idle);
      // Keep the two bodies apart.
      const gap = B.x - P.x;
      if (Math.abs(gap) < 34 && Math.abs(P.y - B.y) < 60) {
        const push = ((34 - Math.abs(gap)) / 2) * (gap >= 0 ? 1 : -1);
        P.x = clamp(P.x - push, 28, ww - 28);
        B.x = clamp(B.x + push, 28, ww - 28);
      }
      for (const d of discs) {
        d.x += d.vx * dt;
        d.spin += dt * 14;
        const o = d.owner === P ? B : P;
        if (Math.abs(o.x - d.x) < 20 && o.y < 38 && hurt(d.owner, o, 12, Math.sign(d.vx), d.x, 46, true)) d.x = -999;
      }
      if (discs.length === 2 && Math.abs(discs[0]!.x - discs[1]!.x) < 20) {
        fx(discs[0]!.x, 46, true, false);
        api.sfx("block");
        discs = [];
      }
      discs = discs.filter((d) => d.x > -20 && d.x < ww + 20);
      for (const b of bits) {
        b.life += dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vy -= (b.k === 1 ? 300 : b.k ? 0 : 30) * dt;
        if (b.k === 2) {
          b.vx *= 0.85;
          b.vy *= 0.85;
        }
      }
      bits = bits.filter((b) => b.life < b.max);
      if (fight) {
        timer -= dt;
        if (timer <= 0) {
          timer = 0;
          endRound(B.hp > P.hp ? B : P); // a tie goes to the guest
        }
      }
    };

    // --- Drawing -----------------------------------------------------------

    // A head of radius 13 at 0,0 facing +x. mood: 0 calm, 1 hurt, 2 dizzy, 3 happy, 4 effort.
    const head = (baker: boolean, mood: number) => {
      if (!baker) {
        // Toque behind the head: three puffs on a band.
        for (const [x, y, r] of [[-8, -21, 7.5], [9, -21, 7.5], [0, -27, 9]] as const) ball(x, y, r, M.coat);
        rr(-11, -19, 23, 10, 2, M.coat);
      }
      ball(0, 0, 13, M.skin, 2.4);
      ctx.strokeStyle = INK;
      ctx.lineWidth = baker ? 2.6 : 1.8;
      ctx.beginPath();
      if (mood === 2) {
        for (const ex of [2, 8]) {
          ctx.moveTo(ex - 2, -5);
          ctx.lineTo(ex + 2, -1);
          ctx.moveTo(ex + 2, -5);
          ctx.lineTo(ex - 2, -1);
        }
      } else if (mood === 1) {
        ctx.moveTo(3, -6);
        ctx.lineTo(7, -3);
        ctx.lineTo(3, 0);
      } else if (mood === 3) ctx.arc(6, -2, 2.6, Math.PI, 0);
      else {
        ctx.moveTo(2, mood ? -9 : -8);
        ctx.lineTo(10, mood ? -5 : -7);
      }
      ctx.stroke();
      if (!mood || mood === 4) blob(ctx, 6, -2.5, 2.1, INK);
      ball(12.5, 2, 3.4, M.skin, 1.4);
      if (baker) {
        ctx.fillStyle = "#4a2f1e";
        ctx.beginPath();
        ctx.ellipse(7, 7, 8, 3.2, -0.15, 0, TAU);
        ctx.ellipse(-2, 6.5, 5, 2.6, 0.5, 0, TAU);
        ctx.fill();
        // Flat cap with a short peak.
        paint(() => {
          ctx.beginPath();
          ctx.ellipse(-1, -10, 16, 6.5, -0.08, 0, TAU);
        }, M.shirt, -1, -10, 16);
        paint(() => {
          ctx.beginPath();
          ctx.ellipse(12, -6.5, 7, 2.4, 0.25, 0, TAU);
        }, M.wood, 12, -6, 7, 1.8);
      } else {
        blob(ctx, 4, 6, 2.4, "#f38f86");
        ctx.beginPath();
        if (mood === 1 || mood === 2) ctx.arc(8, 10, 2.4, 0, TAU);
        else ctx.arc(8, 8, 3, 0.2, 2.2);
        ctx.stroke();
      }
    };

    const fighter = (f: Fighter) => {
      const baker = f.cpu;
      L = f.face;
      const sx = ax + f.x * u;
      // Soft cool floor shadow, cast a little away from the sun.
      const sh = 1 - Math.min(0.6, f.y / 160);
      ctx.fillStyle = "rgba(60,30,100,0.2)";
      for (const k of [1, 0.6]) {
        ctx.beginPath();
        ctx.ellipse(sx - 6 * u, floorY + 2, (baker ? 31 : 26) * u * sh * k, 6 * u * sh * k, 0, 0, TAU);
        ctx.fill();
      }
      ctx.save();
      const hop = f.st === "win" && !calm ? Math.abs(Math.sin(now * 6)) * 8 : 0;
      const jit = stop > 0 && f.st === "hit" ? rand(-1.5, 1.5) : 0;
      ctx.translate(sx + jit, floorY - (f.y + hop) * u);
      const q = (f.sq / 0.16) * 0.2;
      ctx.scale(f.face * u * (1 + q), u * (1 - q));
      if (f.fl > 0 && !calm) ctx.filter = "brightness(1.7) saturate(0.5)";
      const top = baker ? M.shirt : M.coat;
      const pants = baker ? M.brown : M.navy;
      const ko = f.st === "ko";
      const st = f.st;
      let hipY = -34 + Math.sin(now * 4 + (baker ? 1.3 : 0)) * 1.2;
      let lean = 0;
      let ff = [7, 0];
      let bf = [-9, 0];
      let knee: number[] | null = null;
      let fh = [16, -12];
      let bh = [-10, -10];
      let mood = 0;
      if (st === "walk") {
        const w = Math.sin(f.t * 12);
        ff = [7 + w * 9, -Math.max(0, w) * 4];
        bf = [-9 - w * 9, -Math.max(0, -w) * 4];
        hipY -= Math.abs(w) * 1.5;
      } else if (st === "punch") {
        const [, on, off] = ATK.punch;
        const e = f.t < on ? 0.6 + (0.4 * f.t) / on : f.t < off ? 1 : Math.max(0, 1 - (f.t - off) / 0.11);
        fh = [16 + 26 * e, -18 - 4 * e];
        bh = [-4, -16];
        bf = [-13, 0];
        lean = 0.16 * e;
        mood = 4;
      } else if (st === "throw") {
        const w = f.t < ATK.throw[1];
        const e = w ? 0 : Math.max(0, 1 - (f.t - 0.17) / 0.23);
        fh = w ? [-16, -36] : [18 + 22 * e, -22];
        lean = w ? -0.12 : 0.14 * e;
        mood = 4;
      } else if (st === "kick") {
        // Wind-up: knee chambered, body leaning back; then the leg snaps out.
        const [d, on, off] = ATK.kick;
        const x = f.t < on ? 0 : f.t < off ? 1 : Math.max(0, 1 - (f.t - off) / (d - off));
        const c = f.t < off ? Math.min(1, f.t / on) : x;
        knee = [6 + 10 * c + 14 * x, -14 - 14 * c - 4 * x];
        ff = [6 + 4 * c + 40 * x, -2 - 8 * c - 30 * x];
        bf = [-10 - 3 * c, 0];
        fh = [10, -28];
        bh = [-16, -24 + 4 * c];
        lean = -0.12 * c - 0.18 * x;
        mood = 4;
      } else if (st === "block") {
        hipY = -29;
        fh = [15, -40];
        bh = [12, -31];
        ff = [10, 0];
        bf = [-14, 0];
        lean = -0.1;
        mood = 4;
      } else if (st === "hit") {
        lean = -0.35;
        fh = [2, -40];
        bh = [-16, -36];
        mood = 1;
      } else if (st === "stag") {
        lean = -0.2 + (calm ? 0 : Math.sin(f.t * 22) * 0.1);
        fh = [12, -48];
        bh = [-20, -42];
        mood = 1;
      } else if (st === "win") {
        fh = [20, -50];
        mood = 3;
      } else if (ko) {
        hipY = -9;
        ff = [26, -2];
        bf = [18, 0];
        lean = -0.3 + Math.sin(now * 3) * (calm ? 0 : 0.08);
        fh = [12, 4];
        bh = [-14, 6];
        mood = 2;
      }
      if (f.y > 0 && !ko && st !== "kick") {
        ff = [10, -16];
        bf = [-6, -10];
      }
      const leg = (x0: number, p: number[], k: number[] | null) => {
        if (k) {
          limb(ctx, x0, hipY, k[0]!, k[1]!, 8.5, pants, L);
          limb(ctx, k[0]!, k[1]!, p[0]!, p[1]! - 3, 8, pants, L);
        } else limb(ctx, x0, hipY, p[0]!, p[1]! - 3, 8.5, pants, L);
        paint(() => {
          ctx.beginPath();
          ctx.ellipse(p[0]! + 3, p[1]! - 2, 6, 4.2, 0, 0, TAU);
        }, M.shoe, p[0]! + 3, p[1]!, 6, 1.6);
      };
      leg(-4, bf, null);
      leg(4, ff, knee);
      ctx.translate(0, hipY);
      ctx.rotate(lean);
      // Back arm, body, head, front arm with the tool.
      limb(ctx, -2, -24, bh[0]!, bh[1]!, 7, top, L);
      ball(bh[0]!, bh[1]!, 4.2, M.skin, 1.6);
      if (baker) {
        rr(-20, -31, 40, 38, 18, top);
        rr(-8, -18, 25, 25, 6, M.apron);
        limb(ctx, 2, -18, 2, -30, 1.4, C.tarragon);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        for (const [x, y] of [[-14, -22], [6, -8], [12, -2], [-4, -4], [10, -26], [-15, -8]]) ctx.fillRect(x!, y!, 2.2, 2.2);
      } else {
        rr(-14, -32, 28, 35, 9, top);
        for (let k = 0; k < 3; k++) {
          blob(ctx, 3, -22 + k * 7, 1.6, "#9aa6c0");
          blob(ctx, 9, -22 + k * 7, 1.6, "#9aa6c0");
        }
        const flap = Math.sin(now * 9) * (calm ? 0 : 2);
        paint(() => {
          ctx.beginPath();
          ctx.moveTo(-8, -30);
          ctx.lineTo(-21, -24 + flap);
          ctx.lineTo(-18, -17 + flap);
          ctx.lineTo(-4, -26);
          ctx.closePath();
        }, M.scarf, -12, -24, 8, 2);
        paint(() => {
          ctx.beginPath();
          ctx.ellipse(2, -30, 11, 4.5, 0, 0, TAU);
        }, M.scarf, 2, -30, 11, 2);
      }
      ctx.save();
      ctx.translate(3, -45);
      head(baker, mood);
      ctx.restore();
      const ang = Math.atan2(fh[1]! + 24, fh[0]! - 4);
      const cx = Math.cos(ang);
      const cy = Math.sin(ang);
      const [hx, hy] = [fh[0]!, fh[1]!];
      limb(ctx, 4, -24, hx, hy, 7.5, top, L);
      if (baker) {
        limb(ctx, hx + cy * 13, hy - cx * 13, hx - cy * 13, hy + cx * 13, 7, M.wood, L);
        limb(ctx, hx + cy * 17, hy - cx * 17, hx - cy * 17, hy + cx * 17, 2.5, M.wood, L);
      } else {
        limb(ctx, hx - cx * 3, hy - cy * 3, hx + cx * 15, hy + cy * 15, 2.2, M.steel, L);
        ball(hx + cx * 20, hy + cy * 20, 5.8, M.steel, 1.8);
      }
      ball(hx, hy, 4.6, M.skin, 1.6);
      ctx.filter = "none";
      if (st === "block") {
        // The guard: a cool shimmer in front, brighter when it takes a blow.
        ctx.strokeStyle = `rgba(190,232,255,${f.fl > 0 ? 0.95 : 0.5})`;
        ctx.lineWidth = f.fl > 0 ? 5 : 3;
        ctx.beginPath();
        ctx.arc(14, -32, 30, -1, 1);
        ctx.stroke();
      }
      if (ko || st === "stag") {
        for (let k = 0; k < 3; k++) {
          const a = now * 3 + (k * TAU) / 3;
          star(ctx, 3 + Math.cos(a) * 16, -64 + Math.sin(a) * 5, 4.5, now * 4);
        }
      }
      ctx.restore();
    };

    const disc = (d: Disc) => {
      const x = ax + d.x * u;
      const y = floorY - 46 * u;
      const r = 12 * u;
      const s = Math.sign(d.vx);
      ctx.strokeStyle = "rgba(255,250,235,0.75)";
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        ctx.moveTo(x - s * (r + 4), y - r * 0.5 + k * r * 0.5);
        ctx.lineTo(x - s * (r + 18 + k * 5), y - r * 0.5 + k * r * 0.5);
      }
      ctx.stroke();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(d.spin);
      L = 1;
      ball(0, 0, r, M.wood, 2);
      for (let k = 0; k < 5; k++) blob(ctx, Math.cos(k * 1.3) * r * 0.55, Math.sin(k * 2.1) * r * 0.5, r * 0.13, "#a8642e");
      ctx.restore();
    };

    // Icons for the pad and the HUD, drawn (no emoji).
    const icon = (id: PadButton, x: number, y: number, s: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s / 20, s / 20);
      L = 1;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      if (id === "a") {
        // Fist: knuckles, finger lines and the thumb across.
        rr(-10, -9, 20, 17, 6, M.skin);
        ctx.beginPath();
        for (const fx2 of [-4, 1, 5.5]) {
          ctx.moveTo(fx2, -9);
          ctx.lineTo(fx2, -3);
        }
        ctx.stroke();
        rr(-11, -1, 15, 7, 3.5, M.skin);
      } else if (id === "b") {
        // Boot.
        paint(() => {
          ctx.beginPath();
          ctx.moveTo(-8, -12);
          ctx.lineTo(1, -12);
          ctx.lineTo(1, -2);
          ctx.quadraticCurveTo(12, -1, 12, 6);
          ctx.lineTo(-8, 6);
          ctx.closePath();
        }, M.shoe, 0, -3, 12);
        ctx.fillStyle = C.apricot;
        ctx.fillRect(-7, 6, 18, 3);
      } else if (id === "c") {
        // Lavash: a flat, slightly wavy sheet with toasted spots.
        paint(() => {
          ctx.beginPath();
          ctx.ellipse(0, 0, 13, 9, -0.25, 0, TAU);
        }, M.wood, 0, 0, 13);
        for (const [px, py] of [[-5, -2], [3, -4], [5, 3], [-2, 4]] as const) blob(ctx, px, py, 1.6, "#a8642e");
      } else if (id === "down") {
        // Block: a shield.
        paint(() => {
          ctx.beginPath();
          ctx.moveTo(0, -11);
          ctx.lineTo(10, -7);
          ctx.quadraticCurveTo(9, 6, 0, 11);
          ctx.quadraticCurveTo(-9, 6, -10, -7);
          ctx.closePath();
        }, M.steel, 0, 0, 11);
      } else {
        const rot = { left: Math.PI, right: 0, up: -Math.PI / 2 }[id as "up"];
        ctx.rotate(rot);
        ctx.strokeStyle = C.matsoni;
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(-3, -8);
        ctx.lineTo(5, 0);
        ctx.lineTo(-3, 8);
        ctx.stroke();
      }
      ctx.restore();
    };

    const bar = (f: Fighter, left: boolean) => {
      const cx = ax + aw / 2;
      const bw = Math.min(aw * 0.34, 220);
      const bh = 13;
      const y = 12;
      const x0 = left ? cx - 32 - bw : cx + 32;
      ctx.fillStyle = "rgba(14,22,18,0.72)";
      roundRect(ctx, x0 - 3, y - 3, bw + 6, bh + 6, 9);
      ctx.fill();
      const part = (v: number, color: string | CanvasGradient) => {
        const w = (bw * v) / 100;
        if (w < 1) return;
        ctx.fillStyle = color;
        roundRect(ctx, left ? x0 : x0 + bw - w, y, w, bh, 6);
        ctx.fill();
      };
      const g = ctx.createLinearGradient(0, y, 0, y + bh);
      g.addColorStop(0, left ? C.tarragonLight : "#ff6b81");
      g.addColorStop(1, left ? C.tarragon : C.pomegranate);
      part(f.chip, "#fff1b8");
      part(f.hp, g);
      ctx.fillStyle = "rgba(255,255,255,0.3)";
      roundRect(ctx, x0 + 4, y + 2, bw - 8, 3, 2);
      ctx.fill();
      // Portrait medallion and the rounds won.
      const ix = left ? x0 + 14 : x0 + bw - 14;
      const iy = y + bh + 21;
      blob(ctx, ix, iy, 16, "rgba(14,22,18,0.72)");
      blob(ctx, ix, iy, 13.5, left ? C.tarragon : C.pomegranate);
      ctx.save();
      ctx.translate(ix - (left ? 1 : -1) * 1.5, iy + 3);
      ctx.scale((left ? 1 : -1) * 0.75, 0.75);
      L = left ? 1 : -1;
      head(f.cpu, f.st === "hit" || f.st === "stag" ? 1 : f.st === "ko" ? 2 : f.st === "win" ? 3 : 0);
      ctx.restore();
      for (let k = 0; k < 2; k++) {
        const mx = ix + (left ? 1 : -1) * (28 + k * 18);
        if (k < f.wins) star(ctx, mx, iy, 8, -Math.PI / 2);
        else blob(ctx, mx, iy, 4.5, "rgba(14,22,18,0.45)");
      }
    };

    // Round badge and the "fight" flash: shapes and numbers only.
    const badge = () => {
      const cx = ax + aw / 2;
      const cy = ah * 0.44;
      if (phase === "intro") {
        const p = Math.min(1, phaseT / 0.35);
        const k = calm ? 1 : 1 + Math.sin(p * Math.PI) * 0.35 * (1 - p) + (p - 1) * 0.4;
        const r = ah * 0.12 * k;
        star(ctx, cx, cy, r * 1.45, phaseT * (calm ? 0 : 1.2), 12, 0.78, round === 3 ? "#ff6b81" : C.apricot);
        blob(ctx, cx, cy, r, C.matsoni);
        ctx.lineWidth = 4;
        ctx.strokeStyle = INK;
        ctx.stroke();
        label(ctx, String(round), cx, cy + 2, r * 1.3, INK, "center", 800);
        for (let i = 0; i < 3; i++) blob(ctx, cx + (i - 1) * 16, cy + r * 1.75, 5, i < round ? C.apricot : "rgba(19,36,27,0.35)");
      }
      if (fightT > 0) {
        const t = 1 - fightT / 0.6;
        const k = calm ? 1 : 0.5 + t * 0.9;
        ctx.save();
        ctx.globalAlpha = Math.min(1, fightT * 3);
        ctx.translate(cx, cy);
        ctx.scale(k, k);
        star(ctx, 0, 0, ah * 0.16, 0.3, 9, 0.6, "#ffe14d");
        // Crossed ladle and rolling pin.
        L = 1;
        const s = ah * 0.11;
        limb(ctx, -s, s, s * 0.6, -s * 0.6, 3.5, M.steel, 1);
        ball(s * 0.75, -s * 0.75, s * 0.28, M.steel);
        limb(ctx, s, s, -s, -s, 9, M.wood, 1);
        ctx.restore();
      }
    };

    const trophy = (x: number, y: number) => {
      L = 1;
      paint(() => {
        ctx.beginPath();
        ctx.moveTo(x - 14, y - 16);
        ctx.lineTo(x + 14, y - 16);
        ctx.quadraticCurveTo(x + 13, y + 4, x, y + 6);
        ctx.quadraticCurveTo(x - 13, y + 4, x - 14, y - 16);
      }, M.gold, x, y - 5, 14);
      ctx.lineWidth = 3;
      ctx.strokeStyle = M.gold[2];
      ctx.beginPath();
      ctx.arc(x - 14, y - 9, 6, Math.PI * 0.5, Math.PI * 1.5);
      ctx.arc(x + 14, y - 9, 6, -Math.PI * 0.5, Math.PI * 0.5);
      ctx.stroke();
      rr(x - 3, y + 5, 6, 7, 1, M.gold);
      rr(x - 11, y + 11, 22, 6, 2, M.gold);
      star(ctx, x, y - 6, 5, -Math.PI / 2);
    };

    const draw = (dt: number) => {
      const s = fit.size();
      shake = Math.max(0, shake - dt);
      flash = Math.max(0, flash - dt);
      camX *= Math.exp(-9 * dt);
      const loser = P.st === "ko" ? P : B;
      const zt = phase === "ko" && over && !calm ? 1.18 : 1;
      zoom += (zt - zoom) * Math.min(1, dt * 3);
      ctx.clearRect(0, 0, s.w, s.h);
      if (bg) ctx.drawImage(bg, 0, 0, s.w, s.h);
      // The camera: a nudge towards each hit, shake, and a zoom on the final KO.
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, s.w, ah);
      ctx.clip();
      const fx0 = ax + loser.x * u;
      ctx.translate(fx0, floorY);
      ctx.scale(zoom, zoom);
      ctx.translate(-fx0 + camX + (shake > 0 ? rand(-4, 4) * shake * 5 : 0), -floorY + (shake > 0 ? rand(-3, 3) * shake * 5 : 0));
      if (bg) ctx.drawImage(bg, 0, 0, canvas.width, (ah * canvas.height) / s.h, -10, -10, s.w + 20, ah + 20);
      fighter(B);
      fighter(P);
      for (const d of discs) disc(d);
      for (const b of bits) {
        const k = 1 - b.life / b.max;
        const x = ax + b.x * u;
        const y = floorY - b.y * u;
        ctx.globalAlpha = Math.min(1, k * 1.6);
        if (b.k === 1) star(ctx, x, y, b.r * u, b.life * 8);
        else if (b.k === 2) {
          ctx.strokeStyle = b.c;
          ctx.lineWidth = 3.5 * u * k;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x - b.vx * 0.05 * u, y + b.vy * 0.05 * u);
          ctx.stroke();
        } else if (b.k === 3) {
          ctx.strokeStyle = b.c;
          ctx.lineWidth = 5 * k;
          ctx.beginPath();
          ctx.arc(x, y, b.r * u * (1 + (1 - k) * 1.6), 0, TAU);
          ctx.stroke();
        } else if (b.k === 4) star(ctx, x, y, b.r * u * (1.2 - k * 0.4), b.x, 8, 0.5, "#fff6c8");
        else blob(ctx, x, y, b.r * u * (1.6 - k * 0.6), b.c);
      }
      ctx.globalAlpha = 1;
      if (phase === "ko" && over) {
        const w = P.st === "win" ? P : B;
        trophy(ax + w.x * u, floorY - (135 + (calm ? 0 : Math.sin(now * 5) * 4)) * u);
      }
      ctx.restore();
      if (flash > 0) {
        ctx.fillStyle = `rgba(255,250,230,${Math.min(0.5, flash * 2.8)})`;
        ctx.fillRect(0, 0, s.w, ah);
      }
      // HUD: health bars, portraits, rounds won, the clock.
      bar(P, true);
      bar(B, false);
      const cx = ax + aw / 2;
      blob(ctx, cx, 21, 21, "rgba(14,22,18,0.72)");
      blob(ctx, cx, 21, 18, C.matsoni);
      label(ctx, String(Math.ceil(timer)), cx, 22, 18, timer < 10 ? C.pomegranate : INK, "center", 800);
      badge();
      // The pad: the engine places the hit areas; the buttons are drawn here.
      pad.draw(ctx, s);
      const tint: Partial<Record<PadButton, readonly [string, string]>> = {
        a: [C.apricot, C.apricotDeep],
        b: ["#e8455e", "#8e1a2f"],
        c: ["#f5d48a", "#b8873e"],
      };
      for (const b of btns) {
        const on = pad.state[b.id];
        const [face, lip] = tint[b.id] ?? ["#3d5046", "#16201a"];
        const y = b.y + (on ? 3 : 0);
        blob(ctx, b.x, b.y + 4, b.r, lip);
        blob(ctx, b.x, y, b.r, face);
        ctx.fillStyle = "rgba(255,255,255,0.22)";
        ctx.beginPath();
        ctx.ellipse(b.x - b.r * 0.15, y - b.r * 0.45, b.r * 0.55, b.r * 0.28, 0, 0, TAU);
        ctx.fill();
        if (on) blob(ctx, b.x, y, b.r, "rgba(255,255,255,0.18)");
        ctx.globalAlpha = b.id === "c" && P.cd > 0 ? 0.45 : 1;
        icon(b.id, b.x, y, b.r * 0.62);
        ctx.globalAlpha = 1;
        if (b.id === "c") {
          // Lavash cooldown ring.
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          ctx.strokeStyle = P.cd > 0 ? C.apricot : C.tarragonLight;
          ctx.beginPath();
          ctx.arc(b.x, b.y + 2, b.r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - P.cd / 3));
          ctx.stroke();
        }
      }
    };

    const stopLoop = loop(api, (dt, paused) => {
      if (!paused && !reported) update(dt);
      draw(paused ? 0 : dt);
    });

    return () => {
      stopLoop();
      pad.stop();
      fit.stop();
      canvas.style.touchAction = prevTouch;
    };
  },
};
