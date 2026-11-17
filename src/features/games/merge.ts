// "Merge the Feast": swipe to slide a 4x4 table of dishes; two equal dishes
// that meet become the next dish. Reach the cake. No words on the canvas.
//
// Art direction
// - Mood: a Sunday family table in a Yerevan café; warm, generous, a little
//   festive. Every merge puts something better on the table.
// - Camera and scale: static top-down board, the whole table in view; drawn
//   in CSS px at device resolution, art authored on a 100-unit box per tile.
// - Shapes: round and soft. Tiles are glazed ceramic squares with big radii;
//   each dish is a chunky flat-vector illustration with its own silhouette
//   (sprig, ball, capsule, teardrop, pear, sheet, wedge, knot, stick, plate,
//   bunch, tiers), readable at 70 px.
// - Values: dishes brightest (cream rim + ink outline), tiles mid, the walnut
//   table darkest; the linen cloth sits between so the board reads first.
// - Palette: walnut table (ground), linen cloth (stage), tile glaze from
//   tarragon tint through apricot and tufa to pomegranate and wine (progress),
//   pomegranate embroidery (accent), gold for score and the cake. Lights warm
//   (lamp glow, cream highlights), shadows warm-dark brown, never grey.
// - Detail: on the dishes (seeds, grill marks, pleats, holes); kept out of the
//   cloth and cells behind play.
// - Rules: one outline rule (2-unit walnut-ink contour plus a 5-unit cream
//   sticker rim, outer silhouette only); one shading model (a soft gradient
//   from a top-left light plus one white glint); no emoji or font glyphs.
// - Signature: the cloth's pomegranate-red cross-stitch border, like an
//   Armenian embroidered tablecloth, under a warm lamp glow.
import { C, fitCanvas, label, loop, onSwipe, pointerPos, roundRect, type Game, type Size } from "./engine";

type Dir = "up" | "down" | "left" | "right";
type Sprite = { t: number; fr: number; fc: number; tr: number; tc: number };
type Bit = { x: number; y: number; vx: number; vy: number; a: number; m: number; c: string; k: number; s: number };
type Pop = { x: number; y: number; a: number; v: number };
type X = CanvasRenderingContext2D;
type Cv = HTMLCanvasElement;

const N = 4;
const MAX = 12;
const SLIDE = 0.1;
const POP = 0.2;
const INK = "#3b2216";
const CREAM = "#fff8ec";
const LINEN = "#f3e8d2";
// Tile glaze warms up from herb green to wine, then the gold-rimmed cake.
const TILE = ["", "#dcebdc", "#eef0c8", "#f7e3a6", "#f6cf7c", C.apricot, "#e8924a", C.tufa, "#c9694f", "#c04a52", C.pomegranate, "#8a1a36", "#5e1229"];
// The main colour of each dish, for the crumbs of a merge.
const BIT = ["", "#5cc48e", "#e0402e", "#4f9a45", "#e0a456", "#7a3590", "#e8c27a", "#ffcf4a", "#f4e7cc", "#9a5530", "#d88a3a", "#9a4fb0", "#ffe08a"];

const mk = (w: number, h = w): Cv => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
};
const g2 = (c: Cv) => c.getContext("2d")!;
const mix = (h: string, k: number) => {
  const n = parseInt(h.slice(1), 16);
  const f = (v: number) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

// --- Drawing helpers on the 100-unit art box -------------------------------
const fill = (x: X, c: string | CanvasGradient) => {
  x.fillStyle = c;
  x.fill();
};
const ell = (x: X, cx: number, cy: number, rx: number, ry: number, c: string | CanvasGradient, r = 0) => {
  x.beginPath();
  x.ellipse(cx, cy, rx, ry, r, 0, 7);
  fill(x, c);
};
const path = (x: X, p: number[]) => {
  x.beginPath();
  for (let i = 0; i < p.length; i += 2) x.lineTo(p[i]!, p[i + 1]!);
};
const poly = (x: X, c: string, ...p: number[]) => {
  path(x, p);
  x.closePath();
  fill(x, c);
};
const line = (x: X, c: string, w: number, ...p: number[]) => {
  path(x, p);
  x.strokeStyle = c;
  x.lineWidth = w;
  x.lineCap = x.lineJoin = "round";
  x.stroke();
};
const box = (x: X, l: number, t: number, w: number, h: number, r: number, c: string | CanvasGradient) => {
  roundRect(x, l, t, w, h, r);
  fill(x, c);
};
const rad = (x: X, cx: number, cy: number, r: number, a: string, b: string) => {
  const g = x.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, a);
  g.addColorStop(1, b);
  return g;
};
const shine = (x: X, cx: number, cy: number, rx: number, ry: number, r = -0.5) =>
  ell(x, cx, cy, rx, ry, "rgba(255,255,255,.55)", r);
const star = (x: X, cx: number, cy: number, n: number, R: number, r: number, c: string, rot = 0) => {
  const p: number[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n - Math.PI / 2;
    const d = i % 2 ? r : R;
    p.push(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
  }
  poly(x, c, ...p);
};
// A rounded bulb, narrow at the top: onion, dumpling.
const bulb = (x: X, ty: number, hw: number, by: number) => {
  const h = by - ty;
  x.beginPath();
  x.moveTo(50, ty);
  x.bezierCurveTo(50 + hw * 0.25, ty + h * 0.25, 50 + hw, ty + h * 0.3, 50 + hw, ty + h * 0.66);
  x.bezierCurveTo(50 + hw, by, 50 + hw * 0.4, by, 50, by);
  x.bezierCurveTo(50 - hw * 0.4, by, 50 - hw, by, 50 - hw, ty + h * 0.66);
  x.bezierCurveTo(50 - hw, ty + h * 0.3, 50 - hw * 0.25, ty + h * 0.25, 50, ty);
};
const leaf = (x: X, cx: number, cy: number, r: number, s = 1, c = "#3fa66a") => {
  ell(x, cx, cy, 15 * s, 7 * s, c, r);
  const dx = Math.cos(r) * 11 * s;
  const dy = Math.sin(r) * 11 * s;
  line(x, "rgba(220,255,220,.6)", 1.5, cx - dx, cy - dy, cx + dx, cy + dy);
};
const at = (x: X, cx: number, cy: number, r: number, f: () => void) => {
  x.save();
  x.translate(cx, cy);
  x.rotate(r);
  f();
  x.restore();
};

// One illustration per tier, inside 7..93 of a 100-unit box.
const ART: ((x: X) => void)[] = [
  () => {},
  // 1 herb sprig (tarragon)
  (x) => {
    line(x, "#2f7a45", 4, 52, 93, 49, 70, 53, 42, 50, 14);
    for (const [cx, cy, r] of [[36, 78, 0.45], [64, 66, -0.45], [37, 54, 0.5], [64, 40, -0.5], [39, 30, 0.6], [61, 20, -0.7]]) leaf(x, cx!, cy!, r!);
    ell(x, 50, 12, 6, 10, "#3fa66a");
  },
  // 2 tomato
  (x) => {
    ell(x, 50, 58, 37, 32, rad(x, 50, 58, 37, "#ff7c5e", "#c2241b"));
    line(x, "rgba(150,20,15,.35)", 2, 38, 34, 34, 52);
    line(x, "rgba(150,20,15,.35)", 2, 62, 34, 66, 52);
    shine(x, 33, 47, 9, 5);
    star(x, 50, 31, 5, 17, 5, "#3d9a4a");
    line(x, "#2f7a3a", 4.5, 50, 30, 54, 17);
  },
  // 3 cucumber, one end cut
  (x) =>
    at(x, 50, 52, -0.6, () => {
      const g = x.createLinearGradient(0, -15, 0, 15);
      g.addColorStop(0, "#77c260");
      g.addColorStop(1, "#24622f");
      box(x, -44, -15, 88, 30, 15, g);
      line(x, "rgba(210,245,180,.55)", 2.5, -34, -6, 26, -6);
      for (const p of [-26, -8, 12]) ell(x, p, 5, 2, 1.5, "#1d4f26");
      ell(x, 38, 0, 7, 14, "#d9f0b4");
      ell(x, 38, 0, 3, 7, "#b6dc8a");
    }),
  // 4 onion with a sprout
  (x) => {
    line(x, "#4f9a45", 5, 50, 24, 42, 6);
    line(x, "#5cb04f", 5, 50, 24, 60, 8);
    line(x, "#efe0bc", 2, 46, 89, 42, 95);
    line(x, "#efe0bc", 2, 54, 89, 58, 95);
    bulb(x, 20, 34, 90);
    fill(x, rad(x, 50, 62, 34, "#f6c47a", "#b3602a"));
    x.strokeStyle = "rgba(120,55,20,.4)";
    x.lineWidth = 2;
    for (const k of [-16, 0, 16]) {
      x.beginPath();
      x.moveTo(50, 24);
      x.quadraticCurveTo(50 + k * 1.6, 56, 50 + k * 0.7, 88);
      x.stroke();
    }
    shine(x, 36, 52, 4, 9, 0.2);
  },
  // 5 eggplant
  (x) =>
    at(x, 52, 52, 0.55, () => {
      const g = rad(x, 0, 6, 34, "#a565bd", "#3e1550");
      ell(x, 0, 14, 23, 25, g);
      ell(x, 0, -12, 15, 20, g);
      shine(x, -10, 12, 4, 11, 0.1);
      star(x, 0, -27, 5, 15, 6, "#3f8f3c");
      line(x, "#3f8f3c", 5, 0, -30, 3, -42);
    }),
  // 6 lavash: two thin sheets with blistered spots and grill marks
  (x) =>
    at(x, 50, 52, -0.18, () => {
      const sheet = (c: string) => {
        x.beginPath();
        for (let a = 0; a < 6.3; a += 0.15) {
          const k = 1 + 0.05 * Math.sin(a * 5) + 0.03 * Math.sin(a * 11);
          x.lineTo(Math.cos(a) * 44 * k, Math.sin(a) * 25 * k);
        }
        fill(x, c);
      };
      at(x, 2, 7, 0.22, () => sheet("#d9ad66"));
      sheet("#f4dcaa");
      x.save();
      x.clip();
      for (let i = -4; i < 5; i++) line(x, "rgba(150,85,30,.4)", 3.5, i * 13 - 14, 30, i * 13 + 14, -30);
      for (const [cx, cy, r] of [[-26, -8, 5], [12, 12, 6], [26, -12, 4], [-6, 2, 3], [-18, 13, 4], [34, 6, 3]]) ell(x, cx!, cy!, r!, r! * 0.7, "#9a5626");
      x.restore();
    }),
  // 7 cheese wedge with holes
  (x) => {
    poly(x, "#ffd95e", 9, 58, 91, 58, 66, 20);
    poly(x, "#f0a52c", 9, 58, 91, 58, 91, 82, 9, 82);
    line(x, "#fff0a8", 2.5, 12, 58, 88, 58);
    for (const [cx, cy, rx] of [[26, 70, 6], [52, 75, 4], [74, 68, 6], [54, 44, 6], [66, 32, 3.5], [36, 51, 4]]) ell(x, cx!, cy!, rx!, rx! * 0.7, cy! > 60 ? "#c47e17" : "#e5b13a");
  },
  // 8 khinkali dumpling with pleats
  (x) => {
    bulb(x, 28, 40, 86);
    fill(x, rad(x, 50, 62, 40, "#fff6e2", "#d6b98a"));
    x.strokeStyle = "rgba(150,110,60,.45)";
    x.lineWidth = 2;
    for (let i = -3; i <= 3; i++) {
      x.beginPath();
      x.moveTo(50, 30);
      x.quadraticCurveTo(50 + i * 14, 44, 50 + i * 11.5, 80 - Math.abs(i) * 4);
      x.stroke();
    }
    ell(x, 50, 22, 8, 11, rad(x, 50, 22, 10, "#fff6e2", "#d9bf90"));
    shine(x, 34, 60, 5, 10, 0.3);
  },
  // 9 khorovats skewer
  (x) =>
    at(x, 50, 50, -0.65, () => {
      line(x, "#8c969b", 3.5, -47, 0, 46, 0);
      x.beginPath();
      x.arc(-46, 0, 6, 0, 7);
      x.lineWidth = 3;
      x.strokeStyle = "#8c969b";
      x.stroke();
      const meat = (p: number) => {
        box(x, p - 8, -12, 16, 24, 6, rad(x, p, 0, 14, "#b8683a", "#6a2e14"));
        line(x, "#3d170a", 2.5, p - 4, -6, p + 3, -9);
        line(x, "#3d170a", 2.5, p - 3, 5, p + 4, 2);
      };
      meat(-28);
      ell(x, -16, 0, 4.5, 12, "#e0402e");
      meat(-4);
      box(x, 7, -11, 7, 22, 3, "#3f9a3f");
      meat(24);
      ell(x, 36, 0, 4, 10, "#f0e3f0");
    }),
  // 10 roast chicken on a plate
  (x) => {
    ell(x, 50, 72, 44, 16, "#e6dccb");
    ell(x, 50, 71, 35, 11, "#faf6ee");
    for (const s of [-1, 1]) {
      ell(x, 50 + s * 22, 46, 9, 14, "#b5652a", s * 0.65);
      line(x, "#fbf3e2", 4, 50 + s * 27, 38, 50 + s * 33, 29);
      ell(x, 50 + s * 34, 27, 4, 4, "#fbf3e2");
    }
    ell(x, 50, 60, 30, 19, rad(x, 50, 60, 30, "#f0b060", "#a14c1b"));
    shine(x, 40, 53, 8, 4, -0.3);
    leaf(x, 15, 70, 0.4, 0.55, "#4f9a45");
    leaf(x, 85, 70, -0.4, 0.55, "#4f9a45");
  },
  // 11 grape bunch with a leaf
  (x) => {
    leaf(x, 68, 17, -0.4, 1.1, "#4f9a45");
    line(x, "#7a4a22", 3.5, 50, 26, 49, 12, 55, 7);
    for (const [y, xs] of [[85, [50]], [73, [41, 59]], [60, [33, 50, 67]], [46, [25, 42, 58, 75]], [32, [34, 50, 66]]] as const) {
      for (const cx of xs) {
        ell(x, cx, y, 9.5, 9.5, rad(x, cx, y, 9.5, "#b878cc", "#4b175c"));
        ell(x, cx - 3, y - 3.5, 2.2, 1.6, "rgba(255,255,255,.6)");
      }
    }
  },
  // 12 celebration cake with pomegranate seeds and a candle
  (x) => {
    ell(x, 50, 86, 44, 8, "#e6dccb");
    const tier = (l: number, t: number, w: number, h: number) => {
      box(x, l, t, w, h, 5, "#f4d8b0");
      line(x, "#e57f92", 3, l + 2, t + h * 0.62, l + w - 2, t + h * 0.62);
      box(x, l - 1, t, w + 2, 8, 5, CREAM);
      for (let d = l + 5; d < l + w - 2; d += 9) ell(x, d, t + 8, 3.5, 4.5, CREAM);
    };
    tier(15, 58, 70, 28);
    tier(28, 37, 44, 24);
    for (const [cx, cy] of [[36, 39], [44, 38], [58, 39], [65, 40], [52, 41]]) ell(x, cx!, cy!, 2.4, 2, C.pomegranate);
    box(x, 47.5, 19, 5, 19, 2, "#9fd0e8");
    ell(x, 50, 13, 4.5, 7, "#ffb42e");
    ell(x, 50, 15, 2, 3.5, "#fff1b0");
  },
];

export const game: Game = {
  mount(api) {
    const canvas = api.canvas;
    const calm = api.reducedMotion;
    const prevTouch = canvas.style.touchAction;
    canvas.style.touchAction = "none";

    let grid: number[] = new Array(N * N).fill(0);
    let sprites: Sprite[] = [];
    let slideT = -1; // elapsed slide time, -1 when idle
    const popAge: number[] = new Array(N * N).fill(-1);
    const popKind: number[] = new Array(N * N).fill(0); // 1 merge, 2 spawn
    let merged: number[] = [];
    let bits: Bit[] = [];
    let pops: Pop[] = [];
    let score = 0;
    let over = false;
    let overT = 0;
    let reported = false;
    let best = 1; // highest tier on the table this game (the strip)
    let top = 2; // highest tier ever made this game: a new one plays "win"
    let fanfare = false;
    let undo: { grid: number[]; score: number; best: number } | null = null;
    let shakeT = 0;
    let stripT = -1;
    let clock = 0;
    let bx = 0;
    let by = 0;
    let side = 0;
    let gap = 0;
    let cell = 0;
    let m = 0;
    let es = 0;
    let stripY = 0;
    let ux = 0;
    let uy = 0;
    const UR = 26;
    let dpr = 1;
    let bg: Cv = mk(1);
    const cache = new Map<string, Cv>();

    // Cached art at device pixels: the dish alone (rimmed) or the full tile.
    const art = (t: number, p: number, tile: boolean): Cv => {
      p = Math.max(8, Math.round(p));
      const k = `${t}${tile ? "t" : "i"}${p}`;
      let c = cache.get(k);
      if (c) return c;
      c = mk(p);
      const x = g2(c);
      if (tile) {
        const g = TILE[t]!;
        const r = p * 0.2;
        box(x, 0, p * 0.05, p, p * 0.95, r, mix(g, -0.3));
        const lg = x.createLinearGradient(0, 0, 0, p);
        lg.addColorStop(0, mix(g, 0.25));
        lg.addColorStop(1, g);
        box(x, 0, 0, p, p * 0.92, r, lg);
        x.strokeStyle = t === MAX ? "#ffd27a" : "rgba(255,255,255,.35)";
        x.lineWidth = p * (t === MAX ? 0.045 : 0.02);
        roundRect(x, p * 0.03, p * 0.03, p * 0.94, p * 0.86, r * 0.85);
        x.stroke();
        const ic = art(t, p * 0.78, false);
        x.shadowColor = "rgba(50,20,8,.35)";
        x.shadowBlur = p * 0.04;
        x.shadowOffsetY = p * 0.03;
        x.drawImage(ic, (p - ic.width) / 2, p * 0.5 - ic.width / 2);
        x.shadowColor = "transparent";
        label(x, String(2 ** t), p * 0.09, p * 0.11, p * (t > 9 ? 0.11 : 0.14), t > 5 ? CREAM : "rgba(59,34,22,.7)", "left", 800);
      } else {
        const a = mk(p);
        const ax = g2(a);
        ax.scale(p / 100, p / 100);
        ART[t]!(ax);
        // Outline rule: a cream sticker rim, then a walnut-ink contour, then the art.
        for (const [r, col] of [[5, CREAM], [2, INK]] as const) {
          const b = mk(p);
          const bx2 = g2(b);
          for (let i = 0; i < 16; i++) {
            const d = ((i % 2 ? 0.7 : 1) * r * p) / 100;
            bx2.drawImage(a, Math.cos((i * Math.PI) / 8) * d, Math.sin((i * Math.PI) / 8) * d);
          }
          bx2.globalCompositeOperation = "source-in";
          bx2.fillStyle = col;
          bx2.fillRect(0, 0, p, p);
          x.drawImage(b, 0, 0);
        }
        x.drawImage(a, 0, 0);
      }
      cache.set(k, c);
      return c;
    };

    const px = (c: number) => bx + gap + c * (cell + gap);
    const py = (r: number) => by + gap + r * (cell + gap);

    // The table, the cloth and the empty cells never change between frames.
    const paintBg = (s: Size) => {
      bg = mk(s.w * dpr, s.h * dpr);
      const x = g2(bg);
      x.scale(dpr, dpr);
      const lg = x.createLinearGradient(0, 0, 0, s.h);
      lg.addColorStop(0, "#4b2d1d");
      lg.addColorStop(1, "#24150d");
      x.fillStyle = lg;
      x.fillRect(0, 0, s.w, s.h);
      for (let i = 0; i < 26; i++) {
        const y = (i + 0.5) * (s.h / 26) + Math.sin(i * 7.3) * 6;
        x.beginPath();
        x.moveTo(0, y);
        x.bezierCurveTo(s.w * 0.3, y + Math.sin(i) * 8, s.w * 0.7, y - Math.cos(i * 2) * 8, s.w, y);
        x.strokeStyle = `rgba(${i % 3 ? "0,0,0,.12" : "255,210,160,.05"})`;
        x.lineWidth = 1 + (i % 4);
        x.stroke();
      }
      const lamp = x.createRadialGradient(s.w / 2, by + side * 0.35, 0, s.w / 2, by + side * 0.35, Math.max(s.w, s.h) * 0.75);
      lamp.addColorStop(0, "rgba(255,200,130,.22)");
      lamp.addColorStop(1, "rgba(255,200,130,0)");
      x.fillStyle = lamp;
      x.fillRect(0, 0, s.w, s.h);
      // Linen cloth with an embroidered pomegranate border.
      const L = bx - m;
      const T = by - m;
      const W = side + 2 * m;
      x.shadowColor = "rgba(0,0,0,.45)";
      x.shadowBlur = 24;
      x.shadowOffsetY = 8;
      box(x, L, T, W, W, m * 0.5, LINEN);
      x.shadowColor = "transparent";
      x.strokeStyle = "#a3233a";
      x.lineWidth = m * 0.44;
      roundRect(x, L + m * 0.42, T + m * 0.42, W - m * 0.84, W - m * 0.84, m * 0.3);
      x.stroke();
      const n = Math.max(8, Math.round((W - m) / (m * 0.62)));
      const st = (W - m * 0.84) / n;
      for (let i = 0; i < n; i++) {
        const q = L + m * 0.42 + (i + 0.5) * st;
        const e = W - m * 0.84;
        for (const [cx, cy] of [[q, T + m * 0.42], [q, T + m * 0.42 + e], [L + m * 0.42, q - L + T], [L + m * 0.42 + e, q - L + T]]) {
          poly(x, i % 2 ? C.apricot : LINEN, cx!, cy! - m * 0.15, cx! + m * 0.15, cy!, cx!, cy! + m * 0.15, cx! - m * 0.15, cy!);
        }
      }
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          box(x, px(c), py(r), cell, cell, cell * 0.2, "#d9c6a2");
          box(x, px(c), py(r) + cell * 0.05, cell, cell * 0.95, cell * 0.2, "#e9dcc2");
        }
      }
    };

    const fit = fitCanvas(canvas, (s: Size) => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      side = Math.max(120, Math.min(s.w - 56, s.h - 160, 460));
      m = side * 0.05;
      gap = side * 0.026;
      cell = (side - gap * (N + 1)) / N;
      es = Math.min(28, (side / MAX) * 0.86);
      const block = side + 2 * m + 28 + es + UR * 2;
      bx = (s.w - side) / 2;
      by = Math.max(m + 6, (s.h - block) / 2 + m);
      stripY = by + side + m + 14 + es / 2;
      ux = s.w / 2;
      uy = stripY + es / 2 + 12 + UR;
      cache.clear();
      paintBg(s);
    });
    const ctx = fit.ctx;

    const spawn = () => {
      const empty: number[] = [];
      grid.forEach((t, i) => t === 0 && empty.push(i));
      if (!empty.length) return;
      const i = empty[Math.floor(Math.random() * empty.length)]!;
      grid[i] = Math.random() < 0.1 ? 2 : 1;
      best = Math.max(best, grid[i]!);
      popAge[i] = 0;
      popKind[i] = 2;
    };

    const canMove = () => {
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          const t = grid[r * N + c]!;
          if (!t) return true;
          if (t < MAX && ((c < N - 1 && grid[r * N + c + 1] === t) || (r < N - 1 && grid[(r + 1) * N + c] === t))) {
            return true;
          }
        }
      }
      return false;
    };

    // Ends the slide: merged dishes pop with crumbs and points, a new dish
    // appears, check for the end.
    const finish = () => {
      if (slideT < 0) return;
      slideT = -1;
      sprites = [];
      let big = false;
      for (const i of merged) {
        const t = grid[i]!;
        popAge[i] = 0;
        popKind[i] = 1;
        const cx = px(i % N) + cell / 2;
        const cy = py(Math.floor(i / N)) + cell / 2;
        pops.push({ x: cx, y: cy, a: 0, v: 2 ** t });
        if (t >= 7) big = true;
        if (!calm) {
          for (let k = 0; k < 7 + t; k++) {
            const a = Math.random() * 7;
            const v = cell * (1.2 + Math.random() * 1.6);
            const sparkle = k % 3 === 0;
            bits.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - cell, a: 0, m: 0.45 + Math.random() * 0.25, c: sparkle ? "#ffe9a8" : BIT[t]!, k: sparkle ? 1 : 0, s: cell * (sparkle ? 0.07 : 0.045 + Math.random() * 0.03) });
          }
        }
      }
      if (merged.length) {
        api.sfx(fanfare ? "win" : "merge");
        api.sfx(fanfare ? "mmm" : "pop");
      }
      if (fanfare) stripT = 0;
      if (big && !calm) shakeT = 0.3;
      fanfare = false;
      merged = [];
      spawn();
      if (!canMove()) {
        over = true;
        overT = 0;
        api.sfx("lose");
        api.sfx("uhoh");
      }
    };

    const move = (dir: Dir) => {
      if (over || api.isPaused()) return;
      finish();
      if (over) return;
      const to = (k: number, i: number): [number, number] =>
        dir === "left" ? [k, i] : dir === "right" ? [k, N - 1 - i] : dir === "up" ? [i, k] : [N - 1 - i, k];
      const next: number[] = new Array(N * N).fill(0);
      const sp: Sprite[] = [];
      const mg: number[] = [];
      const was = { grid: grid.slice(), score, best };
      let gained = 0;
      let moved = false;
      for (let k = 0; k < N; k++) {
        let n = 0;
        let prev = 0;
        for (let i = 0; i < N; i++) {
          const [r, c] = to(k, i);
          const t = grid[r * N + c]!;
          if (!t) continue;
          if (prev === t && t < MAX) {
            const [tr, tc] = to(k, n - 1);
            next[tr * N + tc] = t + 1;
            gained += 2 ** (t + 1);
            mg.push(tr * N + tc);
            sp.push({ t, fr: r, fc: c, tr, tc });
            best = Math.max(best, t + 1);
            if (t + 1 > top) {
              top = t + 1;
              fanfare = true;
            }
            prev = 0;
            moved = true;
          } else {
            const [tr, tc] = to(k, n);
            next[tr * N + tc] = t;
            sp.push({ t, fr: r, fc: c, tr, tc });
            if (tr !== r || tc !== c) moved = true;
            prev = t;
            n++;
          }
        }
      }
      if (!moved) return;
      undo = was;
      grid = next;
      sprites = sp;
      merged = mg;
      slideT = 0;
      api.sfx("whoosh");
      if (gained) {
        score += gained;
        api.setScore(score);
      }
    };

    // One step back: the board and score before the last move.
    const back = () => {
      if (!undo || reported || api.isPaused()) return;
      grid = undo.grid;
      score = undo.score;
      best = undo.best;
      undo = null;
      slideT = -1;
      sprites = [];
      merged = [];
      fanfare = false;
      over = false;
      popAge.fill(-1);
      api.setScore(score);
      api.sfx("tap");
    };

    const tile = (t: number, cx: number, cy: number, scale: number) => {
      const sz = cell * scale;
      ctx.drawImage(art(t, cell * dpr, true), cx - sz / 2, cy - sz / 2, sz, sz);
    };

    const popScale = (i: number) => {
      const a = popAge[i]!;
      if (a < 0 || calm) return 1;
      const p = Math.min(1, a / POP);
      return popKind[i] === 2 ? 0.3 + 0.7 * (1 - (1 - p) ** 3) : 1 + 0.22 * Math.sin(Math.PI * p);
    };

    const draw = () => {
      const s = fit.size();
      ctx.save();
      if (shakeT > 0) {
        const k = (shakeT / 0.3) * cell * 0.06;
        ctx.translate(Math.sin(clock * 83) * k, Math.cos(clock * 67) * k);
      }
      ctx.drawImage(bg, 0, 0, s.w, s.h);
      if (slideT >= 0) {
        const p = Math.min(1, slideT / SLIDE);
        // Ease out with a tiny overshoot (none for reduced motion).
        const e = calm ? 1 - (1 - p) ** 2 : 1 + 2 * (p - 1) ** 3 + (p - 1) ** 2;
        for (const q of sprites) {
          tile(q.t, px(q.fc + (q.tc - q.fc) * e) + cell / 2, py(q.fr + (q.tr - q.fr) * e) + cell / 2, 1);
        }
      } else {
        for (let i = 0; i < N * N; i++) {
          const t = grid[i]!;
          if (t) tile(t, px(i % N) + cell / 2, py(Math.floor(i / N)) + cell / 2, popScale(i));
        }
      }
      if (over) {
        ctx.fillStyle = `rgba(36,21,13,${Math.min(0.45, overT * 1.2)})`;
        roundRect(ctx, bx - m, by - m, side + 2 * m, side + 2 * m, m * 0.5);
        ctx.fill();
      }
      for (const b of bits) {
        ctx.globalAlpha = 1 - b.a / b.m;
        if (b.k) {
          star(ctx, b.x, b.y, 4, b.s * 2, b.s * 0.5, b.c, clock * 4);
        } else {
          ell(ctx, b.x, b.y, b.s, b.s, b.c);
        }
      }
      for (const q of pops) {
        const k = q.a / 0.8;
        ctx.globalAlpha = 1 - k * k;
        const y = q.y - cell * 0.3 - (calm ? 0 : k * cell * 0.7);
        const sz = cell * (0.24 + (calm ? 0 : 0.06 * Math.sin(Math.min(1, k * 4) * Math.PI)));
        label(ctx, `+${q.v}`, q.x + 1.5, y + 2, sz, "rgba(36,21,13,.8)", "center", 800);
        label(ctx, `+${q.v}`, q.x, y, sz, "#ffe08a", "center", 800);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      // Progress strip: dishes found so far stay lit, the newest pops.
      const step = side / MAX;
      for (let t = 1; t <= MAX; t++) {
        const cx = bx + step * (t - 0.5);
        let z = es;
        if (t === best && stripT >= 0 && !calm) z *= 1 + 0.5 * Math.sin(Math.PI * Math.min(1, stripT / 0.4));
        ctx.globalAlpha = t <= best ? 1 : 0.22;
        ctx.drawImage(art(t, es * 1.5 * dpr, false), cx - z / 2, stripY - z / 2, z, z);
        if (t === best) ell(ctx, cx, stripY + es * 0.68, 2.5, 2.5, C.apricot);
      }
      // Undo: a round arrow, grey until the next move.
      const live = !!undo && !reported;
      const z = live && over && !calm ? 1 + 0.08 * Math.sin(clock * 7) : 1;
      const R = UR * z;
      ctx.globalAlpha = live ? 1 : 0.32;
      ell(ctx, ux, uy + 3, R, R, "#b89a6c");
      ell(ctx, ux, uy, R, R, LINEN);
      ctx.beginPath();
      const a0 = Math.PI * 1.1;
      const r = R * 0.46;
      ctx.arc(ux, uy, r, a0, Math.PI * 0.75);
      ctx.strokeStyle = INK;
      ctx.lineWidth = R * 0.16;
      ctx.lineCap = "round";
      ctx.stroke();
      const hx = ux + Math.cos(a0) * r;
      const hy = uy + Math.sin(a0) * r;
      const dx = Math.sin(a0);
      const dy = -Math.cos(a0);
      poly(ctx, INK, hx + dx * R * 0.3, hy + dy * R * 0.3, hx + Math.cos(a0) * R * 0.24, hy + Math.sin(a0) * R * 0.24, hx - Math.cos(a0) * R * 0.24, hy - Math.sin(a0) * R * 0.24);
      ctx.globalAlpha = 1;
    };

    const tap = (e: PointerEvent) => {
      const p = pointerPos(canvas, e);
      if (Math.hypot(p.x - ux, p.y - uy) < UR * 1.4) back();
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "z" || e.key === "Z" || e.key === "Backspace") {
        e.preventDefault();
        back();
      }
    };
    canvas.addEventListener("pointerdown", tap);
    window.addEventListener("keydown", key);
    const stopSwipe = onSwipe(canvas, move, 20);
    const stopLoop = loop(api, (dt, paused) => {
      if (!paused) {
        clock += dt;
        if (slideT >= 0) {
          slideT += dt;
          if (slideT >= (calm ? SLIDE * 0.6 : SLIDE)) finish();
        }
        for (let i = 0; i < N * N; i++) {
          if (popAge[i]! >= 0) {
            popAge[i]! += dt;
            if (popAge[i]! > POP) popAge[i] = -1;
          }
        }
        for (const b of bits) {
          b.a += dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.vy += cell * 9 * dt;
        }
        bits = bits.filter((b) => b.a < b.m);
        for (const q of pops) q.a += dt;
        pops = pops.filter((q) => q.a < 0.8);
        shakeT = Math.max(0, shakeT - dt);
        if (stripT >= 0) stripT = stripT > 0.4 ? -1 : stripT + dt;
        if (over) {
          overT += dt;
          // With an undo left, give the guest a moment to take the move back.
          if (overT > (undo ? 2.4 : 0.9) && !reported) {
            reported = true;
            api.gameOver(score);
          }
        }
      }
      draw();
    });

    spawn();
    spawn();
    api.setScore(0);

    return () => {
      stopLoop();
      stopSwipe();
      fit.stop();
      canvas.removeEventListener("pointerdown", tap);
      window.removeEventListener("keydown", key);
      canvas.style.touchAction = prevTouch;
      cache.clear();
    };
  },
};
