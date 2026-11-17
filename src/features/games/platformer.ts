// "Rooftop Cat": a ginger cat runs across Yerevan rooftops at sunset, jumps
// gaps, stomps pigeons, picks apricots and reaches the café door. Three short
// hand-made levels. No words on the canvas.
import { C, clamp, createPad, fitCanvas, label, loop, pick, rand, roundRect, type Game, type Size } from "./engine";

// Tile maps, 10 rows each (falling below the last row costs a life).
// Solid: # tufa, = tin roof, W water tank, H chimney.
// One-way (jump up through): - plank, ~ laundry line. Decor: A antenna.
// Things: P start, o apricot, G golden apricot, p pigeon, f flying pigeon,
// K checkpoint, D café door.
const LEVELS: string[][] = [
  [
    "",
    "",
    "",
    "",
    "                    oooo               ooo                                    oo     oooo",
    "                    ----             ~~~~~~~  o         G                 p          ----",
    "               oo                 H  K                                 ######    K H",
    "  P  ooo  A              p       ############      p    W  oo      A   ######   #############    oo p   A   D",
    "###############  ==============  ############   ###############  ======######   #############  =================",
    "###############  ##############  ############   ###############  ############   #############  #################",
  ],
  [
    "",
    "",
    "",
    "                                                               G",
    "                  ooo                                     p           ooo",
    "                 -----       oooo       o               ======       ------     o  o  o",
    "             oo  H  p       ~~~~~~                  oop ######    K   p    p   ~~~~~~~                oo",
    "  P   oo A     ============         K   W         ############   #############          pA W         ######     oop  H   D",
    "############   ############        ############   ############   #############         ===========   ######   ################",
    "############   ############        ############   ############   #############         ###########   ######   ################",
  ],
  [
    "",
    "",
    "                                                                                f",
    "                                     Goo    f                                                                    f",
    "             f      o                ----                     f         p     ooo                 f",
    "                                      p              ooo              ###### ~~~~~                          p              G",
    "             o   p  W               ###### ~~~~     -----     o   H   ######         K  W  p      oo      #####          ----",
    "  P   ooo       ==========      K   ######       K  p  A p      ############        ============       oo #####     K   p     p   A  D",
    "############    ##########    ############      ============    ############        ############    ###########    =======================",
    "############    ##########    ############      ############    ############        ############    ###########    #######################",
  ],
];

const ROWS = 10;
// Physics in tiles and seconds. A full jump rises 3.3 tiles and clears about
// 4.8 tiles of flat gap at full run; the maps never ask for more than a
// 4-tile gap or a 2-tile step.
const RUN = 7;
const ACC = 48;
const AIR = 34;
const FRICTION = 42;
const GRAVITY = 55;
const JUMP = 19;
const MAX_FALL = 20;
const COYOTE = 0.09;
const BUFFER = 0.1;
const HW = 0.35; // cat half width
const CH = 0.8; // cat height
const TAU = Math.PI * 2;

type Foe = { x: number; y: number; vx: number; fly: boolean; bx: number; by: number; t: number; dead: boolean };
type Item = { x: number; y: number; gold: boolean; got: boolean };
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; kind: number; txt?: string };

const ORANGE = "#e8873a";
const ORANGE_DARK = "#b85f1e";
const GOLD = "#ffd23f";
const CLOTHES = [C.pomegranate, C.matsoni, C.tarragonLight, C.apricot, "#6b8fd6"];

// Stable pseudo-random 0..1 per integer (skylines, laundry).
const hash = (i: number) => {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export const game: Game = {
  mount(api) {
    const canvas = api.canvas;
    const calm = api.reducedMotion;
    const prevTouch = canvas.style.touchAction;
    canvas.style.touchAction = "none";

    let viewH = 1;
    let T = 32;
    const fit = fitCanvas(canvas, (s: Size) => {
      viewH = Math.round(s.h * 0.65);
      T = Math.max(16, viewH / ROWS);
    });
    const ctx = fit.ctx;
    const pad = createPad(canvas, (s) => {
      const vh = Math.round(s.h * 0.65);
      const r = clamp(Math.min(s.w * 0.11, (s.h - vh) * 0.3), 30, 44);
      const cy = vh + (s.h - vh) / 2;
      return [
        { id: "left", x: 18 + r, y: cy, r, icon: "◂" },
        { id: "right", x: 36 + r * 3, y: cy, r, icon: "▸" },
        { id: "a", x: s.w - 18 - r * 1.3, y: cy, r: r * 1.3, icon: "⤒" },
      ];
    });

    // Small drawing helpers
    const box = (col: string | CanvasGradient, x: number, y: number, w: number, h: number) => {
      ctx.fillStyle = col;
      ctx.fillRect(x, y, w, h);
    };
    const oval = (col: string, x: number, y: number, rx: number, ry = rx, rot = 0) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
      ctx.fill();
    };
    const shape = (col: string, pts: number[]) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
      ctx.fill();
    };
    // Stroked segments: [x1, y1, x2, y2, x1, y1, ...]
    const lines = (col: string, w: number, pts: number[]) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 4) {
        ctx.moveTo(pts[i]!, pts[i + 1]!);
        ctx.lineTo(pts[i + 2]!, pts[i + 3]!);
      }
      ctx.stroke();
    };

    // Run state
    let level = 0;
    let lives = 3;
    let score = 0;
    let fruit = 0;
    let state: "play" | "dead" | "win" | "end" = "play";
    let stateT = 0;
    let levelT = 0;
    let time = 0;
    let reported = false;
    let shake = 0;

    // Level state
    let map: string[] = [];
    let W = 0;
    let foes: Foe[] = [];
    let items: Item[] = [];
    let checks: { x: number; y: number; on: boolean }[] = [];
    let door = { x: 0, y: 0 };
    let sparks: Spark[] = [];
    let cp = { x: 0, y: 0 };
    let camX = 0;

    // The cat: x is the centre, y the feet, both in tiles
    let x = 0;
    let y = 0;
    let vx = 0;
    let vy = 0;
    let face = 1;
    let ground = false;
    let coyote = 0;
    let buffer = 0;
    let hurtT = 0;
    let runT = 0;

    const at = (c: number, r: number) => (c < 0 || c >= W ? "#" : (map[r]?.[c] ?? " "));
    const solid = (c: number, r: number) => "#=WH".includes(at(c, r));
    const oneWay = (c: number, r: number) => "-~".includes(at(c, r));

    const addScore = (n: number, px: number, py: number) => {
      score += n;
      api.setScore(score);
      if (n >= 50) sparks.push({ x: px, y: py, vx: 0, vy: -1.5, life: 0, max: 0.9, col: "", kind: 2, txt: `+${n}` });
    };
    const burst = (px: number, py: number, n: number, col: string, kind = 0, speed = 4) => {
      for (let i = 0; i < n; i++) {
        const a = rand(0, TAU);
        const v = rand(1, speed);
        sparks.push({ x: px, y: py, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 0, max: rand(0.4, 0.8), col, kind });
      }
    };

    const respawn = () => {
      x = cp.x;
      y = cp.y;
      vx = vy = 0;
      face = 1;
      hurtT = 1.2;
      state = "play";
    };
    const load = (n: number) => {
      const rows = LEVELS[n]!;
      W = Math.max(...rows.map((r) => r.length));
      foes = [];
      items = [];
      checks = [];
      sparks = [];
      map = rows.map((row, r) =>
        [...row.padEnd(W)]
          .map((ch, c) => {
            const cx = c + 0.5;
            if (ch === "P") cp = { x: cx, y: r + 1 };
            else if (ch === "o" || ch === "G") items.push({ x: cx, y: r + 0.5, gold: ch === "G", got: false });
            else if (ch === "p" || ch === "f")
              foes.push({ x: cx, y: r + 1, vx: -1.4, fly: ch === "f", bx: cx, by: r + 0.6, t: rand(0, 6), dead: false });
            else if (ch === "K") checks.push({ x: cx, y: r + 1, on: false });
            else if (ch === "D") door = { x: cx, y: r + 1 };
            else return ch;
            return " ";
          })
          .join(""),
      );
      levelT = 0;
      respawn();
      hurtT = 0;
      camX = 0;
    };
    const loseLife = (fell: boolean) => {
      lives--;
      if (!calm) shake = 0.3;
      if (lives <= 0) {
        state = "end";
        stateT = 0;
      } else if (fell) {
        state = "dead";
        stateT = 0;
      } else {
        // A small hop; pushed back only on a roof, never into a gap mid-air
        hurtT = 1.5;
        vy = Math.min(vy, -7);
        if (ground) vx = -face * 5;
      }
    };

    const updateCat = (dt: number) => {
      const s = pad.state;
      const dir = (s.right ? 1 : 0) - (s.left ? 1 : 0);
      if (dir) {
        face = dir;
        // Turning around bites harder than speeding up
        vx += dir * (ground ? ACC : AIR) * dt * (Math.sign(vx) === -dir ? 1.8 : 1);
      } else if (ground) {
        vx -= Math.sign(vx) * Math.min(Math.abs(vx), FRICTION * dt);
      }
      vx = clamp(vx, -RUN, RUN);
      if (pad.consume("a") || pad.consume("up")) buffer = BUFFER;
      if (buffer > 0 && coyote > 0) {
        vy = -JUMP;
        buffer = coyote = 0;
        burst(x, y, 4, "rgba(255,255,255,0.7)", 0, 2);
      }
      // Release early for a lower jump: extra gravity while rising.
      vy = Math.min(MAX_FALL, vy + GRAVITY * dt * (vy < 0 && !(s.a || s.up) ? 2.4 : 1));
      buffer -= dt;
      coyote -= dt;

      // Horizontal move against solid tiles
      x += vx * dt;
      const side = Math.floor(x + Math.sign(vx) * HW);
      for (let r = Math.floor(y - CH); r <= Math.floor(y - 0.01); r++) {
        if (vx !== 0 && solid(side, r)) {
          x = vx > 0 ? side - HW - 0.001 : side + 1 + HW + 0.001;
          vx = 0;
          break;
        }
      }
      // Vertical move; one-way tiles only catch a cat falling from above
      const prev = y;
      y += vy * dt;
      ground = false;
      for (let c = Math.floor(x - HW); c <= Math.floor(x + HW - 0.001); c++) {
        if (vy > 0) {
          const r = Math.floor(y);
          if (solid(c, r) || (oneWay(c, r) && prev <= r + 0.001)) {
            y = r;
            vy = 0;
            ground = true;
          }
        } else if (vy < 0 && solid(c, Math.floor(y - CH))) {
          y = Math.floor(y - CH) + 1 + CH;
          vy = 0;
        }
      }
      if (ground) coyote = COYOTE;
      runT += Math.abs(vx) * dt;
      if (y > ROWS + 1.5) loseLife(true);
    };

    const updateWorld = (dt: number) => {
      for (const f of foes) {
        if (f.dead) continue;
        f.t += dt;
        if (f.fly) {
          // Back and forth along a sine wave
          f.x = f.bx + Math.sin(f.t * 0.9) * 2.5;
          f.vx = Math.cos(f.t * 0.9);
          f.y = f.by + Math.sin(f.t * 2.6) * 1.2 + 0.3;
        } else {
          // Walk; turn at walls and at roof edges
          const nx = f.x + f.vx * dt;
          const ahead = Math.floor(nx + Math.sign(f.vx) * 0.35);
          const row = Math.floor(f.y - 0.5);
          if (solid(ahead, row) || !(solid(ahead, row + 1) || oneWay(ahead, row + 1))) f.vx = -f.vx;
          else f.x = nx;
        }
        if (state !== "play" || Math.abs(f.x - x) > 0.65 || y < f.y - 0.6 || y - CH > f.y) continue;
        if (vy > 0 && y - (f.y - 0.6) < 0.5) {
          // Stomped from above: feather puff and a bounce
          f.dead = true;
          vy = pad.state.a || pad.state.up ? -JUMP * 0.85 : -11;
          burst(f.x, f.y - 0.3, 10, "#eef1f5", 1, 3);
          addScore(50, f.x, f.y - 1);
        } else if (hurtT <= 0) {
          loseLife(false);
        }
      }
      for (const it of items) {
        if (!it.got && Math.abs(it.x - x) < 0.6 && Math.abs(it.y - y + CH / 2) < 0.75) {
          it.got = true;
          fruit++;
          addScore(it.gold ? 100 : 10, it.x, it.y - 0.6);
          burst(it.x, it.y, it.gold ? 14 : 6, it.gold ? GOLD : C.apricot);
        }
      }
      for (const k of checks) {
        if (!k.on && Math.abs(k.x - x) < 0.8 && Math.abs(k.y - y) < 1.5) {
          k.on = true;
          cp = { x: k.x, y: k.y };
          burst(k.x, k.y - 1.2, 8, "rgba(255,255,255,0.8)", 1, 2);
        }
      }
      if (state === "play" && Math.abs(door.x - x) < 0.7 && y > door.y - 2 && y <= door.y + 0.1) {
        state = "win";
        stateT = 0;
        addScore(500 + Math.max(0, Math.round(90 - levelT)) * 5, door.x, door.y - 3.5);
      }
      for (const p of sparks) {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind !== 2) p.vy += (p.kind === 1 ? 2 : 8) * dt;
      }
      sparks = sparks.filter((p) => p.life < p.max);
    };

    // --- Drawing (positions in CSS px; s = tile size) -----------------------

    const catHead = (cx: number, cy: number, s: number) => {
      shape(ORANGE, [cx - s * 0.9, cy - s * 0.2, cx - s * 0.7, cy - s * 1.15, cx - s * 0.15, cy - s * 0.7, cx + s * 0.15, cy - s * 0.7, cx + s * 0.7, cy - s * 1.15, cx + s * 0.9, cy - s * 0.2]);
      oval(ORANGE, cx, cy, s * 0.85);
      oval(C.ink, cx - s * 0.33, cy - s * 0.08, s * 0.12);
      oval(C.ink, cx + s * 0.33, cy - s * 0.08, s * 0.12);
      oval("#f6c7b0", cx, cy + s * 0.3, s * 0.13);
    };

    const drawCat = (px: number, py: number) => {
      const s = T;
      const hurt = hurtT > 0 && state === "play";
      if (hurt && Math.floor(hurtT * 12) % 2 === 0) return;
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(face, 1);
      const air = !ground;
      const running = ground && Math.abs(vx) > 0.5;
      const step = running ? Math.floor(runT * 2.2) % 3 : 3;
      const b = step === 1 ? -s * 0.04 : 0;
      // Tail sways; it points up in the air
      const sway = Math.sin(time * (running ? 9 : 3)) * 0.25;
      ctx.strokeStyle = ORANGE;
      ctx.lineWidth = s * 0.11;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-s * 0.28, -s * 0.38 + b);
      ctx.quadraticCurveTo(-s * 0.62, -s * (air ? 0.6 : 0.35), -s * (0.55 + sway * 0.3), -s * (air ? 0.95 : 0.75 + sway));
      ctx.stroke();
      // Legs: tucked going up, reaching going down, 3 run frames, idle
      const legs = air
        ? vy < 0
          ? [-0.2, -0.12, -0.08, -0.14, 0.14, -0.14, 0.26, -0.12]
          : [-0.26, 0, -0.12, -0.02, 0.16, -0.02, 0.3, 0]
        : [
            [-0.32, 0, -0.05, 0, 0.08, 0, 0.34, 0],
            [-0.2, -0.06, -0.12, 0, 0.2, 0, 0.24, -0.06],
            [-0.1, 0, -0.24, 0, 0.3, 0, 0.12, 0],
            [-0.22, 0, -0.1, 0, 0.12, 0, 0.24, 0],
          ][step]!;
      const seg: number[] = [];
      for (let i = 0; i < 8; i += 2) seg.push(legs[i]! * s * 0.7, -s * 0.3 + b, legs[i]! * s, (legs[i + 1]! - 0.04) * s);
      lines(ORANGE_DARK, s * 0.1, seg);
      // Body with stripes and a pale belly
      oval(ORANGE, 0, -s * 0.36 + b, s * 0.36, s * 0.2);
      lines(ORANGE_DARK, s * 0.04, [-0.14, 0, 0.14].flatMap((sx) => [sx * s, -s * 0.54 + b, sx * s - s * 0.03, -s * 0.42 + b]));
      oval("#fbe3cc", s * 0.12, -s * 0.28 + b, s * 0.14, s * 0.08);
      const hx = s * 0.3;
      const hy = -s * (air ? 0.63 : 0.6) + b;
      catHead(hx, hy, s * 0.22);
      if (hurt) {
        ctx.globalAlpha = 0.35;
        oval(C.pomegranate, hx, hy, s * 0.22);
        ctx.globalAlpha = 1;
      }
      lines("rgba(19,36,27,0.5)", 1, [hx + s * 0.1, hy + s * 0.07, hx + s * 0.32, hy + s * 0.03, hx + s * 0.1, hy + s * 0.1, hx + s * 0.32, hy + s * 0.13]);
      ctx.restore();
    };

    const drawPigeon = (f: Foe, px: number, py: number) => {
      const s = T;
      ctx.save();
      ctx.translate(px, py - (f.fly ? 0 : Math.abs(Math.sin(f.t * 8)) * s * 0.05));
      ctx.scale(f.vx > 0 ? s : -s, s);
      if (!f.fly) lines("#d46a4a", 0.05, [-0.05, -0.15, -0.08, 0.02, 0.07, -0.15, 0.1, 0.02]);
      shape("#8d98a8", [-0.42, -0.38, -0.2, -0.3, -0.2, -0.22]);
      oval("#8d98a8", 0, -0.28, 0.26, 0.16, -0.15);
      oval("#5f8f86", 0.16, -0.4, 0.1, 0.11); // shimmering neck
      oval("#6c7686", 0.22, -0.52, 0.1);
      shape("#f0b25a", [0.3, -0.55, 0.4, -0.5, 0.3, -0.48]);
      oval(C.ink, 0.25, -0.54, 0.025);
      oval("#a9b2bf", -0.04, -0.3, 0.18, 0.08, f.fly ? -Math.sin(f.t * 16) * 0.9 : -0.15);
      ctx.restore();
    };

    const drawFruit = (gold: boolean, px: number, py: number) => {
      const r = T * 0.22;
      oval(gold ? GOLD : C.apricot, px, py, r);
      oval(gold ? "#fff6c2" : "#f7c46e", px - r * 0.35, py - r * 0.3, r * 0.35);
      ctx.strokeStyle = C.apricotDeep;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px + r * 0.9, py, r * 0.9, Math.PI * 0.8, Math.PI * 1.2);
      ctx.stroke();
      oval(C.tarragon, px + r * 0.35, py - r * 1.05, r * 0.4, r * 0.18, -0.5);
      if (gold && !calm) {
        const ty = py - r * 1.2 - (Math.sin(time * 6) + 1) * 1.5;
        box("#fff", px + r * 0.8, ty, 2, 6);
        box("#fff", px + r * 0.8 - 2, ty + 2, 6, 2);
      }
    };

    const drawTile = (ch: string, c: number, r: number, px: number, py: number) => {
      const s = T;
      const t = s + 0.5;
      if (ch === "#" || ch === "=") {
        // Tufa blocks with offset mortar lines
        box(r % 2 ? C.tufa : "#d4876a", px, py, t, t);
        const o = r % 2 ? s * 0.25 : s * 0.75;
        const o2 = px + ((o + s / 2) % s);
        lines(C.tufaDark, 1, [px, py + s / 2, px + s, py + s / 2, px + o, py, px + o, py + s / 2, o2, py + s / 2, o2, py + s]);
        if (!solid(c, r - 1)) {
          if (ch === "=") {
            // Tin roof cap with ribs, slightly overhanging
            box("#8fa1a6", px - 1, py - s * 0.06, t + 2, s * 0.3);
            for (let i = 0; i < 4; i++) box("#b9c7ca", px + (i + 0.3) * (s / 4), py - s * 0.06, 2, s * 0.3);
          } else box("#e9a888", px, py, t, s * 0.1);
        }
        if (!solid(c, r + 1)) box(C.tufaDark, px, py + s * 0.8, t, s * 0.2);
      } else if (ch === "W") {
        // Water tank on two legs
        box("#6f7f86", px + s * 0.2, py + s * 0.7, s * 0.08, s * 0.3);
        box("#6f7f86", px + s * 0.72, py + s * 0.7, s * 0.08, s * 0.3);
        ctx.fillStyle = "#9db4bd";
        roundRect(ctx, px + s * 0.06, py + s * 0.06, s * 0.88, s * 0.68, s * 0.12);
        ctx.fill();
        box("#7e979f", px + s * 0.06, py + s * 0.28, s * 0.88, s * 0.05);
        box("#7e979f", px + s * 0.06, py + s * 0.5, s * 0.88, s * 0.05);
        box("#c4d5da", px + s * 0.06, py, s * 0.88, s * 0.08);
      } else if (ch === "H") {
        box(C.tufaDark, px + s * 0.15, py + s * 0.15, s * 0.7, s * 0.85);
        box("#8f5038", px + s * 0.08, py, s * 0.84, s * 0.18);
      } else if (ch === "-") {
        // Plank, with a post at each end
        box("#8a5a3a", px, py, t, s * 0.22);
        box("#a8774f", px, py, t, s * 0.06);
        if (at(c - 1, r) !== "-" || at(c + 1, r) !== "-") box("#5c3a24", px + s * 0.42, py + s * 0.22, s * 0.12, s * 0.78);
      } else if (ch === "~") {
        // Laundry line between two poles, one piece of washing per tile
        ctx.strokeStyle = "#f3eee4";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, py + 2);
        ctx.quadraticCurveTo(px + s / 2, py + s * 0.12, px + s, py + 2);
        ctx.stroke();
        if (at(c - 1, r) !== "~") box("#5c4a3c", px, py - s * 0.1, 3, s * 1.1);
        if (at(c + 1, r) !== "~") box("#5c4a3c", px + s - 3, py - s * 0.1, 3, s * 1.1);
        const h = hash(c * 7 + r);
        const col = CLOTHES[Math.floor(h * CLOTHES.length)]!;
        const sw = px + (calm ? 0 : Math.sin(time * 2 + c) * s * 0.03);
        if (h > 0.5) {
          box(col, sw + s * 0.2, py + s * 0.1, s * 0.55, s * 0.45);
          box(col, sw + s * 0.08, py + s * 0.1, s * 0.8, s * 0.14);
        } else box(col, sw + s * 0.25, py + s * 0.1, s * 0.45, s * 0.6);
      } else if (ch === "A") {
        const m = px + s / 2;
        lines("#4b5258", 2, [m, py + s, m, py - s * 0.9, m - s * 0.45, py - s * 0.8, m + s * 0.45, py - s * 0.8, m - s * 0.33, py - s * 0.5, m + s * 0.33, py - s * 0.5, m - s * 0.2, py - s * 0.2, m + s * 0.2, py - s * 0.2]);
      }
    };

    const drawBackground = (w: number) => {
      const g = ctx.createLinearGradient(0, 0, 0, viewH);
      g.addColorStop(0, C.sky);
      g.addColorStop(0.55, "#fbdcae");
      g.addColorStop(1, "#f5b06a");
      box(g, 0, 0, w, viewH);
      oval("rgba(255,240,205,0.85)", w * 0.72, viewH * 0.5, T * 1.1); // low sun
      // Pale twin-peaked mountain, barely moving
      const mx = w * 0.3 - camX * T * 0.04;
      const v = viewH;
      shape("rgba(240,226,232,0.9)", [mx - v * 0.9, v * 0.78, mx, v * 0.28, mx + v * 0.38, v * 0.55, mx + v * 0.6, v * 0.47, mx + v * 1.1, v * 0.78]);
      shape("#fff", [mx - v * 0.12, v * 0.36, mx, v * 0.28, mx + v * 0.1, v * 0.34, mx + v * 0.02, v * 0.33]);
      // Two city layers with cone-roofed churches
      for (const [par, col, lo, hi, seed] of [
        [0.2, "rgba(176,106,76,0.35)", 2, 4.5, 11],
        [0.45, "rgba(140,80,60,0.45)", 1, 3, 57],
      ] as const) {
        const bw = T * 1.4;
        const off = camX * T * par;
        for (let i = Math.floor(off / bw); i * bw - off < w; i++) {
          const h = hash(i + seed);
          const bh = (lo + h * (hi - lo)) * T;
          const bx = i * bw - off;
          box(col, bx, v - bh, bw - 1, bh);
          if (h > 0.82) shape(col, [bx + bw * 0.15, v - bh, bx + bw / 2, v - bh - T * 0.9, bx + bw * 0.85, v - bh]);
        }
      }
    };

    const drawDoor = (px: number, py: number) => {
      const s = T;
      box(C.tufaDark, px - s * 0.75, py - s * 2.3, s * 1.5, s * 2.3);
      ctx.fillStyle = C.tarragon;
      roundRect(ctx, px - s * 0.45, py - s * 1.8, s * 0.9, s * 1.8, s * 0.4);
      ctx.fill();
      box("#ffe2a8", px - s * 0.3, py - s * 1.45, s * 0.6, s * 0.5);
      oval(GOLD, px + s * 0.28, py - s * 0.8, s * 0.06);
      // Striped apricot awning with scalloped edge
      for (let i = 0; i < 6; i++) {
        const ax = px - s * 0.9 + i * s * 0.3;
        const col = i % 2 ? C.matsoni : C.apricot;
        box(col, ax, py - s * 2.25, s * 0.3, s * 0.3);
        oval(col, ax + s * 0.15, py - s * 1.95, s * 0.15);
      }
      // Cup sign with steam
      ctx.fillStyle = C.matsoni;
      roundRect(ctx, px - s * 0.45, py - s * 3.05, s * 0.9, s * 0.7, s * 0.15);
      ctx.fill();
      box(C.apricotDeep, px - s * 0.2, py - s * 2.85, s * 0.32, s * 0.3);
      lines(C.apricotDeep, 3, [px + s * 0.12, py - s * 2.8, px + s * 0.22, py - s * 2.7]);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      for (const dx of [-0.1, 0.03]) {
        const wv = calm ? 0 : Math.sin(time * 4 + dx * 20) * s * 0.05;
        ctx.moveTo(px + dx * s, py - s * 3.1);
        ctx.quadraticCurveTo(px + dx * s + s * 0.08 + wv, py - s * 3.25, px + dx * s, py - s * 3.4);
      }
      ctx.stroke();
    };

    const draw = () => {
      const s = fit.size();
      ctx.save();
      if (shake > 0) ctx.translate(rand(-1, 1) * shake * 12, rand(-1, 1) * shake * 12);
      ctx.beginPath();
      ctx.rect(0, 0, s.w, viewH);
      ctx.clip();
      drawBackground(s.w);
      const ox = -camX * T;
      const oy = viewH - ROWS * T;
      for (let r = 0; r < ROWS; r++) {
        for (let c = Math.max(0, Math.floor(camX) - 1); c <= Math.min(W - 1, camX + s.w / T + 1); c++) {
          const ch = at(c, r);
          if (ch !== " ") drawTile(ch, c, r, ox + c * T, oy + r * T);
        }
      }
      for (const k of checks) {
        // Flag pole; the flag rises and the chimney smokes once reached
        const px = ox + k.x * T;
        const py = oy + k.y * T;
        box("#4b5258", px - 1.5, py - T * 1.3, 3, T * 1.3);
        const fy = py - (k.on ? T * 1.3 : T * 0.5);
        shape(k.on ? C.apricot : C.line, [px + 1.5, fy, px + T * 0.5, fy + T * 0.15, px + 1.5, fy + T * 0.3]);
        if (k.on) {
          for (let i = 0; i < 3; i++) {
            const p = (time * 0.5 + i / 3) % 1;
            oval("rgba(255,255,255,0.5)", px + Math.sin(p * 6) * T * 0.15, py - T * (1.5 + p * 1.2), T * (0.1 + p * 0.15));
          }
        }
      }
      drawDoor(ox + door.x * T, oy + door.y * T);
      for (const it of items) if (!it.got) drawFruit(it.gold, ox + it.x * T, oy + it.y * T + (calm ? 0 : Math.sin(time * 3 + it.x) * T * 0.05));
      for (const f of foes) if (!f.dead) drawPigeon(f, ox + f.x * T, oy + f.y * T);
      if (state !== "dead" && !(state === "win" && stateT > 0.5)) drawCat(ox + x * T, oy + y * T);
      for (const p of sparks) {
        ctx.globalAlpha = 1 - p.life / p.max;
        const px = ox + p.x * T;
        const py = oy + p.y * T;
        if (p.txt) label(ctx, p.txt, px, py, T * 0.5, C.ink);
        else oval(p.col, px, py, T * (p.kind ? 0.12 : 0.07), T * (p.kind ? 0.05 : 0.07), p.life * 6);
      }
      ctx.globalAlpha = 1;
      if (state === "end") box(`rgba(19,36,27,${Math.min(0.45, stateT * 0.5)})`, 0, 0, s.w, viewH);
      ctx.restore();

      // HUD: lives, apricots, level, score
      const hs = clamp(T * 0.36, 10, 16);
      const hy = 12 + hs * 1.2;
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = i < lives ? 1 : 0.25;
        catHead(14 + hs + i * hs * 2.3, hy, hs);
      }
      ctx.globalAlpha = 1;
      const fx = 14 + hs * 8;
      drawFruit(false, fx, hy);
      label(ctx, String(fruit), fx + hs * 1.1, hy, hs * 1.4, C.ink, "left");
      label(ctx, `${level + 1}/${LEVELS.length}`, s.w / 2 + hs * 2, hy, hs * 1.3, C.ink);
      label(ctx, String(score), s.w - 14, hy, hs * 1.4, C.ink, "right");

      // Pad area: the tufa wall below the roofline
      box("#9a5a42", 0, viewH, s.w, s.h - viewH);
      box(C.tufa, 0, viewH, s.w, 4);
      pad.draw(ctx, s);
    };

    const stopLoop = loop(api, (dt, paused) => {
      if (!paused && !reported) {
        time += dt;
        stateT += dt;
        shake = Math.max(0, shake - dt);
        if (state === "play") {
          levelT += dt;
          hurtT -= dt;
          // Two substeps keep fast falls from skipping a tile
          updateCat(dt / 2);
          if (state === "play") updateCat(dt / 2);
        } else {
          pad.consume("a");
          pad.consume("up");
        }
        if (state === "dead" && stateT > 0.8) respawn();
        if (state === "win") {
          if (!calm && Math.random() < 0.5) burst(door.x + rand(-2, 2), door.y - rand(2, 4), 1, pick([C.apricot, C.pomegranate, C.tarragonLight, GOLD]));
          if (stateT > 1.8) {
            if (level + 1 < LEVELS.length) load(++level);
            else {
              state = "end";
              stateT = 0;
            }
          }
        }
        if (state === "end" && stateT > 1.2) {
          reported = true;
          api.gameOver(score);
        }
        updateWorld(dt);
        // Camera: follow with a little look-ahead, gentler with reduced motion
        const view = fit.size().w / T;
        const target = clamp(x + face * (calm ? 0.8 : 1.8) - view * 0.4, 0, Math.max(0, W - view));
        camX += (target - camX) * Math.min(1, dt * (calm ? 3 : 6));
      }
      draw();
    });

    load(0);
    api.setScore(0);

    return () => {
      stopLoop();
      pad.stop();
      fit.stop();
      canvas.style.touchAction = prevTouch;
    };
  },
};
