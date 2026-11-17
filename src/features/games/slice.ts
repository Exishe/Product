// "Chef's Knife": cartoon produce with faces is tossed up over a café cutting
// board. Swipe to slice it; it panics near the top and when the blade comes
// close, and the cut halves fall apart still looking shocked. Grandma's
// porcelain teapot gets tossed up too: slice it and it shatters (a life). A
// rare golden pomegranate bursts into seeds for big points. Dropped produce
// costs a life. The chef pops up in the corner: a chef's kiss for combos, a
// facepalm for a drop, horror for the teapot. No words on the canvas (the host
// shows the title and rules).
//
// Art direction
// - Mood: a sunny Yerevan café kitchen at lunch; slapstick knife work on a
//   well-loved cutting board, with produce that has opinions. Warm, fresh, splashy.
// - Camera and scale: top-down, static, one screen that fits the phone
//   (360–430 px portrait; desktop the same). Everything scales from R, 8.5% of
//   the short side (26–46 px). Vector art at device resolution, smoothing on.
// - Shapes: produce is round and soft, each with its own outline and character
//   (cheerful round tomato, nervous lobed pepper, smug bulb eggplant, chill long
//   cucumber, grumpy teary onion, shy creased apricot, proud moustached
//   pomegranate). The teapot is the only hard, man-made silhouette: spout,
//   handle loop and lid.
// - Values: the board stays in a narrow band of mid warm tans; produce is the
//   most saturated thing on screen; the teapot is the lightest shape (white
//   porcelain) with the deepest blue; faces are ink on white.
// - Palette: ground = wood tans on tufa stone (C.tufa, C.tufaDark); produce in
//   its own fresh colours; threat = white porcelain with cobalt flowers (no
//   produce is white or blue); reward = gold; accent = pomegranate for lives and
//   the hurt flash; HUD = matsoni over ink. Light warm from the top-left,
//   shadows cooler toward the bottom-right.
// - Detail: on the faces and the cut faces (seeds, rings, stone); the board
//   stays quiet behind play: soft grain, knife scratches, a juice groove.
// - Rules: one 2.2 px warm-brown outline on everything in play, none on the
//   board; one shading model (radial light from the top-left plus one gloss);
//   juice, tea and stains in flat colour.
// - Signature: the moustached chef popping up in the corner, lives as little
//   pomegranates, and an arevakhach (eternity sign) burned faintly into the board.
import { C, clamp, fitCanvas, label, loop, pointerPos, rand, roundRect } from "./engine";
import type { Game } from "./engine";

type G = CanvasRenderingContext2D;
type Kind = {
  c: readonly [string, string, string]; // light, base, shade
  j: string; // juice
  gl: number; // gloss size, 0 = matte
  p: (g: G) => void; // silhouette path
  d?: (g: G) => void; // skin detail, clipped to the silhouette
  t?: (g: G) => void; // on top: stem, leaves, crown
  f?: (g: G) => void; // cut face, clipped to the inset silhouette
};
/** pan: panic, eased 0..1; v0: launch speed. */
type Item = { x: number; y: number; vx: number; vy: number; g: number; rot: number; vr: number; e: number; ph: number; v0: number; pan: number };
type Half = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; e: number; cut: number; side: number };
/** k: 0–2 porcelain shard colours, 3 the lid. */
type Shard = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; s: number; k: number };
type Drop = { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; r: number };
type Stain = { x: number; y: number; col: string; life: number; b: number[] };
type Float = { x: number; y: number; text: string; life: number; col: string; s: number };
type Pt = { x: number; y: number; t: number };

const LIVES = 3;
const TRAIL = 0.13; // seconds a blade point stays visible
const COMBO_GAP = 0.3; // seconds between slices that still count as one swipe
const STREAK_GAP = 1.2; // a pause longer than this resets the multiplier
const LIFE_EVERY = 50;
const SAFE = 1.6; // seconds of grace after losing a life
const CHEF = 1.4; // seconds the chef stays up
const OUT = "rgba(59,34,22,0.9)";
const INK = "#2a160e";
const MOUTH = "#5a1a14";
const PINK = "#ff8a96";
const TEAR = "#bfe8ff";
const SKIN = "#f3c9a5";
const COBALT = "#2a4fa8";
const GOLD = "#ffd84a";
const TEA = "#9a6630";
const SHARD = ["#ffffff", "#dfe5f2", COBALT];
const TAU = Math.PI * 2;

// --- Drawing helpers, in sprite units (radius 1); px is one CSS pixel. ---
let px = 0.03;
const E = (g: G, x: number, y: number, rx: number, ry: number, a = 0) => {
  g.beginPath();
  g.ellipse(x, y, rx, ry, a, 0, TAU);
};
const F = (g: G, col: string | CanvasGradient) => {
  g.fillStyle = col;
  g.fill();
};
const S = (g: G, col: string, w: number) => {
  g.strokeStyle = col;
  g.lineWidth = w * px;
  g.stroke();
};
const bg = (g: G, col: string | CanvasGradient) => {
  g.fillStyle = col;
  g.fillRect(-2, -2, 4, 4);
};
const line = (g: G, ...p: number[]) => {
  g.beginPath();
  g.moveTo(p[0]!, p[1]!);
  if (p.length > 4) g.quadraticCurveTo(p[2]!, p[3]!, p[4]!, p[5]!);
  else g.lineTo(p[2]!, p[3]!);
};
const poly = (g: G, p: number[]) => {
  g.beginPath();
  for (let i = 0; i < p.length; i += 2) g.lineTo(p[i]!, p[i + 1]!);
  g.closePath();
};
// A curve-built silhouette: start point, then bezier triples.
const blob = (g: G, p: number[]) => {
  g.beginPath();
  g.moveTo(p[0]!, p[1]!);
  for (let i = 2; i < p.length; i += 6) g.bezierCurveTo(p[i]!, p[i + 1]!, p[i + 2]!, p[i + 3]!, p[i + 4]!, p[i + 5]!);
  g.closePath();
};
const leaf = (g: G, x: number, y: number, a: number, s = 1) => {
  E(g, x, y, 0.3 * s, 0.12 * s, a);
  F(g, "#5a9a3a");
  S(g, OUT, 1.6);
};
const star = (g: G, x: number, y: number, r: number, col: string) => {
  const p: number[] = [];
  for (let i = 0; i < 8; i++) p.push(x + Math.cos((i * TAU) / 8) * r * (i % 2 ? 0.3 : 1), y + Math.sin((i * TAU) / 8) * r * (i % 2 ? 0.3 : 1));
  poly(g, p);
  F(g, col);
};
const sleeve = (g: G, ...p: number[]) => {
  for (const [c, w] of [[OUT, 0.46], ["#fff", 0.38]] as const) {
    line(g, ...p);
    g.strokeStyle = c;
    g.lineWidth = w;
    g.stroke();
  }
};

const POM_SEEDS = (g: G) => {
  for (let i = 0; i < 30; i++) {
    const r = 0.8 * Math.sqrt((i + 0.5) / 30);
    const a = i * 2.4;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    E(g, x, y, 0.12, 0.09, a);
    F(g, "#c41d3d");
    E(g, x - 0.03, y - 0.03, 0.035, 0.025);
    F(g, "#ff9aa8");
  }
};
const LID = (g: G) => {
  E(g, 0, -0.46, 0.5, 0.17);
  F(g, "#f6f8fc");
  S(g, OUT, 2.2);
  line(g, -0.44, -0.4, 0, -0.32, 0.44, -0.4);
  S(g, "#d9a63a", 2);
  E(g, 0, -0.66, 0.12, 0.1);
  F(g, COBALT);
  S(g, OUT, 1.6);
};

const KINDS: Kind[] = [
  {
    // tomato
    c: ["#ff8a6a", "#e0452f", "#8e1f14"],
    j: "#d8402c",
    gl: 1,
    p: (g) => E(g, 0, 0.06, 1, 0.88),
    t: (g) => {
      const p: number[] = [];
      for (let i = 0; i < 10; i++) {
        const a = (i * TAU) / 10 - 1.57;
        const r = i % 2 ? 0.12 : 0.42;
        p.push(Math.cos(a) * r, -0.74 + Math.sin(a) * r * 0.6);
      }
      poly(g, p);
      F(g, "#3f8a2e");
      S(g, OUT, 1.5);
      line(g, 0, -0.76, 0.06, -1.02);
      S(g, "#3f7a2a", 4);
    },
    f: (g) => {
      bg(g, "#ea5440");
      for (let i = 0; i < 3; i++) {
        const a = i * 2.094 + 0.5;
        const x = Math.cos(a) * 0.48;
        const y = Math.sin(a) * 0.44 + 0.06;
        E(g, x, y, 0.32, 0.22, a);
        F(g, "#f8a184");
        for (let k = -1; k < 2; k++) {
          E(g, x + Math.cos(a + 1.57) * k * 0.12, y + Math.sin(a + 1.57) * k * 0.12, 0.05, 0.035, a);
          F(g, "#f7df92");
        }
      }
      E(g, 0, 0.06, 0.2, 0.17);
      F(g, "#f37b62");
    },
  },
  {
    // bell pepper
    c: ["#9ee07a", "#3f9a35", "#1b551b"],
    j: "#7cc35a",
    gl: 1.1,
    p: (g) => blob(g, [0, -0.7, 0.5, -0.95, 0.95, -0.75, 0.9, -0.2, 0.9, 0.45, 0.75, 0.95, 0.38, 0.92, 0.25, 0.85, 0.12, 0.85, 0, 0.95, -0.12, 0.85, -0.25, 0.85, -0.38, 0.92, -0.75, 0.95, -0.9, 0.45, -0.9, -0.2, -0.95, -0.75, -0.5, -0.95, 0, -0.7]),
    d: (g) => {
      for (const x of [-0.33, 0.33]) {
        line(g, x * 0.7, -0.7, x * 1.3, 0.1, x, 0.9);
        S(g, "rgba(20,60,20,0.35)", 2);
      }
    },
    t: (g) => {
      E(g, 0, -0.74, 0.24, 0.09);
      F(g, "#3c7a2a");
      line(g, 0, -0.75, 0.05, -1.05, 0.3, -1.12);
      S(g, OUT, 7.5);
      line(g, 0, -0.75, 0.05, -1.05, 0.3, -1.12);
      S(g, "#4f8a32", 4.5);
    },
    f: (g) => {
      bg(g, "#8fd068");
      g.save();
      g.scale(0.74, 0.74);
      KINDS[1]!.p(g);
      F(g, "#f4f7dd");
      g.restore();
      for (let i = 0; i < 9; i++) {
        E(g, Math.cos(i * 2.4) * 0.05 * i ** 0.6, -0.42 + Math.sin(i * 2.4) * 0.04 * i ** 0.7, 0.06, 0.045, i);
        F(g, "#fffbe6");
        S(g, "#d6d2a4", 1);
      }
    },
  },
  {
    // eggplant
    c: ["#b07ac4", "#5e2d73", "#26102f"],
    j: "#cbb8d6",
    gl: 1.2,
    p: (g) => blob(g, [0, -1.0, 0.35, -1.0, 0.4, -0.5, 0.62, -0.1, 0.95, 0.45, 0.7, 1.05, 0, 1.05, -0.7, 1.05, -0.95, 0.45, -0.62, -0.1, -0.4, -0.5, -0.35, -1.0, 0, -1.0]),
    t: (g) => {
      poly(g, [-0.36, -0.82, -0.42, -0.5, -0.24, -0.62, -0.12, -0.38, 0, -0.58, 0.12, -0.38, 0.24, -0.62, 0.42, -0.5, 0.36, -0.82, 0, -1.02]);
      F(g, "#4f8f3a");
      S(g, OUT, 1.6);
      line(g, 0, -0.98, 0.1, -1.25);
      S(g, "#3b6e2b", 6);
    },
    f: (g) => {
      bg(g, "#efe3bd");
      E(g, 0, 0.4, 0.5, 0.45);
      F(g, "#f6eed2");
      for (let i = 0; i < 16; i++) {
        const a = (i * TAU) / 16;
        E(g, Math.cos(a) * 0.33, 0.4 + Math.sin(a) * 0.3, 0.05, 0.03, a);
        F(g, "#9a7a44");
      }
    },
  },
  {
    // cucumber
    c: ["#8fd06a", "#3d7d2e", "#173f16"],
    j: "#a6d97c",
    gl: 0,
    p: (g) => blob(g, [-0.8, -0.42, -0.3, -0.56, 0.3, -0.56, 0.8, -0.42, 1.2, -0.32, 1.2, 0.36, 0.8, 0.36, 0.3, 0.24, -0.3, 0.24, -0.8, 0.36, -1.2, 0.36, -1.2, -0.32, -0.8, -0.42]),
    d: (g) => {
      for (let i = 0; i < 12; i++) {
        E(g, -0.95 + i * 0.17, i % 2 ? -0.38 : 0.18, 0.03, 0.03);
        F(g, "rgba(15,50,15,0.5)");
      }
    },
    t: (g) => {
      E(g, -1.17, -0.02, 0.07, 0.11);
      F(g, "#7a8a3a");
    },
    f: (g) => {
      bg(g, "#c8e69c");
      E(g, 0, -0.06, 0.95, 0.24);
      F(g, "#ecf6d2");
      for (let i = 0; i < 8; i++) {
        E(g, -0.7 + i * 0.2, -0.06 + (i % 2 ? 0.07 : -0.07), 0.06, 0.035, 0.4);
        F(g, "#fbf8e2");
        S(g, "#cfd9a8", 1);
      }
    },
  },
  {
    // onion
    c: ["#f6c98a", "#c47f36", "#7a4519"],
    j: "#efe2bd",
    gl: 0.7,
    p: (g) => blob(g, [0, -1.1, 0.15, -0.75, 0.95, -0.55, 0.9, 0.15, 0.85, 0.75, 0.4, 0.9, 0, 0.9, -0.4, 0.9, -0.85, 0.75, -0.9, 0.15, -0.95, -0.55, -0.15, -0.75, 0, -1.1]),
    d: (g) => {
      for (const i of [-2, 2]) {
        line(g, i * 0.06, -0.95, i * 0.5, 0, i * 0.2, 0.9);
        S(g, "rgba(110,60,20,0.3)", 1.5);
      }
    },
    t: (g) => {
      line(g, 0, -1.06, 0.06, -1.25);
      S(g, "#8a5a2a", 3);
      for (let i = -2; i < 3; i++) {
        line(g, 0, 0.88, i * 0.07, 1.04);
        S(g, "#d9c7a0", 1.5);
      }
    },
    f: (g) => {
      bg(g, "#fcf6e6");
      for (let s = 0.84; s > 0.1; s -= 0.16) {
        g.save();
        g.scale(s, s);
        KINDS[4]!.p(g);
        g.restore();
        S(g, "#e2cfa0", 2);
      }
    },
  },
  {
    // apricot
    c: ["#ffd68a", "#f2a23a", "#b8650c"],
    j: "#f6a33e",
    gl: 0.5,
    p: (g) => blob(g, [0, -0.8, 0.35, -1.02, 0.98, -0.8, 0.95, 0.05, 0.92, 0.75, 0.45, 0.95, 0, 0.95, -0.45, 0.95, -0.92, 0.75, -0.95, 0.05, -0.98, -0.8, -0.35, -1.02, 0, -0.8]),
    d: (g) => {
      line(g, 0, -0.78, 0.2, -0.5, 0.1, -0.3);
      S(g, "rgba(170,85,10,0.7)", 2);
    },
    t: (g) => {
      line(g, 0, -0.8, 0.05, -0.98);
      S(g, "#6b4a22", 3);
      leaf(g, 0.3, -0.98, -0.45);
    },
    f: (g) => {
      bg(g, "#f9ae48");
      E(g, 0, 0, 0.65, 0.62);
      F(g, "#fcc463");
      E(g, 0.04, 0.02, 0.38, 0.29, 0.3);
      F(g, "#8a4b22");
      S(g, "#5e3014", 1.6);
      line(g, -0.25, -0.08, 0.05, 0.05, 0.32, 0.12);
      S(g, "#b0703c", 1.4);
    },
  },
  {
    // pomegranate
    c: ["#ef6a78", "#b0213a", "#5e0c1c"],
    j: "#c41d3d",
    gl: 0.9,
    p: (g) => {
      blob(g, [0, -0.86, 0.6, -0.86, 0.96, -0.45, 0.96, 0.05, 0.96, 0.6, 0.5, 0.96, 0, 0.96, -0.5, 0.96, -0.96, 0.6, -0.96, 0.05, -0.96, -0.45, -0.6, -0.86, 0, -0.86]);
    },
    t: (g) => {
      poly(g, [-0.26, -0.78, -0.34, -1.08, -0.16, -0.92, 0, -1.12, 0.16, -0.92, 0.34, -1.08, 0.26, -0.78]);
      F(g, "#8e1a2e");
      S(g, OUT, 1.8);
    },
    f: (g) => {
      bg(g, "#f3dcbc");
      for (const a of [0.5, 2.6, 4.6]) {
        line(g, 0, 0, Math.cos(a) * 0.4, Math.sin(a) * 0.4, Math.cos(a + 0.3) * 0.9, Math.sin(a + 0.3) * 0.9);
        S(g, "#e5c39c", 3);
      }
      POM_SEEDS(g);
    },
  },
];
const POM = 6;
// The golden pomegranate: the same fruit in gold leaf with a gold crown.
const GOLDEN = KINDS.push({
  ...KINDS[POM]!,
  c: ["#fff6c0", "#e9b52a", "#8f5f06"],
  gl: 1.4,
  t: (g) => {
    poly(g, [-0.3, -0.78, -0.4, -1.12, -0.18, -0.94, 0, -1.18, 0.18, -0.94, 0.4, -1.12, 0.3, -0.78]);
    F(g, GOLD);
    S(g, OUT, 1.8);
  },
}) - 1;
// Grandma's teapot: white porcelain, cobalt flowers, gold trim. Never sliced, only shattered.
const POT = KINDS.push({
  c: ["#ffffff", "#eef1f7", "#9aa6c4"],
  j: TEA,
  gl: 1.3,
  p: (g) => E(g, 0, 0.18, 0.86, 0.68),
  d: (g) => {
    for (const [x, y] of [[-0.42, 0.24], [0.08, 0.42], [0.46, 0.1]]) {
      for (let i = 0; i < 5; i++) {
        const a = (i * TAU) / 5;
        E(g, x! + Math.cos(a) * 0.11, y! + Math.sin(a) * 0.11, 0.08, 0.05, a);
        F(g, COBALT);
      }
      E(g, x!, y!, 0.05, 0.05);
      F(g, GOLD);
    }
    line(g, -0.9, -0.16, 0, -0.32, 0.9, -0.16);
    S(g, COBALT, 3);
  },
  t: (g) => {
    g.beginPath();
    g.arc(-0.82, 0.16, 0.36, 1.4, 4.9);
    S(g, OUT, 9);
    S(g, "#f6f8fc", 5);
    g.beginPath();
    g.moveTo(0.62, -0.05);
    g.quadraticCurveTo(1, 0, 1.2, -0.56);
    g.lineTo(1.34, -0.5);
    g.quadraticCurveTo(1.15, 0.15, 0.7, 0.5);
    g.closePath();
    F(g, "#f6f8fc");
    S(g, OUT, 2.2);
    LID(g);
  },
}) - 1;

// Where each character's face sits: [eye y, eye x, eye size, mouth y].
const FACE: [number, number, number, number][] = [
  [-0.02, 0.33, 0.13, 0.36],
  [-0.12, 0.32, 0.12, 0.34],
  [0.28, 0.3, 0.12, 0.62],
  [-0.16, 0.3, 0.1, 0.06],
  [0.02, 0.3, 0.11, 0.44],
  [-0.04, 0.33, 0.12, 0.38],
  [-0.14, 0.32, 0.12, 0.3],
  [-0.14, 0.32, 0.12, 0.3],
];
// Calm mouths as one curve each (x, dy triples); the tomato's is drawn open.
const MOUTHS = [
  [],
  [-0.2, 0, -0.1, -0.1, 0, 0],
  [-0.16, 0.02, 0.1, 0.1, 0.26, -0.08],
  [-0.14, 0, 0, 0.1, 0.14, 0],
  [-0.2, 0.07, 0, -0.08, 0.2, 0.07],
  [-0.1, 0, 0, 0.08, 0.1, 0],
  [-0.13, 0.1, 0, 0.18, 0.13, 0.1],
];

/**
 * A character's face in sprite units. m: 0 calm (its own personality),
 * 1 panic (wide eyes, open mouth, sweat), 2 shocked (on the cut halves).
 * lx, ly: where the pupils look.
 */
function face(g: G, e: number, m: number, lx: number, ly: number) {
  const [ey, ex, es, my] = FACE[e]!;
  for (const s of [-1, 1]) {
    const x = s * ex;
    if (e === 0 || e === 5) {
      E(g, x * 1.65, my - 0.06, e ? 0.17 : 0.12, e ? 0.1 : 0.07);
      F(g, "rgba(255,90,100,0.45)");
    }
    if (m) {
      const r = es * (m > 1 ? 1.75 : 1.45);
      const pr = r * (m > 1 ? 0.2 : 0.36);
      E(g, x, ey, r, r * 1.15);
      F(g, "#fff");
      S(g, INK, 1.6);
      E(g, x + lx * r * 0.45, ey + ly * r * 0.45, pr, pr);
      F(g, INK);
      line(g, x - r, ey - r * 1.5, x, ey - r * 2.2, x + r, ey - r * 1.5);
      S(g, INK, 2.2);
    } else if (e === 3) {
      line(g, x - es, ey + es * 0.3, x, ey - es, x + es, ey + es * 0.3);
      S(g, INK, 2.4);
    } else {
      E(g, x + lx * es * 0.3, ey + ly * es * 0.3, es * 0.72, es);
      F(g, INK);
      E(g, x - es * 0.2, ey - es * 0.4, es * 0.26, es * 0.26);
      F(g, "#fff");
      const hi = ey - es * 2.2;
      const lo = ey - es * 1.35;
      if (e === 2) {
        // half-lidded and one eyebrow up: smug
        g.beginPath();
        g.ellipse(x, ey, es * 1.05, es * 1.2, 0, Math.PI, TAU);
        F(g, KINDS[2]!.c[1]);
        line(g, x - es * 1.05, ey, x + es * 1.05, ey);
        S(g, INK, 2.2);
        if (s > 0) line(g, x - es, hi + es * 0.4, x, hi - es * 0.3, x + es, hi + es * 0.5);
      } else if (e === 1) line(g, x + s * es * 1.3, lo, x - s * es * 1.1, hi); // worried
      else if (e === 4) line(g, x + s * es * 1.3, hi, x - s * es * 1.1, lo); // grumpy
      if (e === 1 || e === 2 || e === 4) S(g, INK, 2.6);
    }
  }
  if (m) {
    E(g, 0, my + 0.04, 0.13, m > 1 ? 0.21 : 0.18);
    F(g, MOUTH);
    S(g, INK, 1.4);
    E(g, 0, my + 0.13, 0.08, 0.05);
    F(g, PINK);
    if (m < 2) {
      E(g, ex + 0.3, ey - 0.18, 0.06, 0.09);
      F(g, TEAR);
      S(g, INK, 1);
    }
  } else if (e) {
    const q = MOUTHS[Math.min(e, 6)]!;
    line(g, q[0]!, my + q[1]!, q[2]!, my + q[3]!, q[4]!, my + q[5]!);
    if (e === 1) g.quadraticCurveTo(0.1, my + 0.1, 0.2, my);
    S(g, INK, 2.4);
  } else {
    g.beginPath();
    g.moveTo(-0.28, my - 0.06);
    g.quadraticCurveTo(0, my + 0.42, 0.28, my - 0.06);
    g.closePath();
    F(g, MOUTH);
    S(g, INK, 1.4);
    E(g, 0, my + 0.1, 0.1, 0.05);
    F(g, PINK);
  }
  if (e === 4) {
    // the onion is always a little teary
    E(g, -ex + 0.05, ey + 0.22, 0.05, 0.08);
    F(g, TEAR);
    S(g, INK, 1);
  }
  if (e >= POM) {
    for (const s of [-1, 1]) {
      line(g, 0, my - 0.02, s * 0.24, my + 0.1, s * 0.38, my - 0.1);
      S(g, INK, 5.5);
    }
  }
}

/** The chef, in units of his head radius. k: 0 chef's kiss, 1 facepalm, 2 horror. */
function drawChef(g: G, k: number, t: number) {
  if (k === 2) sleeve(g, -0.9, 1.6, -1.2, 1.1, -0.95, 0.45);
  sleeve(g, 0.9, 1.6, k === 1 ? 0.75 : 1.2, k === 1 ? 0.4 : 1.1, k === 1 ? 0.35 : k ? 0.95 : 0.55, k === 1 ? -0.1 : k ? 0.45 : 0.7);
  E(g, 0, 1.5, 1.2, 0.68);
  F(g, "#fff");
  S(g, OUT, 2.2);
  poly(g, [-0.38, 0.84, 0.38, 0.84, 0, 1.3]);
  F(g, C.pomegranate);
  S(g, OUT, 2);
  E(g, 0, 0, 0.9, 0.95);
  F(g, SKIN);
  S(g, OUT, 2.2);
  g.save();
  // horror: the toque jumps off his head
  if (k === 2) g.translate(0.1, -0.25 - Math.min(1, t * 4) * 0.2);
  for (const [x, y, r] of [[-0.48, -1.3, 0.42], [0.48, -1.3, 0.42], [0, -1.52, 0.5]]) {
    E(g, x!, y!, r!, r! * 0.9);
    F(g, "#fff");
    S(g, OUT, 2.2);
  }
  roundRect(g, -0.72, -1.14, 1.44, 0.4, 0.1);
  F(g, "#fff");
  S(g, OUT, 2.2);
  g.restore();
  for (const s of [-1, 1]) {
    const x = s * 0.36;
    if (k === 2) {
      E(g, x, -0.18, 0.2, 0.24);
      F(g, "#fff");
      S(g, INK, 1.8);
      E(g, x, -0.16, 0.05, 0.05);
      F(g, INK);
      line(g, x - 0.2, -0.5, x, -0.62, x + 0.2, -0.5);
    } else line(g, x - 0.16, -0.12, x, -0.3, x + 0.16, -0.12);
    S(g, INK, 3);
    E(g, s * 0.58, 0.18, 0.14, 0.08);
    F(g, "rgba(240,110,100,0.45)");
  }
  E(g, 0, 0.14, 0.2, 0.16);
  F(g, "#e9a27c");
  S(g, OUT, 1.6);
  if (k === 0) {
    E(g, 0.02, 0.6, 0.11, 0.09);
    F(g, "#c4404a");
  } else if (k === 1) line(g, -0.22, 0.7, 0, 0.58, 0.22, 0.7);
  else {
    E(g, 0, 0.66, 0.17, 0.2);
    F(g, MOUTH);
  }
  S(g, INK, k === 1 ? 3 : 1.6);
  for (const s of [-1, 1]) {
    line(g, 0, 0.36, s * 0.42, 0.5, s * 0.64, 0.2);
    S(g, "#3b2213", 9);
  }
  // hands
  if (k === 1) {
    E(g, 0.06, -0.2, 0.6, 0.3, -0.12);
    F(g, SKIN);
    S(g, OUT, 2.2);
    for (let i = 0; i < 3; i++) {
      line(g, -0.32 + i * 0.22, -0.42, -0.36 + i * 0.22, -0.02);
      S(g, "rgba(150,80,50,0.5)", 1.6);
    }
  } else
    for (const s of k ? [-1, 1] : [1]) {
      E(g, k ? s * 0.92 : 0.5, k ? 0.42 : 0.66, 0.22, 0.24);
      F(g, SKIN);
      S(g, OUT, 2.2);
    }
  if (k === 0 && t > 0.3) {
    // the kiss flies off the fingertips
    const a = Math.min(1, (t - 0.3) * 2.5);
    star(g, 0.7 + a * 0.8, 0.5 - a * 1.1, 0.12 + a * 0.18, GOLD);
    star(g, 1 + a * 0.5, 0.7 - a * 0.4, 0.08 + a * 0.08, "#fff");
  }
}

function drawSkin(g: G, k: Kind) {
  k.p(g);
  const gr = g.createRadialGradient(-0.45, -0.5, 0.05, -0.2, -0.2, 1.45);
  gr.addColorStop(0, k.c[0]);
  gr.addColorStop(0.5, k.c[1]);
  gr.addColorStop(1, k.c[2]);
  F(g, gr);
  g.save();
  g.clip();
  k.d?.(g);
  if (k.gl) {
    g.globalAlpha = 0.55;
    E(g, -0.36, -0.42, 0.26 * k.gl, 0.12 * k.gl, -0.6);
    F(g, "#fff");
    g.globalAlpha = 1;
  }
  g.restore();
  k.p(g);
  S(g, OUT, 2.2);
  k.t?.(g);
}

function drawCut(g: G, k: Kind) {
  k.p(g);
  F(g, k.c[1]);
  g.save();
  g.scale(0.86, 0.86);
  k.p(g);
  g.clip();
  k.f?.(g);
  g.restore();
  k.p(g);
  S(g, OUT, 2.2);
}

/** One drawing (skin, cut face or shadow) per kind and size, drawn once into its own canvas. */
const sprites = new Map<string, HTMLCanvasElement>();
function sprite(k: number, mode: number, r: number): HTMLCanvasElement {
  const key = `${k}:${mode}:${r}`;
  let cv = sprites.get(key);
  if (!cv) {
    cv = document.createElement("canvas");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const s = Math.ceil(r * 2.8 * dpr);
    cv.width = cv.height = s;
    const g = cv.getContext("2d");
    if (g) {
      g.setTransform(dpr * r, 0, 0, dpr * r, s / 2, s / 2);
      g.lineJoin = g.lineCap = "round";
      px = 1 / r;
      const kind = KINDS[k]!;
      if (mode === 2) {
        kind.p(g);
        F(g, C.ink);
      } else (mode ? drawCut : drawSkin)(g, kind);
    }
    sprites.set(key, cv);
  }
  return cv;
}
// mode: 0 skin, 1 cut face, 2 shadow silhouette
const blit = (ctx: G, k: number, mode: number, r: number) => ctx.drawImage(sprite(k, mode, r), -1.4 * r, -1.4 * r, 2.8 * r, 2.8 * r);

/** The cutting board on a tufa counter, drawn once per size into its own canvas. */
function makeBoard(w: number, h: number): HTMLCanvasElement | null {
  const cv = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const g = cv.getContext("2d");
  if (!g) return null;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  g.fillStyle = C.tufa;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < (w * h) / 250; i++) {
    g.globalAlpha = 0.1 + rnd() * 0.2;
    g.fillStyle = rnd() < 0.7 ? C.tufaDark : C.matsoni;
    g.beginPath();
    g.arc(rnd() * w, rnd() * h, 0.5 + rnd() * 1.6, 0, TAU);
    g.fill();
  }
  const m = 9;
  const bw = w - m * 2;
  const bh = h - m * 2;
  g.globalAlpha = 0.35;
  g.fillStyle = C.basalt;
  roundRect(g, m + 2, m + 5, bw, bh, 24);
  g.fill();
  g.globalAlpha = 1;
  const wood = g.createLinearGradient(0, 0, w * 0.4, h);
  wood.addColorStop(0, "#ebc99e");
  wood.addColorStop(1, "#d6a774");
  roundRect(g, m, m, bw, bh, 24);
  g.fillStyle = wood;
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = "#8f5a2e";
  for (let i = 0; i < h / 6; i++) {
    const y = rnd() * h;
    g.globalAlpha = 0.05 + rnd() * 0.1;
    g.lineWidth = 0.6 + rnd() * 1.6;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(w * 0.3, y + (rnd() - 0.5) * 30, w * 0.6, y + (rnd() - 0.5) * 30, w, y + (rnd() - 0.5) * 12);
    g.stroke();
  }
  for (let k = 0; k < 2; k++) {
    const x = rnd() * w;
    const y = rnd() * h;
    for (let r = 3; r < 26; r += 5) {
      g.globalAlpha = 0.16;
      g.beginPath();
      g.ellipse(x, y, r * 2.2, r * 0.7, 0, 0, TAU);
      g.stroke();
    }
  }
  // Years of knife scratches, light and dark.
  for (let i = 0; i < 40; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const a = rnd() * 3;
    const l = 10 + rnd() * 40;
    g.globalAlpha = 0.25;
    g.strokeStyle = i % 2 ? "#fff3dc" : "#8f5a2e";
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  // Signature: an arevakhach burned faintly into the wood.
  const bs = Math.min(w, h) * 0.17;
  g.translate(w / 2, h * 0.56);
  g.globalAlpha = 0.09;
  g.fillStyle = "#5a3218";
  for (let i = 0; i < 8; i++) {
    g.rotate(TAU / 8);
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(bs * 0.65, -bs * 0.6, bs, -bs * 0.08);
    g.quadraticCurveTo(bs * 0.55, bs * 0.02, 0, 0);
    g.fill();
  }
  g.lineWidth = 3;
  g.strokeStyle = "#5a3218";
  g.beginPath();
  g.arc(0, 0, bs * 1.18, 0, TAU);
  g.stroke();
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Juice groove.
  g.globalAlpha = 0.3;
  g.lineWidth = 3;
  g.strokeStyle = "#7d4a24";
  roundRect(g, m + 13, m + 13, bw - 26, bh - 26, 14);
  g.stroke();
  g.globalAlpha = 0.35;
  g.lineWidth = 1;
  g.strokeStyle = C.matsoni;
  roundRect(g, m + 14.5, m + 14.5, bw - 26, bh - 26, 14);
  g.stroke();
  // The hanging hole at the top, with the counter showing through.
  g.globalAlpha = 1;
  roundRect(g, w / 2 - 28, m + 22, 56, 18, 9);
  g.fillStyle = C.tufaDark;
  g.fill();
  g.lineWidth = 2.5;
  g.strokeStyle = "#7d4a24";
  g.stroke();
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.hypot(w, h) / 2);
  v.addColorStop(0, "rgba(60,30,10,0)");
  v.addColorStop(1, "rgba(60,30,10,0.28)");
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  g.restore();
  g.globalAlpha = 0.6;
  g.lineWidth = 2;
  g.strokeStyle = "#7d4a24";
  roundRect(g, m, m, bw, bh, 24);
  g.stroke();
  // A leather cord through the hole, off the top of the board.
  g.globalAlpha = 1;
  g.lineWidth = 3;
  g.strokeStyle = "#6b3b1e";
  g.beginPath();
  g.moveTo(w / 2 - 14, m + 31);
  g.bezierCurveTo(w / 2 - 20, 0, w / 2 + 20, 0, w / 2 + 14, m + 31);
  g.stroke();
  return cv;
}

export const game: Game = {
  mount(api) {
    const { canvas, reducedMotion: still, sfx } = api;
    let W = 1;
    let H = 1;
    let R = 30; // item radius
    let board: HTMLCanvasElement | null = null;
    const fc = fitCanvas(canvas, (s) => {
      W = s.w;
      H = s.h;
      R = Math.round(clamp(Math.min(W, H) * 0.085, 26, 46));
      sprites.clear();
      board = makeBoard(W, H);
    });
    const ctx = fc.ctx;

    const items: Item[] = [];
    let halves: Half[] = [];
    let shards: Shard[] = [];
    let drops: Drop[] = [];
    let stains: Stain[] = [];
    let floats: Float[] = [];
    let pts: Pt[] = [];
    let queue: number[] = [];
    let score = 0;
    let lives = LIVES;
    let nextLife = LIFE_EVERY;
    let t = 0; // game time, drives difficulty
    let clock = 0; // real time, drives the blade trail
    let nextToss = 0.5;
    let lastWhoa = 0;
    let flash = 0;
    let shake = 0;
    let safe = 0;
    let lifeBump = 0;
    let multBump = 0;
    let streak = 0;
    let streakT = 0;
    let over = false;
    let overT = 0;
    let finished = false;
    let pointer = -1;
    let last = { x: 0, y: 0 };
    const combo = { n: 0, t: 0, x: 0, y: 0 };
    const chef = { k: 0, t: CHEF };
    const mult = () => Math.min(5, 1 + Math.floor(streak / 4));
    api.setScore(0);

    const pop = (x: number, y: number, text: string, col: string = C.apricot, s = 30) =>
      floats.push({ x: clamp(x, 30, W - 30), y, text, life: 0.9, col, s });

    // The chef pops up in the corner; horror outranks the rest while it lasts.
    const setChef = (k: number) => {
      if (chef.t < CHEF && chef.k === 2 && k !== 2) return;
      chef.t = chef.t < CHEF ? Math.min(chef.t, 0.2) : 0;
      chef.k = k;
    };

    const addScore = (n: number) => {
      score += n;
      api.setScore(score);
      while (score >= nextLife) {
        nextLife += LIFE_EVERY;
        if (lives < LIVES && !over) {
          lives++;
          lifeBump = 1;
          sfx("coin");
          pop(22 + (lives - 1) * 28, 58, "+1", C.matsoni, 24);
        }
      }
    };

    const hurt = (pot: boolean) => {
      if (over || safe > 0) return;
      lives--;
      safe = SAFE;
      streak = 0;
      nextToss = Math.max(nextToss, 0.9);
      if (!still) flash = shake = pot ? 1 : 0.5;
      setChef(pot ? 2 : 1);
      if (pot) {
        sfx("heavy");
        sfx("block");
      }
      if (lives <= 0) {
        over = true;
        sfx("lose");
        sfx("whoa");
      } else {
        sfx("bad");
        sfx(pot ? "uhoh" : "oof");
      }
    };

    const finishCombo = () => {
      if (combo.n >= 3 && !over) {
        addScore(combo.n);
        pop(combo.x, combo.y - R * 1.4, `+${combo.n}`, C.matsoni, 40);
        sfx(combo.n >= 5 ? "yay" : "mmm");
        setChef(0);
      }
      combo.n = 0;
    };

    const burst = (x: number, y: number, vx: number, vy: number, cols: string[], n: number) => {
      const count = still ? Math.ceil(n / 2) : n;
      for (let i = 0; i < count; i++) {
        const a = rand(0, TAU);
        const sp = rand(60, 280);
        const max = rand(0.4, 0.8);
        drops.push({ x, y, vx: vx * 0.3 + Math.cos(a) * sp, vy: vy * 0.3 + Math.sin(a) * sp - 60, life: max, max, col: cols[i % cols.length]!, r: rand(2, 4.5) });
      }
    };

    const stain = (x: number, y: number, col: string, ang: number) => {
      const b = [0, 0, R * 0.42, rand(-0.2, 0.2) * R, rand(-0.2, 0.2) * R, R * 0.3];
      for (let i = 0; i < 7; i++) {
        const a = ang + (i % 2 ? 0 : Math.PI) + rand(-0.5, 0.5);
        const d = rand(0.5, 1.5) * R;
        b.push(Math.cos(a) * d, Math.sin(a) * d, rand(0.05, 0.15) * R);
      }
      stains.push({ x, y, col, life: 3.5, b });
      if (stains.length > 24) stains.shift();
    };

    const cut = (it: Item, ang: number) => {
      if (it.e === POT) {
        // Crash: porcelain shards everywhere, the lid spins off, tea on the board.
        for (let i = 0; i < (still ? 8 : 16); i++) {
          const a = rand(0, TAU);
          const sp = rand(90, 330);
          shards.push({ x: it.x, y: it.y, vx: it.vx * 0.3 + Math.cos(a) * sp * (i ? 1 : 0.3), vy: it.vy * 0.3 + Math.sin(a) * sp - (i ? 120 : 520), rot: rand(0, TAU), vr: rand(-12, 12), s: rand(0.18, 0.42) * R, k: i ? i % 3 : 3 });
        }
        burst(it.x, it.y, it.vx, it.vy, [TEA, "#c89058"], 12);
        stain(it.x, it.y, TEA, ang);
        hurt(true);
        return;
      }
      const k = KINDS[it.e]!;
      const gold = it.e === GOLDEN;
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      for (const side of [1, -1]) {
        const push = rand(90, 140);
        halves.push({ x: it.x, y: it.y, vx: it.vx * 0.6 + side * nx * push, vy: it.vy * 0.3 + side * ny * push - 40, rot: it.rot, vr: it.vr * 0.5 + side * rand(1.5, 4), e: it.e, cut: ang - it.rot, side });
      }
      burst(it.x, it.y, it.vx, it.vy, gold ? [k.j, "#ff9aa8", GOLD] : [k.j, k.c[1]], gold ? 40 : 10);
      stain(it.x, it.y, k.j, ang);
      sfx("slice");
      sfx("splat");
      if (gold) {
        sfx("coin");
        sfx("yay");
        setChef(0);
      } else if (Math.random() < 0.3) sfx(Math.random() < 0.5 ? "oof" : "hah", rand(1.6, 1.9)); // a tiny squeak
      const before = mult();
      streak++;
      streakT = 0;
      if (mult() > before) multBump = 1;
      const m = mult() * (gold ? 10 : 1);
      addScore(m);
      pop(it.x, it.y - R * 1.4, `+${m}`, gold ? GOLD : C.apricot, gold ? 46 : 30);
      combo.n++;
      combo.t = 0;
      combo.x = it.x;
      combo.y = it.y;
    };

    const slice = (a: { x: number; y: number }, b: { x: number; y: number }) => {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1) return;
      const ang = Math.atan2(dy, dx);
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i]!;
        const pot = it.e === POT;
        // Produce is caught a little outside its drawing, the teapot only well inside its body.
        if (pot && safe > 0) continue;
        const k = clamp(((it.x - a.x) * dx + (it.y - a.y) * dy) / len2, 0, 1);
        if (Math.hypot(it.x - (a.x + dx * k), it.y + (pot ? R * 0.18 : 0) - (a.y + dy * k)) > R * (pot ? 0.66 : 1.08)) continue;
        items.splice(i, 1);
        cut(it, ang);
        if (over) return;
      }
    };

    const spawn = (d: number) => {
      const speed = 1 + 0.35 * d;
      const g = H * 1.5 * speed * speed;
      const vy = -Math.sqrt(2 * g * H * rand(0.55, 0.8));
      const flight = (2 * -vy) / g;
      const x = rand(0.1, 0.9) * W;
      const r = Math.random();
      const e =
        t > 4 && r < 0.08 + 0.2 * d
          ? POT
          : t > 8 && r > 0.965 && !items.some((i) => i.e === GOLDEN)
            ? GOLDEN
            : Math.floor(Math.random() * GOLDEN);
      if (e === POT) sfx("pop", 1.4); // a porcelain clink
      const pot = e === POT;
      items.push({ x, y: H + R, vx: (rand(0.25, 0.75) * W - x) / flight, vy, g, rot: rand(-0.5, 0.5) + (pot ? 0 : rand(-1, 1)), vr: rand(-1.6, 1.6) * (pot ? 0.6 : 1), e, ph: rand(0, TAU), v0: -vy, pan: 0 });
    };

    const update = (dtReal: number) => {
      const dt = dtReal * (over ? 0.3 : 1);
      t += dt;
      const d = clamp(t / 120, 0, 1);
      if (!over) {
        nextToss -= dt;
        if (nextToss <= 0) {
          nextToss = (1.5 - 0.8 * d) * rand(0.85, 1.15);
          let n = 1;
          if (Math.random() < 0.3 + 0.4 * d) n++;
          if (Math.random() < 0.55 * d) n++;
          if (d > 0.6 && Math.random() < 0.3) n++;
          for (let i = 0; i < n; i++) queue.push(i * 0.12 + 0.001);
          // Now and then the produce yells on the way up.
          if (Math.random() < 0.2 && t - lastWhoa > 5) {
            lastWhoa = t;
            sfx("whoa", 1.7);
          }
        }
        queue = queue
          .map((q) => q - dt)
          .filter((q) => {
            if (q > 0) return true;
            spawn(d);
            return false;
          });
      }
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i]!;
        it.vy += it.g * dt;
        it.x += it.vx * dt;
        it.y += it.vy * dt;
        it.rot += it.vr * dt;
        // Calm on the way up; panic near the top, on the way down and when the blade is close.
        const near = pointer !== -1 && Math.hypot(last.x - it.x, last.y - it.y) < R * 3.2;
        it.pan += ((near || it.vy > -it.v0 * 0.5 ? 1 : 0) - it.pan) * Math.min(1, dtReal * 12);
        if (it.vy > 0 && it.y > H + R * 1.5) {
          items.splice(i, 1);
          if (it.e < GOLDEN) hurt(false);
        }
      }
      for (const h of halves) {
        h.vy += H * 2 * dt;
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        h.rot += h.vr * dt;
      }
      halves = halves.filter((h) => h.y < H + R * 2);
      for (const p of shards) {
        p.vy += H * 1.8 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
      }
      shards = shards.filter((p) => p.y < H + R * 2);
      for (const p of drops) {
        p.vy += 900 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
      }
      drops = drops.filter((p) => p.life > 0);
      for (const s of stains) s.life -= dtReal;
      stains = stains.filter((s) => s.life > 0);
      for (const f of floats) {
        f.y -= 46 * dtReal;
        f.life -= dtReal;
      }
      floats = floats.filter((f) => f.life > 0);
      if (combo.n > 0 && (combo.t += dtReal) > COMBO_GAP) finishCombo();
      if (streak > 0 && (streakT += dtReal) > STREAK_GAP) streak = 0;
      chef.t += dtReal;
      safe = Math.max(0, safe - dtReal);
      flash = Math.max(0, flash - dtReal * 2.5);
      shake = Math.max(0, shake - dtReal * 3);
      lifeBump = Math.max(0, lifeBump - dtReal * 2);
      multBump = Math.max(0, multBump - dtReal * 4);
      if (over && (overT += dtReal) > 1) {
        finished = true;
        api.gameOver(score);
      }
    };

    const drawTrail = () => {
      pts = pts.filter((p) => clock - p.t < TRAIL);
      const n = pts.length;
      if (n < 2) return;
      // A tapered ribbon: a point at the tail, widest just behind the blade.
      for (const [col, wid, al] of [
        [C.apricot, 16, 0.4],
        ["#fffdf3", 6, 1],
      ] as const) {
        const l: number[] = [];
        const r: number[] = [];
        for (let i = 0; i < n; i++) {
          const p = pts[i]!;
          const a = pts[Math.max(0, i - 1)]!;
          const b = pts[Math.min(n - 1, i + 1)]!;
          const dl = Math.hypot(b.x - a.x, b.y - a.y) || 1;
          const w = (wid / 2) * (i / (n - 1)) ** 0.7 * (1 - (clock - p.t) / TRAIL) ** 0.5;
          const ox = (-(b.y - a.y) / dl) * w;
          const oy = ((b.x - a.x) / dl) * w;
          l.push(p.x + ox, p.y + oy);
          r.unshift(p.x - ox, p.y - oy);
        }
        ctx.globalAlpha = al;
        poly(ctx, [...l, ...r]);
        F(ctx, col);
      }
      ctx.globalAlpha = 1;
    };

    const draw = () => {
      if (board) ctx.drawImage(board, 0, 0, W, H);
      else {
        ctx.fillStyle = C.tufa;
        ctx.fillRect(0, 0, W, H);
      }
      ctx.save();
      ctx.lineCap = ctx.lineJoin = "round";
      if (shake > 0) ctx.translate(rand(-1, 1) * shake * 10, rand(-1, 1) * shake * 10);
      for (const s of stains) {
        ctx.globalAlpha = 0.5 * Math.min(1, s.life / 1.5);
        ctx.beginPath();
        for (let i = 0; i < s.b.length; i += 3) {
          ctx.moveTo(s.x + s.b[i]! + s.b[i + 2]!, s.y + s.b[i + 1]!);
          ctx.arc(s.x + s.b[i]!, s.y + s.b[i + 1]!, s.b[i + 2]!, 0, TAU);
        }
        F(ctx, s.col);
      }
      ctx.globalAlpha = 1;
      px = 1 / R;
      for (const h of halves) {
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.rotate(h.rot + h.cut);
        ctx.beginPath();
        ctx.rect(-R * 1.5, h.side > 0 ? 0 : -R * 1.5, R * 3, R * 1.5);
        ctx.clip();
        ctx.rotate(-h.cut);
        blit(ctx, h.e, 0, R);
        // Half a shocked face on each half.
        ctx.save();
        ctx.scale(R, R);
        face(ctx, h.e, 2, 0, 0);
        ctx.restore();
        // The cut face, tilted toward us: the cross-section squashed onto the cut line.
        ctx.rotate(h.cut);
        ctx.scale(1, 0.42);
        ctx.rotate(-h.cut);
        blit(ctx, h.e, 1, R);
        ctx.restore();
      }
      for (const it of items) {
        const pot = it.e === POT;
        ctx.save();
        ctx.translate(it.x, it.y);
        ctx.globalAlpha = pot && safe > 0 ? 0.45 : 1;
        if (it.e === GOLDEN) {
          ctx.globalAlpha = 0.22 + 0.12 * Math.sin(clock * 6);
          E(ctx, 0, 0, R * 1.45, R * 1.45);
          F(ctx, GOLD);
          ctx.globalAlpha = 1;
          star(ctx, Math.cos(clock * 3) * R * 1.2, Math.sin(clock * 3) * R * 1.2, R * 0.3, "#fff6c8");
          star(ctx, -Math.cos(clock * 2) * R * 1.1, -Math.sin(clock * 2) * R * 1.1, R * 0.2, "#fff6c8");
        }
        ctx.save();
        ctx.globalAlpha *= 0.15;
        ctx.translate(R * 0.16, R * 0.3);
        ctx.rotate(it.rot);
        blit(ctx, it.e, 2, R);
        ctx.restore();
        ctx.rotate(it.rot);
        blit(ctx, it.e, 0, R);
        ctx.scale(R, R);
        if (pot) {
          // Steam from the spout: grandma's tea is still hot.
          for (let i = 0; i < 2; i++) {
            const w = Math.sin(clock * 6 + it.ph + i * 2) * 0.12;
            line(ctx, 1.28 + i * 0.12, -0.66, 1.18 + w, -0.95 - i * 0.1, 1.36 - w, -1.25 - i * 0.12);
            S(ctx, "rgba(255,255,255,0.75)", 3);
          }
        } else {
          // Pupils follow the blade.
          let lx = 0;
          let ly = 0;
          if (pointer !== -1) {
            const dx = last.x - it.x;
            const dy = last.y - it.y;
            const dl = Math.hypot(dx, dy) || 1;
            const c = Math.cos(it.rot);
            const s = Math.sin(it.rot);
            lx = (dx * c + dy * s) / dl;
            ly = (dy * c - dx * s) / dl;
          }
          face(ctx, it.e, it.pan > 0.5 ? 1 : 0, lx, ly);
        }
        ctx.restore();
      }
      for (const p of shards) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.k > 2) {
          ctx.scale(R, R);
          ctx.translate(0, 0.5);
          LID(ctx);
        } else {
          ctx.scale(p.s, p.s);
          px = 1 / p.s;
          poly(ctx, [-1, -0.7, 1, -0.3, -0.1, 0.9]);
          F(ctx, SHARD[p.k]!);
          S(ctx, OUT, 1.5);
          px = 1 / R;
        }
        ctx.restore();
      }
      for (const p of drops) {
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
        E(ctx, p.x, p.y, p.r, p.r);
        F(ctx, p.col);
      }
      ctx.globalAlpha = 1;
      if (chef.t < CHEF) {
        const ct = chef.t;
        const x = Math.min(1, ct / 0.22) - 1;
        const up = ct < 0.22 ? 1 + 2.7 * x ** 3 + 1.7 * x ** 2 : Math.min(1, (CHEF - ct) / 0.25);
        const cs = R * 1.1;
        ctx.save();
        ctx.translate(cs * 1.5, H + cs * 2.3 - up * cs * 3.5);
        ctx.rotate(0.2 + (chef.k === 1 && !still ? Math.sin(ct * 16) * 0.07 : 0));
        ctx.scale(cs, cs);
        px = 1 / cs;
        drawChef(ctx, chef.k, ct);
        ctx.restore();
      }
      drawTrail();
      for (const f of floats) {
        const age = 0.9 - f.life;
        const s = f.s * (1 + 0.6 * Math.max(0, 1 - age * 8));
        ctx.globalAlpha = clamp(f.life * 2.5, 0, 1);
        label(ctx, f.text, f.x + 1.5, f.y + 2, s, C.ink);
        label(ctx, f.text, f.x, f.y, s, f.col);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      if (flash > 0) {
        ctx.globalAlpha = flash * 0.35;
        ctx.fillStyle = C.pomegranate;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
      // HUD: pomegranate lives top-left; score top-right with the multiplier beside it.
      for (let i = 0; i < LIVES; i++) {
        ctx.save();
        ctx.translate(22 + i * 28, 30);
        const sc = i === lives - 1 ? 1 + lifeBump * 0.5 : 1;
        ctx.scale(sc, sc);
        ctx.globalAlpha = i < lives ? (safe > 0 && !still && Math.floor(clock * 8) % 2 ? 0.45 : 1) : 0.22;
        blit(ctx, POM, 0, 11);
        ctx.restore();
      }
      label(ctx, String(score), W - 15, 32, 34, C.ink, "right");
      label(ctx, String(score), W - 16, 30, 34, C.matsoni, "right");
      const m = mult();
      if (m > 1) {
        const sw = ctx.measureText(String(score)).width;
        const s = 1 + multBump * 0.35;
        ctx.save();
        ctx.translate(W - 16 - sw - 32, 30);
        ctx.scale(s, s);
        roundRect(ctx, -22, -14, 44, 28, 14);
        F(ctx, C.apricot);
        ctx.strokeStyle = C.ink;
        ctx.lineWidth = 2;
        ctx.stroke();
        label(ctx, `×${m}`, 0, 1, 18, C.ink);
        ctx.globalAlpha = 0.8;
        roundRect(ctx, -16, 17, 32 * (1 - streakT / STREAK_GAP), 3, 1.5);
        F(ctx, C.matsoni);
        ctx.restore();
      }
    };

    // --- Input: a pointer drag is the blade.
    const down = (e: PointerEvent) => {
      e.preventDefault();
      if (pointer !== -1) return;
      pointer = e.pointerId;
      canvas.setPointerCapture?.(e.pointerId);
      last = pointerPos(canvas, e);
      pts = [{ ...last, t: clock }];
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      e.preventDefault();
      const p = pointerPos(canvas, e);
      pts.push({ ...p, t: clock });
      if (!over && !api.isPaused()) slice(last, p);
      last = p;
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointer) return;
      e.preventDefault();
      pointer = -1;
      finishCombo();
    };
    const stopTouch = (e: TouchEvent) => e.preventDefault();
    const prevTouchAction = canvas.style.touchAction;
    canvas.style.touchAction = "none";
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    canvas.addEventListener("touchstart", stopTouch, { passive: false });
    canvas.addEventListener("touchmove", stopTouch, { passive: false });

    const stopLoop = loop(api, (dt, paused) => {
      clock += dt;
      if (!paused && !finished) update(dt);
      draw();
    });

    return () => {
      stopLoop();
      fc.stop();
      sprites.clear();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("touchstart", stopTouch);
      canvas.removeEventListener("touchmove", stopTouch);
      canvas.style.touchAction = prevTouchAction;
    };
  },
};
