// "Kitchen Clash": a comic food fight between two cooks in a busy café
// kitchen. The tall Chef (the guest) and the round Cook (the phone) bonk each
// other with wooden spoons, ring each other's heads with frying pans, hide
// behind pot lids and lob tomatoes that splat on faces, the floor and the walls.
// A knocked-out cook sits down and a pot drops onto their head, stars circling;
// the winner dances. Best of three rounds. No words on the canvas: numbers and
// drawn shapes only.
//
// Art direction
// - Mood: the lunch rush gone silly; slapstick between two cooks, loud and
//   messy, never mean. The waiter peeks through the door porthole now and then.
// - Camera and scale: 2.5D side view, one static stage under a slightly raised
//   camera (tiled wall, stove, door, a checker floor in perspective); the world
//   is 300 units tall and scales to the arena, with small nudges and a KO zoom.
// - Shapes: the Chef tall and thin (huge toque, curled moustache, long legs),
//   the Cook short and round (bandana, unibrow, rosy cheeks); kitchen things are
//   soft rounded rectangles and circles.
// - Values: the fighters, their tools and the tomatoes carry the strongest
//   contrast (ink outlines, white coats, red splats); the kitchen sits in a
//   narrow, light range of cream, mint tile and brushed steel under a haze.
// - Palette: cream and mint tile for the room, copper for the pans, tarragon
//   (Chef) against pomegranate (Cook) in the HUD, tomato red for the mess, gold
//   for stars; key light warm from the right, shadows shifted cool to violet.
// - Detail: faces (four expressions), hands and props get the detail; the wall
//   behind the fight stays quiet, shelves and pans hang up out of the play line.
// - Rules: saturated 2.5D cartoon; bold ink outlines on the fighters and props
//   only; each fighter shape is shaded light-to-shadow from the right with a
//   warm rim light; soft cool floor shadows; no outlines in the background.
// - Signature: tomato and flour smears that stay on a face for a moment, and
//   tomato stains that pile up on the floor and walls as the match goes on.
import { C, clamp, createPad, fitCanvas, label, loop, rand, roundRect, type Game, type PadButton, type SfxKind, type Size } from "./engine";

type State = "idle" | "walk" | "spoon" | "pan" | "throw" | "block" | "hit" | "stag" | "ko" | "win";
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
  done: boolean; // this attack already landed (or the tomato left the hand)
  inv: number;
  cd: number;
  wins: number;
  sq: number; // squash (+) or stretch (-), decays to 0
  fl: number; // white hit flash
  sm: number; // a smear on the face, seconds left
  tom: boolean; // the smear is tomato (else flour)
  buf: string; // the last press, kept for 120 ms (input buffer)
  bt: number;
};
type Intent = { mv: number; block: boolean; jump: boolean; a: boolean; b: boolean; c: boolean };
type Tomato = { x: number; vx: number; owner: Fighter; spin: number };
// k: 0 flour puff, 1 star, 2 bonk streak, 3 ring, 4 impact burst, 5 tomato bit.
type Bit = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; k: number; c: string };
type Mat = readonly [string, string, string]; // light, base, cool shadow

const ROUND = 45;
const WALK = 105;
const GRAV = 1300;
const TAU = Math.PI * 2;
const INK = C.ink;
const RED = "#e2402a";
const BUFFER = 0.12;
const TOM_Y = 56; // the height a tomato flies at
// Attack timing in seconds: [duration, active from, active to, reach, damage].
// The spoon is light (out at once, short); the pan is heavy (wind-up, commits).
const ATK = { spoon: [0.22, 0.035, 0.11, 36, 6], pan: [0.56, 0.24, 0.34, 54, 13], throw: [0.4, 0.17, 0.17, 0, 0] } as const;
const M = {
  skin: ["#ffe2c4", "#f4bb92", "#c98488"],
  coat: ["#ffffff", "#f2efe9", "#b4bcd8"],
  shirt: ["#fff7e2", "#f5dfb6", "#c6aaa8"],
  apron: ["#5cc48e", "#23804f", "#1c4a58"],
  navy: ["#56698a", "#2d3b55", "#1a2036"],
  brown: ["#b88050", "#87562f", "#4c3046"],
  scarf: ["#ffd07a", "#f2a23a", "#c45a62"],
  band: ["#ff7a7a", "#d8283e", "#7c1838"],
  wood: ["#f6c890", "#d9a066", "#97606a"],
  steel: ["#ffffff", "#c9d2d8", "#7a84a8"],
  iron: ["#8f98ad", "#454b5c", "#1b1f2b"],
  copper: ["#ffc08a", "#d97a45", "#8a3e3a"],
  tomato: ["#ff8a6a", RED, "#8e1a3a"],
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

    // Layout in CSS px; the world is 300 units tall, the Chef about 140.
    let ax = 0;
    let aw = 1;
    let ah = 1;
    let u = 1;
    let ww = 300;
    let floorY = 1;
    let bg: HTMLCanvasElement | null = null;
    let btns: { id: PadButton; x: number; y: number; r: number }[] = [];
    let port = [0, 0, 1]; // the door's porthole: x, y, r in px
    let steam: number[][] = []; // pot tops that steam, in px

    const mk = (cpu: boolean): Fighter => ({
      cpu, x: 0, y: 0, vx: 0, vy: 0, kb: 0, face: 1, hp: 100, chip: 100, st: "idle", t: 0, stun: 0, done: false, inv: 0, cd: 0, wins: 0, sq: 0, fl: 0, sm: 0, tom: false, buf: "", bt: 0,
    });
    const P = mk(false);
    const B = mk(true);
    let toms: Tomato[] = [];
    let bits: Bit[] = [];
    let stains: { x: number; y: number; r: number }[] = [];
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
    let potDown = false; // the KO pot has landed

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
      const ft = ah * 0.64; // where the floor starts
      const tt = ah * 0.34; // where the tiles start
      const rect = (x: number, y: number, w: number, h: number, fill: string, r = 3) => {
        b.fillStyle = fill;
        roundRect(b, x, y, w, h, r);
        b.fill();
      };
      // Warm plaster above, pale mint tiles below with soft grout.
      b.fillStyle = "#f6e9d2";
      b.fillRect(0, 0, W, ft);
      b.fillStyle = "#e2eee3";
      b.fillRect(0, tt, W, ft - tt);
      b.strokeStyle = "rgba(110,140,125,0.25)";
      b.lineWidth = 1;
      const ts = Math.max(12, ah * 0.05);
      b.beginPath();
      for (let y = tt; y < ft; y += ts) {
        b.moveTo(0, y);
        b.lineTo(W, y);
      }
      for (let x = ax % ts; x < W; x += ts) {
        b.moveTo(x, tt);
        b.lineTo(x, ft);
      }
      b.stroke();
      b.fillStyle = "#eab9a0";
      b.fillRect(0, tt - 5, W, 6);
      // A shelf of jars, upper left.
      const sx = ax + aw * 0.04;
      const sw = aw * 0.36;
      const sy = ah * 0.27;
      const jars = ["#a8cf98", "#f4b56c", "#ea907e", "#e0cb8e", "#acd0dc", "#f4b56c"];
      for (let i = 0; i < 6; i++) {
        const jw = sw / 8;
        const jh = ah * (0.05 + (i % 3) * 0.013);
        const x = sx + 4 + (i * sw) / 6.2;
        rect(x, sy - jh, jw, jh, jars[i]!);
        rect(x - 1, sy - jh - 4, jw + 2, 5, "#c99a7a", 2);
        b.fillStyle = "rgba(255,255,255,0.45)";
        b.fillRect(x + jw * 0.18, sy - jh + 4, jw * 0.16, jh - 8);
      }
      rect(sx - 4, sy, sw + 8, 5, "#c99a6e", 1);
      // A rail of copper pans, top middle.
      const rx = ax + aw * 0.44;
      const ry = ah * 0.09;
      rect(rx - aw * 0.02, ry, aw * 0.45, 3, "#a89a8c", 1);
      for (let i = 0; i < 4; i++) {
        const x = rx + aw * (0.03 + i * 0.11);
        const r = ah * (0.034 + (i % 2) * 0.012);
        const y = ry + r * 2.4;
        rect(x - 1.5, ry, 3, r * 1.4, "#b07048", 1);
        blob(b, x, y, r, "#e6955f");
        blob(b, x, y, r * 0.72, "#cf7a48");
        b.fillStyle = "rgba(255,240,215,0.6)";
        b.fillRect(x + r * 0.2, y - r * 0.55, r * 0.18, r * 0.5);
      }
      // The stove on the left, two pots on top (their steam is drawn live).
      const kx = ax + aw * 0.03;
      const kw = aw * 0.36;
      const kt = ft - ah * 0.17;
      rect(kx, kt, kw, ft - kt + ah * 0.02, "#cfd4d8");
      rect(kx, kt, kw, 6, "#a7aeb6", 2);
      rect(kx + kw * 0.14, kt + ah * 0.065, kw * 0.72, ah * 0.07, "#8a929c", 5);
      for (let i = 0; i < 4; i++) blob(b, kx + kw * (0.2 + i * 0.2), kt + ah * 0.035, ah * 0.011, "#6e7580");
      steam = [];
      for (const [t, pw, ph, col] of [[0.27, 0.3, 0.07, "#b3bcc4"], [0.7, 0.24, 0.05, "#e6955f"]] as const) {
        const x = kx + kw * t;
        rect(x - (kw * pw) / 2, kt - ah * ph, kw * pw, ah * ph, col, 4);
        rect(x - (kw * pw) / 2 - 3, kt - ah * ph - 2, kw * pw + 6, 5, "#9aa3ac", 2);
        steam.push([x, kt - ah * ph - 4]);
      }
      // The swinging door to the café, right, with a porthole.
      const dw = aw * 0.17;
      const dx = ax + aw * 0.74;
      const dt = ft - ah * 0.37;
      rect(dx - 4, dt - 4, dw + 8, ft - dt + 4, "#d6c4ae");
      rect(dx, dt, dw, ft - dt, "#9cc6bb", 2);
      rect(dx + dw * 0.08, ft - ah * 0.06, dw * 0.84, ah * 0.045, "#cdd3d6", 2);
      port = [dx + dw / 2, dt + dw * 0.5, dw * 0.27];
      blob(b, port[0]!, port[1]!, port[2]! + 4, "#cdd3d6");
      blob(b, port[0]!, port[1]!, port[2]!, "#7f97a3");
      // Floor: cream and grey checks in perspective.
      b.fillStyle = "#efe8db";
      b.fillRect(0, ft, W, ah - ft);
      const cx = ax + aw / 2;
      const tw = aw / 8;
      const at = (i: number, y: number) => cx + i * tw * (0.75 + (0.95 * (y - ft)) / (ah - ft));
      b.fillStyle = "#d9d8cf";
      for (let j = 0; j < 6; j++) {
        const y0 = ft + (ah - ft) * (j / 6) ** 1.4;
        const y1 = ft + (ah - ft) * ((j + 1) / 6) ** 1.4;
        for (let i = -10 + (j % 2); i < 10; i += 2) {
          b.beginPath();
          b.moveTo(at(i, y0), y0);
          b.lineTo(at(i + 1, y0), y0);
          b.lineTo(at(i + 1, y1), y1);
          b.lineTo(at(i, y1), y1);
          b.fill();
        }
      }
      let g = b.createLinearGradient(0, ft, 0, ft + ah * 0.06);
      g.addColorStop(0, "rgba(70,40,90,0.25)");
      g.addColorStop(1, "rgba(70,40,90,0)");
      b.fillStyle = g;
      b.fillRect(0, ft, W, ah * 0.06);
      // Warm light from the right, cool towards the left: one soft wash.
      g = b.createLinearGradient(W, 0, 0, ah);
      g.addColorStop(0, "rgba(255,200,120,0.22)");
      g.addColorStop(1, "rgba(120,100,200,0.1)");
      b.fillStyle = g;
      b.fillRect(0, 0, W, ah);
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

    // Shading for the fighters: L is the light's direction in the fighter's
    // local x (the light is on the world's right, the fighter may be mirrored).
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
      // Rim light: the shape's own edge, nudged away from the light, clipped inside.
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
    const ell = (x: number, y: number, rx: number, ry: number, rot: number, m: Mat, lw = 2) =>
      paint(() => {
        ctx.beginPath();
        ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
      }, m, x, y, Math.max(rx, ry), lw);
    const ball = (x: number, y: number, r: number, m: Mat, lw = 2) => ell(x, y, r, r, 0, m, lw);
    const rr = (x: number, y: number, w: number, h: number, r: number, m: Mat) => paint(() => roundRect(ctx, x, y, w, h, r), m, x + w / 2, y + h / 2, Math.max(w, h) / 2);
    const tomato = (x: number, y: number, r: number, rot: number) => {
      ball(x, y, r, M.tomato, 2);
      star(ctx, x + Math.cos(rot - 1.57) * r * 0.75, y + Math.sin(rot - 1.57) * r * 0.75, r * 0.45, rot, 5, 0.4, C.tarragonLight);
    };

    const reset = () => {
      for (const f of [P, B]) {
        Object.assign(f, { x: ww * (f.cpu ? 0.72 : 0.28), y: 0, vx: 0, vy: 0, kb: 0, face: f.cpu ? -1 : 1, hp: 100, chip: 100, st: "idle", t: 0, done: false, inv: 0, cd: 0, sm: 0, buf: "" });
      }
      toms = [];
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
        bits.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + [25, 90, 0, 0, 0, 160][k]!, life: 0, max, r: k && k < 5 ? r : r * rand(0.6, 1.1), k, c });
      }
    };
    // A tomato goes splat: red bits, seeds and a stain where it landed.
    const splat = (x: number, y: number, n: number) => {
      add(x, y, 5, n, 260, 0.8, 5, RED);
      add(x, y, 5, n / 3, 170, 0.6, 2.4, "#ffd86b");
      stains.push({ x, y: y > 70 || x < 12 || x > ww - 12 ? y : 0, r: 9 + n / 2 });
      stains = stains.slice(-24);
    };
    // Impact. kind: 0 spoon, 1 pan, 2 tomato.
    const fx = (x: number, y: number, kind: number, blocked: boolean) => {
      add(x, y, 3, 1, 0, 0.22, kind === 1 ? 26 : 15, blocked ? "#bfe6ff" : kind === 2 ? "#ffb3a0" : "#fff6d0");
      if (kind === 2) return splat(x, y, blocked ? 6 : 14);
      add(x, y, 2, blocked ? 5 : kind ? 11 : 7, kind ? 340 : 260, 0.2, 0, blocked ? "#dff3ff" : "#fff0a0");
      if (blocked) return;
      add(x, y, 4, 1, 0, 0.13, kind ? 24 : 17, "#fff6c8");
      add(x, y, 0, kind ? 5 : 8, kind ? 90 : 70, 0.55, kind ? 8 : 9);
      add(x, y, 1, kind ? 4 : 2, kind ? 130 : 100, 0.75, 6);
    };

    // The Cook's brain. It only learns of the guest's attack after a human
    // delay; it guards more against mashing and counters what it blocks.
    const ai = { mv: 0, think: 0, react: 0, guard: 0, counter: 0, starts: [] as number[] };
    const lvl = () => Math.min(round, 3) - 1;
    const voice = (f: Fighter) => (f.cpu ? 1.2 : 0.85);

    // A cheer (or an "uh-oh") a moment after the knockout, once the "whoa" is out.
    let cheer: { at: number; kind: SfxKind } | null = null;

    const start = (f: Fighter, st: "spoon" | "pan" | "throw") => {
      setSt(f, st);
      api.sfx("whoosh");
      if (st === "pan") api.sfx("hah", voice(f));
      if (!f.cpu) {
        ai.starts = ai.starts.filter((t) => now - t < 1.5);
        ai.starts.push(now);
        ai.react = now + rand(0.3, 0.4) - lvl() * 0.07;
      }
    };

    const endRound = (winner: Fighter) => {
      phase = "ko";
      phaseT = 0;
      potDown = false;
      const loser = winner === P ? B : P;
      setSt(loser, "ko");
      setSt(winner, "win");
      winner.wins++;
      winner.kb = (winner.x > loser.x ? 1 : -1) * 160; // room to dance
      toms = [];
      add(loser.x, 60, 4, 1, 0, 0.2, 36, "#fff6c8");
      add(loser.x, 60, 0, 8, 120, 0.8, 10);
      api.sfx(winner === P ? "win" : "lose");
      api.sfx("whoa", voice(loser));
      cheer = { at: now + 1, kind: winner === P ? "yay" : "uhoh" };
      if (!calm) flash = 0.18;
      if (winner === P) bonus += 300 + Math.ceil(timer) * 5;
      if (winner.wins >= 2) {
        over = true;
        slow = 1.3;
        if (winner === P) bonus += 1000;
      }
      setScore();
    };

    // from: +1 when the blow travels to the right. kind: 0 spoon, 1 pan, 2 tomato.
    const hurt = (att: Fighter, def: Fighter, dmg: number, from: number, hx: number, hy: number, kind: number) => {
      if (def.inv > 0 || def.st === "ko" || phase !== "fight") return false;
      const heavy = kind > 0;
      const blocked = def.st === "block" && def.face === -from;
      const d = blocked ? dmg * 0.15 : dmg;
      def.hp = Math.max(0, def.hp - d);
      def.kb = from * (blocked ? 110 : heavy ? 330 : 160);
      fx(hx, hy, kind, blocked);
      if (blocked) {
        att.kb = -from * 70;
        def.fl = 0.12;
        // A blocked pan leaves its user open for a moment.
        if (att.st === "pan") {
          setSt(att, "stag");
          att.stun = 0.5;
          api.sfx("boing", 1.3);
        }
        if (def.cpu && Math.random() < [0.3, 0.6, 0.9][lvl()]!) ai.counter = now + rand(0.04, 0.1);
        api.sfx(kind === 2 ? "splat" : "block");
      } else {
        setSt(def, "hit");
        def.stun = heavy ? 0.42 : 0.26;
        def.inv = def.stun + 0.04;
        def.vx = 0;
        if (heavy && def.y <= 0) def.vy = 150;
        def.fl = 0.1;
        def.sm = 1.6;
        def.tom = kind === 2;
        // The one who got hit says so: "oof" for a spoon, "ouch!" for a pan,
        // and a tomato in the face is, after all, quite tasty.
        if (kind === 2) {
          api.sfx("splat");
          api.sfx("mmm", voice(def));
        } else if (kind) {
          def.sq = 0.16; // flattened for a moment
          api.sfx("heavy");
          api.sfx("clang");
          api.sfx("ouch", voice(def));
        } else {
          api.sfx("hit");
          api.sfx("pop", 0.6);
          api.sfx("oof", voice(def));
        }
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
      f.sm = Math.max(0, f.sm - dt);
      f.sq -= Math.sign(f.sq) * Math.min(Math.abs(f.sq), dt);
      const ground = f.y <= 0;
      const atk = f.st === "spoon" || f.st === "pan" || f.st === "throw";
      if ((atk && f.t >= ATK[f.st as "spoon"][0]) || ((f.st === "hit" || f.st === "stag") && f.t >= f.stun)) setSt(f, "idle");
      for (const k of ["c", "b", "a", "jump"] as const) {
        if (i[k]) {
          f.buf = k;
          f.bt = now;
        }
      }
      if (phase === "fight") {
        if (f.st === "spoon" || f.st === "pan") {
          const [, on, off, reach, dmg] = ATK[f.st];
          const dx = (o.x - f.x) * f.face;
          if (!f.done && f.t >= on && f.t <= off && dx > 0 && dx < reach + 16 && Math.abs(o.y - f.y) < 55) {
            f.done = true;
            // Both tools aim for the head.
            hurt(f, o, dmg, f.face, o.x - f.face * 8, o.y + (o.cpu ? 66 : 92), f.st === "pan" ? 1 : 0);
          }
          if (ground) f.vx = 0;
        } else if (f.st === "throw") {
          if (ground) f.vx = 0;
          if (!f.done && f.t >= ATK.throw[1]) {
            f.done = true;
            toms.push({ x: f.x + f.face * 30, vx: f.face * 230, owner: f, spin: 0 });
            api.sfx("whoosh");
          }
        } else if (f.st !== "hit" && f.st !== "stag") {
          f.face = o.x > f.x ? 1 : -1;
          // A press made up to 120 ms ago still comes out now.
          const k = now - f.bt <= BUFFER ? f.buf : "";
          if (k === "c" && f.cd <= 0) {
            start(f, "throw");
            f.cd = 3;
          } else if (k === "b") start(f, "pan");
          else if (k === "a") start(f, "spoon");
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
      // React to what the guest started a moment ago: a pan still winding
      // up can be blocked; a string of presses makes it hold its guard.
      if (ai.react && now >= ai.react) {
        ai.react = 0;
        const mash = ai.starts.filter((t) => now - t < 1.5).length >= 3;
        const live = (P.st === "pan" || P.st === "spoon") && P.t < ATK[P.st][2];
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
      const threat = toms.some((d) => d.owner === P && Math.abs(d.x - B.x) < 130 && Math.sign(B.x - d.x) === Math.sign(d.vx));
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
      if (cheer && now >= cheer.at) {
        api.sfx(cheer.kind, 0.9);
        cheer = null;
      }
      fightT = Math.max(0, fightT - dt);
      if (phase === "intro" && phaseT > 1.2) {
        phase = "fight";
        fightT = 0.6;
        api.sfx("whoosh");
        api.sfx("hah", 0.85);
      }
      if (phase === "ko") {
        // The pot lands on the loser's head.
        if (!potDown && phaseT > 0.55) {
          potDown = true;
          const lo = P.st === "ko" ? P : B;
          api.sfx("clang");
          api.sfx("boing", 0.9);
          add(lo.x, 64, 1, 4, 120, 0.9, 7);
          if (!calm) shake = 0.15;
        }
        if (phaseT > (over ? 2.4 : 2.2)) {
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
      for (const d of toms) {
        d.x += d.vx * dt;
        d.spin += dt * 10;
        const o = d.owner === P ? B : P;
        if (Math.abs(o.x - d.x) < 20 && o.y < 38 && hurt(d.owner, o, 12, Math.sign(d.vx), d.x, TOM_Y, 2)) d.x = -999;
        else if (d.x < 6 || d.x > ww - 6) {
          // A miss goes splat on the wall.
          splat(d.x, TOM_Y, 9);
          api.sfx("splat", 0.8);
          d.x = -999;
        }
      }
      if (toms.length === 2 && Math.abs(toms[0]!.x - toms[1]!.x) < 20) {
        splat(toms[0]!.x, TOM_Y + 20, 16);
        api.sfx("splat");
        toms = [];
      }
      toms = toms.filter((d) => d.x > -20);
      for (const b of bits) {
        b.life += dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vy -= [30, 300, 0, 0, 0, 800][b.k]! * dt;
        if (b.k === 2) {
          b.vx *= 0.85;
          b.vy *= 0.85;
        }
        if (b.y < 0) b.y = b.vx = b.vy = 0;
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

    // A head at 0,0 facing +x (Chef r 12, Cook r 14).
    // mood: 0 angry, 1 ouch, 2 dizzy, 3 happy, 4 yelling.
    const head = (cook: boolean, mood: number, hat = true) => {
      const r = cook ? 14 : 12;
      if (!cook && hat) {
        // The huge toque: a tall pleated column with a puffy crown.
        rr(-10, -44, 20, 34, 4, M.coat);
        for (const [x, y, s] of [[-9, -46, 9], [9, -46, 9], [0, -55, 11]] as const) ball(x, y, s, M.coat);
        rr(-12, -17, 24, 9, 3, M.coat);
      }
      ball(0, 0, r, M.skin, 2.4);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.9;
      ctx.beginPath();
      if (mood === 2) {
        // Spiral eyes.
        for (let a = 0; a < 9; a += 0.5) ctx.lineTo(6 + Math.cos(a + now * 8) * a * 0.42, -3 + Math.sin(a + now * 8) * a * 0.42);
      } else if (mood === 1) {
        ctx.moveTo(2, -7);
        ctx.lineTo(7, -3.5);
        ctx.lineTo(2, -0.5);
      } else if (mood === 3) ctx.arc(6, -2, 3, Math.PI, 0);
      else {
        // Angry brow: low towards the nose (the Cook's is a thick unibrow).
        ctx.lineWidth = cook ? 3.6 : 2.4;
        ctx.moveTo(cook ? -3 : 1, -10);
        ctx.lineTo(11, -5.5);
      }
      ctx.stroke();
      if (!mood || mood === 4) blob(ctx, 6.5, -2.5, 2.2, INK);
      // Mouth.
      const my = cook ? 8 : 10;
      ctx.lineWidth = 1.8;
      if (mood === 1 || mood === 4) {
        ctx.beginPath();
        ctx.ellipse(7, my, 3, mood === 1 ? 3.8 : 2.6, 0, 0, TAU);
        ctx.fillStyle = "#6b1f2e";
        ctx.fill();
        ctx.stroke();
      } else if (mood === 3) {
        ctx.beginPath();
        ctx.arc(6, my - 2, 4.5, 0.1, Math.PI - 0.3);
        ctx.closePath();
        ctx.fillStyle = "#6b1f2e";
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(3, my);
        if (mood) ctx.bezierCurveTo(5, my - 3, 7, my + 3, 10, my);
        else ctx.lineTo(10, my - 1);
        ctx.stroke();
      }
      ball(r - 0.5, 2, cook ? 4.6 : 3.6, M.skin, 1.4);
      if (cook) {
        blob(ctx, 2, 5, 3.2, "rgba(243,110,110,0.6)");
        // The bandana: a red cap with white dots and a knot at the back.
        L = -L;
        for (const s of [-1, 1]) ell(-15, -8 + s * 3, 6, 2.6, s * 0.5 + Math.sin(now * 7 + s) * (calm ? 0 : 0.15), M.band, 1.6);
        L = -L;
        paint(() => {
          ctx.beginPath();
          ctx.arc(0, -3, r + 1.5, Math.PI * 1.08, Math.PI * 1.95);
          ctx.closePath();
        }, M.band, 0, -10, r);
        for (const [x, y] of [[-7, -12], [1, -15], [7, -11], [-2, -9]] as const) blob(ctx, x, y, 1.4, "#fff");
      } else {
        // A big curled moustache that droops when dizzy.
        const d = mood === 2 ? -1 : 1;
        ctx.strokeStyle = "#3b2416";
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.moveTo(1, 5 - 4 * d);
        ctx.quadraticCurveTo(4, 5 + 4 * d, 11, 6);
        ctx.quadraticCurveTo(18, 5 + 4 * d, 20, 5 - 4 * d);
        ctx.stroke();
      }
    };

    const fighter = (f: Fighter) => {
      const cook = f.cpu;
      L = f.face;
      const sx = ax + f.x * u;
      const sy = cook ? -21 : -31; // shoulder height in the hip frame
      // Soft cool floor shadow, cast a little away from the light.
      const sh = 1 - Math.min(0.6, f.y / 160);
      ctx.fillStyle = "rgba(60,30,100,0.2)";
      for (const k of [1, 0.6]) {
        ctx.beginPath();
        ctx.ellipse(sx - 6 * u, floorY + 2, (cook ? 32 : 24) * u * sh * k, 6 * u * sh * k, 0, 0, TAU);
        ctx.fill();
      }
      ctx.save();
      const w = calm ? 0 : Math.sin(now * 9);
      const hop = f.st === "win" ? Math.abs(w) * 9 : 0;
      const jit = stop > 0 && f.st === "hit" ? rand(-1.5, 1.5) : 0;
      ctx.translate(sx + jit, floorY - (f.y + hop) * u);
      const q = (f.sq / 0.16) * 0.2;
      ctx.scale(f.face * u * (1 + q), u * (1 - q));
      if (f.fl > 0 && !calm) ctx.filter = "brightness(1.6) saturate(0.6)";
      const top = cook ? M.shirt : M.coat;
      const pants = cook ? M.brown : M.navy;
      const ko = f.st === "ko";
      const st = f.st;
      let hipY = (cook ? -27 : -42) + Math.sin(now * 4 + (cook ? 1.3 : 0)) * 1.2;
      let lean = 0;
      let ff = [7, 0];
      let bf = [-9, 0];
      let fh = [16, sy + 12];
      let bh = [-10, sy + 14];
      let mood = 0;
      let tool = 0; // in the front hand: 0 spoon, 1 pan, 2 lid, 3 tomato, -1 nothing
      if (st === "walk") {
        const k = Math.sin(f.t * 12);
        ff = [7 + k * 9, -Math.max(0, k) * 4];
        bf = [-9 - k * 9, -Math.max(0, -k) * 4];
        hipY -= Math.abs(k) * 1.5;
      } else if (st === "spoon") {
        // Bonk: up and over onto the head.
        const [, on, off] = ATK.spoon;
        const e = f.t < on ? (0.6 * f.t) / on : f.t < off ? 1 : Math.max(0, 1 - (f.t - off) / 0.11);
        fh = [12 + 26 * e, sy - 14 + 12 * e];
        bh = [-4, sy + 8];
        bf = [-13, 0];
        lean = 0.18 * e;
        mood = 4;
      } else if (st === "throw") {
        const k = f.t < ATK.throw[1];
        const e = k ? 0 : Math.max(0, 1 - (f.t - 0.17) / 0.23);
        fh = k ? [-14, sy - 14] : [18 + 20 * e, sy + 2];
        lean = k ? -0.12 : 0.14 * e;
        tool = k ? 3 : -1;
        mood = 4;
      } else if (st === "pan") {
        // Wind-up: the pan goes up behind the head; then it comes down, BONK.
        const [d, on, off] = ATK.pan;
        const x = f.t < on ? 0 : f.t < off ? 1 : Math.max(0, 1 - (f.t - off) / (d - off));
        const c = f.t < off ? Math.min(1, f.t / on) : x;
        fh = [8 - 18 * c + 40 * x, sy + 10 - 34 * c + 30 * x];
        bh = [-14, sy + 4];
        ff = [12 + 6 * x, 0];
        bf = [-14, 0];
        lean = -0.15 * c + 0.3 * x;
        tool = 1;
        mood = 4;
      } else if (st === "block") {
        hipY += 5;
        fh = [17, sy + 2];
        bh = [12, sy + 10];
        ff = [10, 0];
        bf = [-14, 0];
        lean = -0.1;
        tool = 2;
        mood = 4;
      } else if (st === "hit") {
        lean = -0.35;
        fh = [2, sy - 14];
        bh = [-16, sy - 10];
        mood = 1;
      } else if (st === "stag") {
        lean = -0.2 + w * 0.1;
        fh = [12, sy - 22];
        bh = [-20, sy - 16];
        mood = 2;
      } else if (st === "win") {
        // A little victory dance: hop, sway, wave the spoon.
        lean = w * 0.14;
        fh = [24, sy - 20 - 6 * w];
        bh = [-14, sy - 22 + 6 * w];
        ff = [7, -Math.max(0, w) * 7];
        bf = [-9, -Math.max(0, -w) * 7];
        mood = 3;
      } else if (ko) {
        hipY = -9;
        ff = [26, -2];
        bf = [18, 0];
        lean = -0.3 + w * 0.06;
        fh = [14, 6];
        bh = [-14, 8];
        mood = 2;
        tool = -1;
      }
      if (f.y > 0 && !ko) {
        ff = [10, -16];
        bf = [-6, -10];
      }
      const leg = (x0: number, p: number[]) => {
        limb(ctx, x0, hipY, p[0]!, p[1]! - 3, cook ? 9 : 7.5, pants, L);
        ell(p[0]! + 3, p[1]! - 2, 6, 4.2, 0, M.shoe, 1.6);
      };
      leg(-4, bf);
      leg(4, ff);
      ctx.translate(0, hipY);
      ctx.rotate(lean);
      // Back arm, body, head, front arm with the tool.
      limb(ctx, -2, sy + 4, bh[0]!, bh[1]!, 7, top, L);
      ball(bh[0]!, bh[1]!, 4.2, M.skin, 1.6);
      if (cook) {
        rr(-22, -28, 44, 36, 18, top);
        rr(-8, -16, 26, 24, 6, M.apron);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        for (const [x, y] of [[-14, -20], [6, -6], [12, 0], [-4, -2], [10, -24], [-15, -6]]) ctx.fillRect(x!, y!, 2.2, 2.2);
      } else {
        rr(-11, -38, 22, 42, 8, top);
        for (let k = 0; k < 4; k++) blob(ctx, 5, -28 + k * 7, 1.6, "#9aa6c0");
        ell(2, -37, 10, 4.2, 0, M.scarf, 2);
      }
      ctx.save();
      ctx.translate(3, cook ? -35 : -50);
      head(cook, mood, !ko);
      // A smear on the face for a moment: tomato or flour.
      if (f.sm > 0) {
        ctx.globalAlpha = Math.min(1, f.sm * 2);
        const c = f.tom ? RED : "#ffffff";
        for (const [x, y, s] of [[6, -1, 5.5], [10, 4, 3.8], [1, 3, 3.4], [3, -7, 2.6]] as const) blob(ctx, x, y, s, c);
        ctx.fillStyle = c;
        ctx.fillRect(8.5, 4, 2.6, 7 + (1.6 - f.sm) * 5);
        if (f.tom) for (const [x, y] of [[5, -2], [8, 1], [2, 2]] as const) blob(ctx, x, y, 0.9, "#ffd86b");
        ctx.globalAlpha = 1;
      }
      if (ko) {
        // A pot falls from above and lands on the head; stars circle it.
        const d = clamp(1 - (phaseT - 0.3) / 0.25, 0, 1);
        ctx.translate(0, -d * d * 240);
        L = 1;
        rr(-16, -24, 32, 22, 5, M.copper);
        rr(-19, -5, 38, 6, 3, M.copper);
        for (const s of [-1, 1]) limb(ctx, s * 16, -17, s * 23, -14, 3, M.iron);
        if (!d) {
          for (let k = 0; k < 4; k++) {
            const a = now * 3 + (k * TAU) / 4;
            star(ctx, Math.cos(a) * 22, -32 + Math.sin(a) * 6, 4.5, now * 4);
          }
        }
      }
      if (st === "stag") {
        for (let k = 0; k < 3; k++) {
          const a = now * 3 + (k * TAU) / 3;
          star(ctx, Math.cos(a) * 16, (cook ? -26 : -74) + Math.sin(a) * 5, 4.5, now * 4);
        }
      }
      ctx.restore();
      L = f.face;
      const [hx, hy] = [fh[0]!, fh[1]!];
      const ang = Math.atan2(hy - sy, hx - 4);
      const cx = Math.cos(ang);
      const cy = Math.sin(ang);
      limb(ctx, 4, sy + 4, hx, hy, 7.5, top, L);
      if (tool === 1) {
        // The frying pan, with a swoosh while it swings.
        if (f.t > ATK.pan[1] && f.t < ATK.pan[2] + 0.05) {
          ctx.strokeStyle = "rgba(255,255,255,0.7)";
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.arc(4, sy, 44, -2.2, 0.4);
          ctx.stroke();
        }
        limb(ctx, hx - cx * 2, hy - cy * 2, hx + cx * 14, hy + cy * 14, 3.4, M.wood, L);
        ball(hx + cx * 25, hy + cy * 25, 11.5, M.iron, 2.2);
        blob(ctx, hx + cx * 25, hy + cy * 25, 7.5, "#2a2f3c");
      } else if (!tool) {
        limb(ctx, hx - cx * 3, hy - cy * 3, hx + cx * 14, hy + cy * 14, 2.6, M.wood, L);
        ell(hx + cx * 19, hy + cy * 19, 5.5, 3.8, ang, M.wood, 1.8);
      } else if (tool === 3) tomato(hx + cx * 6, hy + cy * 6, 6.5, 0);
      ball(hx, hy, 4.6, M.skin, 1.6);
      if (tool === 2) {
        // The pot lid guard, ringing when it takes a blow.
        ell(hx + 6, hy, 4.5, 17, 0, M.steel, 2);
        ball(hx + 11, hy, 2.8, M.iron, 1.4);
        if (f.fl > 0) {
          ctx.strokeStyle = "rgba(190,232,255,0.95)";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(hx + 6, hy, 24, -1, 1);
          ctx.stroke();
        }
      }
      ctx.filter = "none";
      ctx.restore();
    };

    // Icons for the pad, drawn (no emoji).
    const icon = (id: PadButton, x: number, y: number, s: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(s / 20, s / 20);
      L = 1;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      if (id === "a") {
        // Wooden spoon.
        limb(ctx, -10, 11, 3, -2, 3.4, M.wood);
        ell(6, -6, 7.5, 5, -0.8, M.wood);
      } else if (id === "b") {
        // Frying pan.
        limb(ctx, -12, 10, -3, 2, 4.4, M.wood);
        ball(4, -4, 11, M.iron, 2.4);
        blob(ctx, 4, -4, 7, "#2a2f3c");
      } else if (id === "c") tomato(0, 1, 11, 0);
      else if (id === "down") {
        // Pot lid.
        paint(() => {
          ctx.beginPath();
          ctx.ellipse(0, 4, 13, 9, 0, Math.PI, 0);
          ctx.closePath();
        }, M.steel, 0, 0, 13);
        ball(0, -6, 3.5, M.iron, 1.6);
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
      ctx.clip();
      ctx.translate(ix - (left ? 1 : -1) * 1.5, iy + (f.cpu ? 4 : 8));
      ctx.scale((left ? 1 : -1) * 0.72, 0.72);
      L = left ? 1 : -1;
      head(f.cpu, f.st === "hit" ? 1 : f.st === "ko" || f.st === "stag" ? 2 : f.st === "win" ? 3 : 0);
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
        // A crossed spoon and pan.
        ctx.scale(ah * 0.005, ah * 0.005);
        icon("a", -5, 0, 20);
        icon("b", 6, 0, 20);
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

    // The live parts of the kitchen: steam off the pots and the waiter who
    // peeks through the porthole now and then (and always at a knockout).
    const room = () => {
      for (const [x, y] of steam) {
        for (let k = 0; k < 3; k++) {
          const p = (now * 0.45 + k / 3) % 1;
          blob(ctx, x! + Math.sin(p * 6 + k) * 6, y! - p * ah * 0.1, ah * (0.01 + p * 0.022), `rgba(255,255,255,${0.55 * (1 - p)})`);
        }
      }
      const t = now % 7;
      const pk = phase === "ko" ? 1 : clamp(Math.min(t, 2.2 - t) * 4, 0, 1);
      const [px, py, pr] = port as [number, number, number];
      if (pk > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, pr, 0, TAU);
        ctx.clip();
        const x = px + (1 - pk) * pr * 2;
        const y = py + pr * 0.3;
        blob(ctx, x, y, pr * 0.78, "#f4bb92");
        ctx.fillStyle = "#3a2a24";
        ctx.beginPath();
        ctx.arc(x, y - pr * 0.1, pr * 0.8, Math.PI * 1.05, Math.PI * 1.95);
        ctx.fill();
        for (const s of [-1, 1]) {
          blob(ctx, x + s * pr * 0.25 - pr * 0.12, y, pr * 0.2, "#fff");
          blob(ctx, x + s * pr * 0.25 - pr * 0.2, y, pr * 0.09, INK);
        }
        blob(ctx, x - pr * 0.12, y + pr * 0.42, pr * (phase === "ko" ? 0.16 : 0.09), "#6b1f2e");
        ctx.restore();
      }
      ctx.strokeStyle = "rgba(255,255,255,0.6)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(px, py, pr * 0.7, -2.6, -1.6);
      ctx.stroke();
      // Tomato stains: flat on the floor, splashed on the walls.
      for (const s of stains) {
        const x = ax + s.x * u;
        const r = s.r * u;
        const c = "#d24733";
        if (s.y) {
          const y = floorY - s.y * u;
          for (let k = 0; k < 6; k++) blob(ctx, x + Math.cos(k * 2.4 + s.r) * r * 0.8, y + Math.sin(k * 2.4) * r * 0.8, k ? r * 0.3 : r * 0.7, c);
          ctx.fillRect(x - u, y, 2.4 * u, r * 1.6);
        } else {
          ctx.beginPath();
          ctx.ellipse(x, floorY + 3, r * 1.5, r * 0.35, 0, 0, TAU);
          ctx.fill();
        }
      }
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
      if (bg) ctx.drawImage(bg, 0, 0, canvas.width, (ah * canvas.height) / s.h, 0, 0, s.w, ah);
      room();
      fighter(B);
      fighter(P);
      for (const d of toms) {
        const x = ax + d.x * u;
        const y = floorY - TOM_Y * u;
        const sg = Math.sign(d.vx);
        ctx.strokeStyle = "rgba(255,250,235,0.75)";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let k = 0; k < 3; k++) {
          ctx.moveTo(x - sg * 14 * u, y + (k - 1) * 5 * u);
          ctx.lineTo(x - sg * (26 + k * 6) * u, y + (k - 1) * 5 * u);
        }
        ctx.stroke();
        L = 1;
        tomato(x, y, 9 * u, d.spin);
      }
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
        } else if (b.k === 4) star(ctx, x, y, b.r * u * (1.2 - k * 0.4), b.x, 8, 0.5, b.c);
        else blob(ctx, x, y, b.r * u * (b.k ? 1 : 1.6 - k * 0.6), b.c);
      }
      ctx.globalAlpha = 1;
      if (phase === "ko" && over) {
        const w = P.st === "win" ? P : B;
        trophy(ax + w.x * u, floorY - ((w.cpu ? 110 : 165) + (calm ? 0 : Math.sin(now * 5) * 4)) * u);
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
        c: ["#bfe3c8", "#5f9a72"],
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
          // Tomato cooldown ring.
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
