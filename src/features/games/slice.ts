// "Chef's Knife": vegetables are tossed up from the bottom of a wooden board.
// Swipe across them to slice; sliced hot coals and dropped vegetables cost a
// life. No words on the canvas (the host shows the title and rules).
//
// Art direction
// - Mood: a sunny Yerevan kitchen at lunch; quick, playful knife work on a
//   well-loved cutting board. Warm, fresh, a little splashy.
// - Camera and scale: top-down, static, one screen that fits the phone
//   (360–430 px portrait; desktop the same). Everything scales from R, 8.5% of
//   the short side (26–46 px). Vector art at device resolution, smoothing on.
// - Shapes: produce is round and soft, each with its own outline (round
//   tomato, lobed pepper, bulb eggplant, long cucumber, teardrop onion, creased
//   apricot, pointed lemon, tapered carrot, crowned pomegranate). The hot coal
//   is the only jagged, angular shape.
// - Values: the board stays in a narrow band of mid warm tans; produce is the
//   most saturated thing on screen; the coal is the darkest shape with the
//   brightest glow; the blade is the lightest.
// - Palette: ground = wood tans on tufa stone (C.tufa, C.tufaDark); produce in
//   its own fresh colours; threat = basalt (C.basalt, C.basalt3) with apricot
//   glow (C.apricot); accent = pomegranate (C.pomegranate) for lives and the
//   hurt flash; HUD = matsoni over ink. Light warm from the top-left, shadows
//   deeper and cooler toward the bottom-right.
// - Detail: on the produce and most of all on the cut faces (seeds, rings,
//   stone); the board stays quiet behind play: soft grain, a juice groove.
// - Rules: one 2.2 px warm-brown outline on everything in play, none on the
//   board; one shading model (radial light from the top-left plus one gloss);
//   juice and stains in flat colour.
// - Signature: lives are little pomegranates, and an arevakhach (eternity
//   sign) is burned faintly into the board.
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
  f: (g: G) => void; // cut face, clipped to the inset silhouette
};
type Item = { x: number; y: number; vx: number; vy: number; g: number; rot: number; vr: number; e: number; coal: boolean; ph: number };
type Half = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; e: number; cut: number; side: number };
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
const OUT = "rgba(59,34,22,0.9)";
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
      for (const y of [-0.3, -0.06, 0.16]) {
        line(g, -1, y, 0, y - 0.12, 1, y);
        S(g, "rgba(200,240,160,0.35)", 3);
      }
      for (let i = 0; i < 12; i++) {
        E(g, -0.9 + i * 0.16, i % 2 ? -0.2 : 0.05, 0.03, 0.03);
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
      for (let i = -2; i < 3; i++) {
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
      g.globalAlpha = 0.45;
      E(g, 0.4, 0.25, 0.6, 0.55);
      F(g, "#e0603a");
      g.globalAlpha = 1;
      line(g, 0, -0.78, -0.3, 0.1, -0.05, 0.92);
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
    // lemon
    c: ["#fff3a0", "#f2cc2a", "#b88a0a"],
    j: "#f4dc4a",
    gl: 1,
    p: (g) => blob(g, [-1.15, 0, -1, -0.16, -0.95, -0.2, -0.85, -0.3, -0.5, -0.85, 0.5, -0.85, 0.85, -0.3, 0.95, -0.2, 1, -0.16, 1.15, 0, 1, 0.16, 0.95, 0.2, 0.85, 0.3, 0.5, 0.85, -0.5, 0.85, -0.85, 0.3, -0.95, 0.2, -1, 0.16, -1.15, 0]),
    d: (g) => {
      for (let i = 0; i < 18; i++) {
        E(g, Math.cos(i * 2.4) * 0.7 * Math.sqrt(i / 18), Math.sin(i * 2.4) * 0.5 * Math.sqrt(i / 18), 0.02, 0.02);
        F(g, "rgba(150,110,0,0.25)");
      }
    },
    f: (g) => {
      bg(g, "#fffbe4");
      for (let i = 0; i < 8; i++) {
        const a = (i * TAU) / 8;
        g.beginPath();
        g.moveTo(Math.cos(a + 0.39) * 0.08, Math.sin(a + 0.39) * 0.06);
        g.ellipse(0, 0, 0.84, 0.6, 0, a + 0.09, a + 0.7);
        g.closePath();
        F(g, "#f9db4a");
      }
    },
  },
  {
    // carrot
    c: ["#ffb866", "#f07d1e", "#a8440a"],
    j: "#f39a3a",
    gl: 0,
    p: (g) => blob(g, [-0.85, -0.38, -0.2, -0.42, 0.7, -0.15, 1.22, 0.03, 0.7, 0.18, -0.2, 0.42, -0.85, 0.38, -0.98, 0.25, -0.98, -0.25, -0.85, -0.38]),
    d: (g) => {
      line(g, -0.85, -0.2, 0, -0.26, 0.9, -0.04);
      S(g, "rgba(255,225,170,0.5)", 3);
      for (let i = 0; i < 5; i++) {
        const x = -0.6 + i * 0.32;
        const h = 0.36 - i * 0.06;
        line(g, x, -h, x + 0.06, 0, x, h * 0.5);
        S(g, "rgba(140,50,0,0.35)", 1.4);
      }
    },
    t: (g) => {
      for (const [x, y] of [[-1.3, -0.4], [-1.34, 0], [-1.28, 0.36]]) {
        line(g, -0.92, 0, (-0.92 + x!) / 2, y! * 0.3, x!, y!);
        S(g, "#2f6a22", 6);
        line(g, -0.92, 0, (-0.92 + x!) / 2, y! * 0.3, x!, y!);
        S(g, "#5aa83a", 3.5);
      }
    },
    f: (g) => {
      bg(g, "#f5933a");
      E(g, -0.05, 0, 0.85, 0.14);
      F(g, "#fbbd6a");
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
  {
    // hot coal: jagged basalt; its "face" is the glowing layer that pulses
    c: ["#4a4a44", C.basalt3, C.basalt],
    j: C.basalt,
    gl: 0,
    p: (g) => {
      const r = [1, 0.74, 0.95, 0.7, 0.98, 0.78, 0.93, 0.68, 1, 0.8, 0.9];
      poly(
        g,
        r.flatMap((v, i) => [Math.cos((i * TAU) / 11) * v * 0.92, Math.sin((i * TAU) / 11) * v * 0.85]),
      );
    },
    d: (g) => COAL_CRACKS(g, C.apricotDeep, 3),
    f: (g) => {
      const h = g.createRadialGradient(0, 0, 0.4, 0, 0, 1.4);
      h.addColorStop(0, "rgba(242,162,58,0.55)");
      h.addColorStop(1, "rgba(242,162,58,0)");
      bg(g, h);
      KINDS[9]!.p(g);
      g.save();
      g.clip();
      bg(g, C.basalt3);
      COAL_CRACKS(g, C.apricotDeep, 7);
      COAL_CRACKS(g, C.apricot, 3.5);
      COAL_CRACKS(g, "#ffe8b0", 1.4);
      g.restore();
      KINDS[9]!.p(g);
      S(g, "#000", 2.2);
    },
  },
];
const COAL = 9;

function COAL_CRACKS(g: G, col: string, w: number) {
  g.beginPath();
  g.moveTo(-0.6, -0.4);
  g.lineTo(-0.15, -0.05);
  g.lineTo(-0.35, 0.35);
  g.moveTo(-0.15, -0.05);
  g.lineTo(0.25, 0.12);
  g.lineTo(0.6, 0.45);
  g.moveTo(0.25, 0.12);
  g.lineTo(0.3, -0.4);
  g.lineTo(0.65, -0.5);
  S(g, col, w);
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

function drawFace(g: G, k: Kind) {
  if (k === KINDS[COAL]) return k.f(g);
  k.p(g);
  F(g, k.c[1]);
  g.save();
  g.scale(0.86, 0.86);
  k.p(g);
  g.clip();
  k.f(g);
  g.restore();
  k.p(g);
  S(g, OUT, 2.2);
}

/** One produce drawing (skin, cut face or shadow) per kind and size, drawn once into its own canvas. */
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
      } else (mode ? drawFace : drawSkin)(g, kind);
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
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.4, w / 2, h / 2, Math.hypot(w, h) / 2);
  v.addColorStop(0, "rgba(60,30,10,0)");
  v.addColorStop(1, "rgba(60,30,10,0.28)");
  g.globalAlpha = 1;
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  g.restore();
  g.globalAlpha = 0.6;
  g.lineWidth = 2;
  g.strokeStyle = "#7d4a24";
  roundRect(g, m, m, bw, bh, 24);
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
    const mult = () => Math.min(5, 1 + Math.floor(streak / 4));
    api.setScore(0);

    const pop = (x: number, y: number, text: string, col: string = C.apricot, s = 30) =>
      floats.push({ x: clamp(x, 30, W - 30), y, text, life: 0.9, col, s });

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

    const hurt = (f: number) => {
      if (over || safe > 0) return;
      lives--;
      safe = SAFE;
      streak = 0;
      nextToss = Math.max(nextToss, 0.9);
      if (!still) {
        flash = f;
        shake = f;
      }
      if (lives <= 0) {
        over = true;
        sfx("lose");
      } else sfx("bad");
    };

    const finishCombo = () => {
      if (combo.n >= 3 && !over) {
        addScore(combo.n);
        pop(combo.x, combo.y - R * 1.4, `+${combo.n}`, C.matsoni, 40);
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
      if (it.coal) {
        burst(it.x, it.y, it.vx, it.vy, [C.apricot, "#ffe2a8", C.basalt3], 18);
        stain(it.x, it.y, C.basalt, ang);
        hurt(1);
        return;
      }
      const k = KINDS[it.e]!;
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      for (const side of [1, -1]) {
        const push = rand(70, 120);
        halves.push({ x: it.x, y: it.y, vx: it.vx * 0.6 + side * nx * push, vy: it.vy * 0.3 + side * ny * push - 40, rot: it.rot, vr: it.vr * 0.5 + side * rand(1.5, 4), e: it.e, cut: ang - it.rot, side });
      }
      burst(it.x, it.y, it.vx, it.vy, [k.j, k.c[1]], 10);
      stain(it.x, it.y, k.j, ang);
      sfx("slice");
      const before = mult();
      streak++;
      streakT = 0;
      if (mult() > before) multBump = 1;
      const m = mult();
      addScore(m);
      pop(it.x, it.y - R * 0.6, `+${m}`);
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
        // Produce is caught a little outside its drawing, coals only well inside theirs.
        if (it.coal && safe > 0) continue;
        const k = clamp(((it.x - a.x) * dx + (it.y - a.y) * dy) / len2, 0, 1);
        if (Math.hypot(it.x - (a.x + dx * k), it.y - (a.y + dy * k)) > R * (it.coal ? 0.72 : 1.08)) continue;
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
      const coal = t > 4 && Math.random() < 0.08 + 0.2 * d;
      items.push({ x, y: H + R, vx: (rand(0.25, 0.75) * W - x) / flight, vy, g, rot: rand(0, TAU), vr: rand(-4, 4), e: coal ? COAL : Math.floor(Math.random() * COAL), coal, ph: rand(0, TAU) });
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
        if (it.vy > 0 && it.y > H + R * 1.5) {
          items.splice(i, 1);
          if (!it.coal) hurt(0.5);
        }
      }
      for (const h of halves) {
        h.vy += H * 2 * dt;
        h.x += h.vx * dt;
        h.y += h.vy * dt;
        h.rot += h.vr * dt;
      }
      halves = halves.filter((h) => h.y < H + R * 2);
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
      if (shake > 0) ctx.translate(rand(-1, 1) * shake * 10, rand(-1, 1) * shake * 10);
      for (const s of stains) {
        ctx.globalAlpha = 0.42 * Math.min(1, s.life / 1.5);
        ctx.beginPath();
        for (let i = 0; i < s.b.length; i += 3) {
          ctx.moveTo(s.x + s.b[i]! + s.b[i + 2]!, s.y + s.b[i + 1]!);
          ctx.arc(s.x + s.b[i]!, s.y + s.b[i + 1]!, s.b[i + 2]!, 0, TAU);
        }
        F(ctx, s.col);
      }
      for (const h of halves) {
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.rotate(h.rot + h.cut);
        ctx.beginPath();
        ctx.rect(-R * 1.5, h.side > 0 ? 0 : -R * 1.5, R * 3, R * 1.5);
        ctx.clip();
        ctx.rotate(-h.cut);
        blit(ctx, h.e, 0, R);
        // The cut face, tilted toward us: the cross-section squashed onto the cut line.
        ctx.rotate(h.cut);
        ctx.scale(1, 0.5);
        ctx.rotate(-h.cut);
        blit(ctx, h.e, 1, R);
        ctx.restore();
      }
      for (const it of items) {
        ctx.save();
        if (it.coal) {
          ctx.globalAlpha = safe > 0 ? 0.45 : 1;
          ctx.translate(it.x, it.y);
          ctx.rotate(it.rot);
          blit(ctx, COAL, 0, R);
          ctx.globalAlpha *= 0.55 + 0.45 * Math.sin(clock * 7 + it.ph);
          blit(ctx, COAL, 1, R);
        } else {
          ctx.translate(it.x, it.y);
          ctx.globalAlpha = 0.15;
          ctx.translate(R * 0.16, R * 0.3);
          ctx.rotate(it.rot);
          blit(ctx, it.e, 2, R);
          ctx.globalAlpha = 1;
          ctx.rotate(-it.rot);
          ctx.translate(-R * 0.16, -R * 0.3);
          ctx.rotate(it.rot);
          blit(ctx, it.e, 0, R);
        }
        ctx.restore();
      }
      for (const p of drops) {
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
        E(ctx, p.x, p.y, p.r, p.r);
        F(ctx, p.col);
      }
      ctx.globalAlpha = 1;
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
        blit(ctx, 8, 0, 11);
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
