// "Merge the Feast": swipe to slide a 4x4 table of dishes; two equal dishes
// that meet kiss and become the next dish, from a herb bunch up to a whole
// festive table. One undo. No words on the canvas.
//
// Art direction
// - Mood: a café kitchen comedy on a Sunday family table in Yerevan. Every
//   dish is a vain little character that wants to grow into the feast: they
//   glance about, blink, eye their twin across the board, pucker up and kiss
//   to merge, grin proudly when they pop out bigger, dance when they are big,
//   sweat when the table gets crowded and faint (X eyes) when it is full.
// - Camera and scale: static top-down board, the whole table in view; drawn
//   in CSS px at device resolution, dish art authored on a 100-unit box per
//   tile, faces on a 28-unit face box scaled per dish.
// - Shapes: round and soft. Tiles are glazed ceramic squares with big radii;
//   each dish has its own silhouette (leafy bunch, ball, capsule, bulb,
//   teardrop, sheet, wedge, pleated knot, skewer, roast, tiers, table),
//   readable at 70 px, with a flat-ish front where the face sits.
// - Values: dishes and their eye whites brightest (cream rim + ink outline),
//   tiles mid, the walnut table darkest; the linen cloth sits between so the
//   board reads first.
// - Palette: walnut table (ground), linen cloth (stage), tile glaze from
//   tarragon tint through apricot and tufa to pomegranate and wine (progress),
//   pomegranate embroidery and blush (accent), gold for score and the feast.
//   Lights warm (lamp glow, cream highlights), shadows warm-dark brown.
// - Detail: on the faces (eyes that look, mouths that change) and the dishes;
//   kept out of the cloth and cells behind play. Props (a coffee with latte
//   heart, a pomegranate) only on the walnut outside the cloth.
// - Rules: one outline rule for dishes (2-unit walnut-ink contour plus a
//   5-unit cream sticker rim, outer silhouette only); faces are ink strokes
//   with cream eye whites, never rimmed; one shading model (a soft gradient
//   from a top-left light plus one white glint); no emoji or font glyphs.
// - Motion: squash and stretch along the slide, a bump on landing; merges
//   kiss for 0.13 s, then pop with a heart; big ones dance with confetti. A
//   waiter's arm (black sleeve, white cuff) now and then slides a new dish in
//   from the side. Reduced motion: no shake, dance, wobble or hand.
// - Signature: the cloth's pomegranate-red cross-stitch border, like an
//   Armenian embroidered tablecloth, under a warm lamp glow; the final dish is
//   that same table, set for a feast, with a face on its tablecloth.
import { C, fitCanvas, label, loop, onSwipe, pointerPos, roundRect, type Game, type Size } from "./engine";

type Dir = "up" | "down" | "left" | "right";
type Sprite = { t: number; fr: number; fc: number; tr: number; tc: number; m: boolean };
/** k: 0 crumb, 1 sparkle, 2 confetti, 3 heart. */
type Bit = { x: number; y: number; vx: number; vy: number; a: number; m: number; c: string; k: number; s: number };
type Pop = { x: number; y: number; a: number; v: number };
type X = CanvasRenderingContext2D;
type Cv = HTMLCanvasElement;

const N = 4;
const MAX = 12;
const SLIDE = 0.11;
const HD = 0.24; // the waiter's hand puts the dish down
const HT = 0.46; // and is gone
const INK = "#3b2216";
const CREAM = "#fff8ec";
const LINEN = "#f3e8d2";
const SKIN = "#f3c9a5";
const BLUSH = "#e0566e";
const MOUTH = "#7a1f22";
const PI = Math.PI;
// Tile glaze warms up from herb green to wine, then the gold-rimmed feast.
const TILE = ["", "#dcebdc", "#eef0c8", "#f7e3a6", "#f6cf7c", C.apricot, "#e8924a", C.tufa, "#c9694f", "#c04a52", C.pomegranate, "#8a1a36", "#5e1229"];
// The main colour of each dish, for the crumbs of a merge.
const BIT = ["", "#5cc48e", "#e0402e", "#4f9a45", "#e0a456", "#7a3590", "#e8c27a", "#ffcf4a", "#f4e7cc", "#9a5530", "#d88a3a", "#f4d8b0", "#ffe08a"];
const CONF = [C.pomegranate, C.apricot, C.tarragonLight, "#ffe08a", "#7cc6ee"];
// Where each dish wears its face: centre on the art box and face scale.
const FACE = [[0, 0, 0], [50, 40, 1.2], [50, 62, 1.5], [47, 53, 1.05], [50, 65, 1.3], [45, 63, 1.2], [50, 53, 1.3], [52, 69, 1.1], [50, 64, 1.35], [50, 51, 0.88], [50, 59, 1.1], [50, 72, 1.1], [50, 66, 1.05]];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

const hs = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
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
    const a = rot + (i * PI) / n - PI / 2;
    const d = i % 2 ? r : R;
    p.push(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
  }
  poly(x, c, ...p);
};
const heart = (x: X, cx: number, cy: number, s: number, c: string) => {
  x.beginPath();
  x.moveTo(cx, cy + s);
  x.bezierCurveTo(cx - s * 1.7, cy - s * 0.1, cx - s * 0.7, cy - s * 1.4, cx, cy - s * 0.45);
  x.bezierCurveTo(cx + s * 0.7, cy - s * 1.4, cx + s * 1.7, cy - s * 0.1, cx, cy + s);
  fill(x, c);
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

// One illustration per tier, inside 7..93 of a 100-unit box, with room for a face.
const ART: ((x: X) => void)[] = [
  () => {},
  // 1 herb bunch tied with a red thread
  (x) => {
    for (const d of [-9, 0, 9]) line(x, "#2f7a45", 4, 50 + d * 0.3, 93, 50 + d, 58);
    line(x, C.pomegranate, 4.5, 42, 80, 58, 80);
    leaf(x, 20, 30, -0.7, 0.65);
    leaf(x, 80, 30, 0.7, 0.65);
    leaf(x, 50, 10, 1.57, 0.6);
    const g = rad(x, 50, 42, 36, "#86d68e", "#2c844b");
    for (const [cx, cy, r] of [[29, 44, 16], [71, 44, 16], [37, 26, 15], [63, 26, 15], [50, 44, 24]]) ell(x, cx!, cy!, r!, r!, g);
  },
  // 2 tomato
  (x) => {
    ell(x, 50, 58, 38, 33, rad(x, 50, 58, 38, "#ff7c5e", "#c2241b"));
    shine(x, 28, 50, 5, 9, 0.3);
    star(x, 50, 29, 5, 17, 5, "#3d9a4a");
    line(x, "#2f7a3a", 4.5, 50, 28, 54, 15);
  },
  // 3 cucumber, one end cut
  (x) =>
    at(x, 50, 52, -0.3, () => {
      const g = x.createLinearGradient(0, -18, 0, 18);
      g.addColorStop(0, "#77c260");
      g.addColorStop(1, "#24622f");
      box(x, -45, -18, 90, 36, 18, g);
      line(x, "rgba(210,245,180,.55)", 2.5, -36, -11, 26, -11);
      for (const [p, q] of [[-32, 9], [-22, -12], [22, 12], [28, -10]]) ell(x, p!, q!, 2, 1.5, "#1d4f26");
      ell(x, 39, 0, 7, 16, "#d9f0b4");
      ell(x, 39, 0, 3, 8, "#b6dc8a");
    }),
  // 4 onion with a sprout
  (x) => {
    line(x, "#4f9a45", 5, 50, 24, 42, 6);
    line(x, "#5cb04f", 5, 50, 24, 60, 8);
    line(x, "#efe0bc", 2, 46, 89, 42, 95);
    line(x, "#efe0bc", 2, 54, 89, 58, 95);
    bulb(x, 20, 36, 90);
    fill(x, rad(x, 50, 62, 36, "#f6c47a", "#b3602a"));
    x.strokeStyle = "rgba(120,55,20,.3)";
    x.lineWidth = 2;
    for (const k of [-20, 20]) {
      x.beginPath();
      x.moveTo(50, 24);
      x.quadraticCurveTo(50 + k * 1.6, 56, 50 + k * 0.7, 88);
      x.stroke();
    }
    shine(x, 26, 62, 3.5, 8, 0.2);
  },
  // 5 eggplant
  (x) =>
    at(x, 52, 50, 0.55, () => {
      const g = rad(x, 0, 6, 36, "#a565bd", "#3e1550");
      ell(x, 0, 15, 26, 27, g);
      ell(x, 0, -12, 15, 20, g);
      shine(x, -17, 10, 3.5, 9, 0.1);
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
          x.lineTo(Math.cos(a) * 44 * k, Math.sin(a) * 27 * k);
        }
        fill(x, c);
      };
      at(x, 2, 7, 0.22, () => sheet("#d9ad66"));
      sheet("#f4dcaa");
      x.save();
      x.clip();
      for (let i = -4; i < 5; i++) line(x, "rgba(150,85,30,.3)", 3.5, i * 13 - 14, 30, i * 13 + 14, -30);
      for (const [cx, cy, r] of [[-32, -8, 5], [30, -14, 4], [-28, 14, 4], [34, 10, 3]]) ell(x, cx!, cy!, r!, r! * 0.7, "#9a5626");
      x.restore();
    }),
  // 7 cheese wedge with holes
  (x) => {
    poly(x, "#ffd95e", 9, 52, 91, 52, 66, 14);
    poly(x, "#f0a52c", 9, 52, 91, 52, 91, 86, 9, 86);
    line(x, "#fff0a8", 2.5, 12, 52, 88, 52);
    for (const [cx, cy, rx] of [[18, 64, 4], [83, 78, 4.5], [82, 62, 3], [17, 79, 3], [56, 40, 5], [66, 28, 3.5], [36, 45, 4]]) ell(x, cx!, cy!, rx!, rx! * 0.7, cy! > 52 ? "#c47e17" : "#e5b13a");
  },
  // 8 khinkali dumpling with pleats
  (x) => {
    bulb(x, 26, 41, 88);
    fill(x, rad(x, 50, 62, 41, "#fff6e2", "#d6b98a"));
    x.strokeStyle = "rgba(150,110,60,.4)";
    x.lineWidth = 2;
    for (let i = -3; i <= 3; i++) {
      x.beginPath();
      x.moveTo(50, 28);
      x.quadraticCurveTo(50 + i * 14, 40, 50 + i * 11.5, 52 - Math.abs(i) * 2);
      x.stroke();
    }
    ell(x, 50, 20, 8, 11, rad(x, 50, 20, 10, "#fff6e2", "#d9bf90"));
  },
  // 9 khorovats skewer, the middle chunk big enough for a face
  (x) =>
    at(x, 50, 50, -0.4, () => {
      line(x, "#8c969b", 3.5, -47, 0, 46, 0);
      x.beginPath();
      x.arc(-46, 0, 6, 0, 7);
      x.lineWidth = 3;
      x.strokeStyle = "#8c969b";
      x.stroke();
      const meat = (p: number, w: number, h: number) => {
        box(x, p - w / 2, -h / 2, w, h, 7, rad(x, p, 0, h / 2, "#c27440", "#6a2e14"));
        line(x, "#3d170a", 2.5, p - w / 4, -h / 2 + 3, p + w / 4 - 2, -h / 2 + 1);
        line(x, "#3d170a", 2.5, p - w / 4, h / 2 - 2, p + w / 4, h / 2 - 5);
      };
      meat(-32, 15, 22);
      ell(x, -21, 0, 4, 11, "#e0402e");
      ell(x, 21, 0, 4, 11, "#3f9a3f");
      meat(32, 15, 22);
      meat(0, 30, 34);
    }),
  // 10 roast chicken on a plate
  (x) => {
    ell(x, 50, 74, 45, 16, "#e6dccb");
    ell(x, 50, 73, 36, 11, "#faf6ee");
    for (const s of [-1, 1]) {
      ell(x, 50 + s * 26, 44, 9, 14, "#b5652a", s * 0.65);
      line(x, "#fbf3e2", 4, 50 + s * 31, 36, 50 + s * 37, 27);
      ell(x, 50 + s * 38, 25, 4, 4, "#fbf3e2");
    }
    ell(x, 50, 59, 33, 23, rad(x, 50, 59, 33, "#f0b060", "#a14c1b"));
    leaf(x, 13, 74, 0.4, 0.55, "#4f9a45");
    leaf(x, 87, 74, -0.4, 0.55, "#4f9a45");
  },
  // 11 celebration cake with pomegranate seeds and a candle
  (x) => {
    ell(x, 50, 88, 45, 8, "#e6dccb");
    const tier = (l: number, t: number, w: number, h: number) => {
      box(x, l, t, w, h, 5, "#f4d8b0");
      line(x, "#e57f92", 3, l + 2, t + h - 5, l + w - 2, t + h - 5);
      box(x, l - 1, t, w + 2, 8, 5, CREAM);
      for (let d = l + 5; d < l + w - 2; d += 9) ell(x, d, t + 8, 3.5, 4.5, CREAM);
    };
    tier(13, 54, 74, 34);
    tier(28, 33, 44, 22);
    for (const [cx, cy] of [[36, 35], [44, 34], [58, 35], [65, 36], [52, 37]]) ell(x, cx!, cy!, 2.4, 2, C.pomegranate);
    box(x, 47.5, 16, 5, 18, 2, "#9fd0e8");
    ell(x, 50, 10, 4.5, 7, "#ffb42e");
    ell(x, 50, 12, 2, 3.5, "#fff1b0");
  },
  // 12 the whole festive table: wine, cake and grapes on an embroidered cloth
  (x) => {
    line(x, "#7a4a22", 6, 20, 80, 16, 95);
    line(x, "#7a4a22", 6, 80, 80, 84, 95);
    poly(x, "#fffaf0", 5, 46, 95, 46, 92, 86, 8, 86);
    ell(x, 50, 46, 45, 8, "#fff");
    line(x, C.pomegranate, 3, 9, 79, 91, 79);
    for (let d = 13; d < 90; d += 8) poly(x, d % 16 > 7 ? C.apricot : C.pomegranate, d, 81, d + 3, 84, d, 87, d - 3, 84);
    box(x, 14, 18, 12, 28, 5, "#2f5a3a");
    box(x, 17, 6, 6, 16, 2, "#2f5a3a");
    box(x, 15, 28, 10, 8, 2, C.apricot);
    box(x, 36, 26, 28, 20, 4, "#f4d8b0");
    box(x, 35, 26, 30, 7, 3, CREAM);
    box(x, 48.5, 12, 3, 14, 1, "#9fd0e8");
    ell(x, 50, 9, 3, 5, "#ffb42e");
    for (const [cx, cy] of [[76, 42], [84, 42], [72, 34], [80, 34], [88, 34], [76, 26], [84, 26]]) ell(x, cx!, cy!, 5, 5, rad(x, cx!, cy!, 5, "#b878cc", "#4b175c"));
  },
];

// A face on a 28-unit box around 0,0, k px per unit. Moods: 0 calm smile,
// 1 proud grin, 2 worried, 3 fainted, 4 kiss, 5 whee. bl: 1 mid-blink.
// sw: sweat drop progress, or -1.
const face = (x: X, k: number, md: number, lx: number, ly: number, bl: number, sw: number) => {
  x.save();
  x.scale(k, k);
  x.lineCap = x.lineJoin = "round";
  ell(x, -12, 5, 3.6, 2.3, "rgba(235,80,100,.45)");
  ell(x, 12, 5, 3.6, 2.3, "rgba(235,80,100,.45)");
  x.strokeStyle = INK;
  for (const s of [-1, 1]) {
    const ex = s * 7.5;
    x.lineWidth = 1.8;
    x.beginPath();
    if (md === 3) {
      x.moveTo(ex - 3, -6);
      x.lineTo(ex + 3, 0);
      x.moveTo(ex + 3, -6);
      x.lineTo(ex - 3, 0);
    } else if (md === 1) x.arc(ex, -1, 3.6, PI * 1.15, PI * 1.85);
    else if (md === 4) x.arc(ex, -4, 3.4, PI * 0.15, PI * 0.85);
    else {
      const h = 5.4 * Math.max(0.12, 1 - bl);
      ell(x, ex, -3, 4.7, h, CREAM);
      x.stroke();
      if (bl < 0.5) {
        const px = ex + lx * 1.9;
        const py = -3 + ly * 1.9 + (md === 2 ? 1 : 0);
        ell(x, px, py, 2.6, 2.6, INK);
        ell(x, px + 0.9, py - 1, 0.9, 0.9, CREAM);
      }
      if (md === 2) line(x, INK, 1.6, s * 3, -11, s * 10, -8.5);
      continue;
    }
    x.stroke();
  }
  x.lineWidth = 1.7;
  x.beginPath();
  if (md === 0) {
    x.arc(0, 3.5, 4.2, PI * 0.2, PI * 0.8);
    x.stroke();
  } else if (md === 1) {
    x.moveTo(-6.5, 4);
    x.quadraticCurveTo(0, 5.5, 6.5, 4);
    x.quadraticCurveTo(0, 17, -6.5, 4);
    fill(x, MOUTH);
    x.stroke();
    ell(x, 0, 9.6, 3, 1.8, "#f07a8a");
  } else if (md === 2 || md === 3) {
    line(x, INK, 1.7, -5, 7, -2.5, 5.5, 0, 7, 2.5, 5.5, 5, 7);
    if (md === 3) {
      ell(x, 3, 9, 2.4, 3, "#f07a8a");
      x.stroke();
    }
    if (sw >= 0) {
      const y = -9 + sw * 8;
      x.globalAlpha *= 1 - sw * 0.8;
      ell(x, 14, y, 2.4, 3, "#9fd6f2");
      poly(x, "#9fd6f2", 12, y - 1, 14, y - 6, 16, y - 1);
    }
  } else {
    ell(x, md === 4 ? 1.5 : 0, 6, 2.6, md === 4 ? 2.2 : 3, md === 4 ? BLUSH : MOUTH);
    x.stroke();
  }
  x.restore();
};

export const game: Game = {
  mount(api) {
    const canvas = api.canvas;
    const calm = api.reducedMotion;
    const KISS = calm ? 0 : 0.13;
    const prevTouch = canvas.style.touchAction;
    canvas.style.touchAction = "none";

    let grid: number[] = new Array(N * N).fill(0);
    let sprites: Sprite[] = [];
    let slideT = -1; // elapsed slide time, -1 when idle
    const popAge: number[] = new Array(N * N).fill(-1);
    const popKind: number[] = new Array(N * N).fill(0); // 1 merge, 2 spawn, 3 landed, 4 spawn by hand
    let merged: number[] = [];
    let dv: readonly [number, number] = [1, 0]; // the last push, as a unit vector
    let bits: Bit[] = [];
    let pops: Pop[] = [];
    let score = 0;
    let over = false;
    let overT = 0;
    let reported = false;
    let best = 1; // highest tier on the table this game (the strip)
    let top = 2; // highest tier ever made this game: a new one plays "yay"
    let fanI = -1; // the cell where a new top dish is about to pop
    let aweI = -1; // everybody stares at the new top dish for a moment
    let aweT = 0;
    let empt = N * N;
    let uh = false; // "uh-oh" said for this crowding
    let undo: { grid: number[]; score: number; best: number } | null = null;
    let shakeT = 0;
    let bumpT = 0;
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
            bx2.drawImage(a, Math.cos((i * PI) / 8) * d, Math.sin((i * PI) / 8) * d);
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
    const cx0 = (i: number) => px(i % N) + cell / 2;
    const cy0 = (i: number) => py(Math.floor(i / N)) + cell / 2;

    // The table, its props, the cloth and the empty cells never change between frames.
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
      const L = bx - m;
      const T = by - m;
      const W = side + 2 * m;
      // A coffee with a latte heart and a pomegranate wait above the cloth.
      if (T > 64) {
        const R = Math.min(24, T * 0.26);
        const y = T * 0.5;
        const a = L + R * 1.5;
        const b = L + W - R * 1.4;
        ell(x, a + 3, y + 5, R * 1.45, R * 1.45, "rgba(0,0,0,.3)");
        ell(x, a, y, R * 1.45, R * 1.45, "#efe4d0");
        ell(x, a, y, R * 1.12, R * 1.12, "#e0d0b4");
        box(x, a + R * 0.8, y - R * 0.2, R * 0.8, R * 0.4, R * 0.2, CREAM);
        ell(x, a, y, R, R, CREAM);
        ell(x, a, y, R * 0.8, R * 0.8, "#6f4327");
        ell(x, a, y, R * 0.62, R * 0.62, "#a8703f");
        heart(x, a, y, R * 0.28, "#f3dcc0");
        ell(x, b + 3, y + 5, R, R, "rgba(0,0,0,.3)");
        ell(x, b, y, R, R * 0.95, rad(x, b, y, R, "#e24a5a", "#8a1428"));
        star(x, b + R * 0.62, y - R * 0.62, 5, R * 0.34, R * 0.16, "#7a1024", 0.6);
        shine(x, b - R * 0.4, y - R * 0.3, R * 0.2, R * 0.12);
      }
      // Linen cloth with an embroidered pomegranate border.
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

    const spawn = (hand: boolean) => {
      const empty: number[] = [];
      grid.forEach((t, i) => t === 0 && empty.push(i));
      if (!empty.length) return;
      const i = empty[Math.floor(Math.random() * empty.length)]!;
      grid[i] = Math.random() < 0.1 ? 2 : 1;
      best = Math.max(best, grid[i]!);
      popAge[i] = 0;
      popKind[i] = hand && !calm ? 4 : 2;
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

    // The kiss is over: the new dish pops out with a heart, crumbs and points.
    const burst = (i: number) => {
      const t = grid[i]!;
      const cx = cx0(i);
      const cy = cy0(i);
      pops.push({ x: cx, y: cy, a: 0, v: 2 ** t });
      api.sfx("pop", 1.4 - t * 0.05);
      const fan = i === fanI;
      if (fan) {
        fanI = -1;
        stripT = 0;
        aweI = i;
        aweT = 1.3;
        api.sfx("win");
        api.sfx("yay", 1.25 - t * 0.03);
      } else if (t >= 7) api.sfx("mmm", 1.2 - t * 0.03);
      if (calm) return;
      if (t >= 7) shakeT = 0.3;
      for (let k = 0; k < 7 + t; k++) {
        const a = Math.random() * 7;
        const v = cell * (1.2 + Math.random() * 1.6);
        const sp = k % 3 === 0;
        bits.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - cell, a: 0, m: 0.45 + Math.random() * 0.25, c: sp ? "#ffe9a8" : BIT[t]!, k: sp ? 1 : 0, s: cell * (sp ? 0.07 : 0.045 + Math.random() * 0.03) });
      }
      bits.push({ x: cx + cell * 0.2, y: cy - cell * 0.3, vx: cell * 0.3, vy: -cell * 0.9, a: 0, m: 0.9, c: BLUSH, k: 3, s: cell * 0.1 });
      if (fan || t >= 7) {
        for (let k = 0; k < 26; k++) {
          bits.push({ x: cx, y: cy, vx: (Math.random() - 0.5) * cell * 5, vy: -cell * (2 + Math.random() * 2.5), a: 0, m: 1.3, c: CONF[k % 5]!, k: 2, s: cell * 0.045 });
        }
      }
    };

    // Ends the slide: landed dishes bump, merged ones start their kiss, a new
    // dish appears (sometimes by the waiter's hand), check for the end.
    const finish = () => {
      if (slideT < 0) return;
      slideT = -1;
      for (const q of sprites) {
        if (!q.m && (q.fr !== q.tr || q.fc !== q.tc)) {
          popAge[q.tr * N + q.tc] = 0;
          popKind[q.tr * N + q.tc] = 3;
        }
      }
      sprites = [];
      for (const i of merged) {
        popAge[i] = 0;
        popKind[i] = 1;
        if (!KISS) burst(i);
      }
      merged = [];
      spawn(Math.random() < 0.25);
      empt = grid.filter((t) => !t).length;
      if (!canMove()) {
        over = true;
        overT = 0;
        api.sfx("lose");
        api.sfx("whoa", 1.1);
      } else if (empt <= 2) {
        if (!uh) api.sfx("uhoh");
        uh = true;
      } else if (empt >= 6) uh = false;
    };

    const move = (dir: Dir) => {
      if (over || api.isPaused()) return;
      finish();
      if (over) return;
      // A kiss cut short by a quick swipe still pays out.
      popAge.forEach((a, i) => popKind[i] === 1 && a >= 0 && a < KISS && burst(i));
      popAge.fill(-1);
      const to = (k: number, i: number): [number, number] =>
        dir === "left" ? [k, i] : dir === "right" ? [k, N - 1 - i] : dir === "up" ? [i, k] : [N - 1 - i, k];
      dv = dir === "left" ? [-1, 0] : dir === "right" ? [1, 0] : dir === "up" ? [0, -1] : [0, 1];
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
            const j = tr * N + tc;
            next[j] = t + 1;
            gained += 2 ** (t + 1);
            mg.push(j);
            sp[sp.length - 1]!.m = true;
            sp.push({ t, fr: r, fc: c, tr, tc, m: true });
            best = Math.max(best, t + 1);
            if (t + 1 > top) {
              top = t + 1;
              fanI = j;
            }
            prev = 0;
            moved = true;
          } else {
            const [tr, tc] = to(k, n);
            next[tr * N + tc] = t;
            sp.push({ t, fr: r, fc: c, tr, tc, m: false });
            if (tr !== r || tc !== c) moved = true;
            prev = t;
            n++;
          }
        }
      }
      if (!moved) {
        // Nothing budges: the dishes get squashed against the edge.
        if (!calm) bumpT = 0.16;
        api.sfx("oof", 1.25);
        return;
      }
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
      fanI = -1;
      over = false;
      empt = grid.filter((t) => !t).length;
      popAge.fill(-1);
      api.setScore(score);
      api.sfx("boing");
    };

    // A dish with its face, squashed by sx, sy and tipped by rot.
    const dish = (t: number, cx: number, cy: number, sx: number, sy: number, rot: number, md: number, lx: number, ly: number, i: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.scale(sx, sy);
      ctx.drawImage(art(t, cell * dpr, true), -cell / 2, -cell / 2, cell, cell);
      const [fx, fy, fs] = FACE[t]!;
      const u = cell * 0.0078;
      ctx.translate((fx! - 50) * u, (fy! - 50) * u);
      const h = hs(i + t * 5);
      const ph = (clock + h * 9) % (3 + h * 2.5);
      face(ctx, fs! * u, md, lx, ly, ph < 0.13 ? 1 : 0, md === 2 && h > 0.45 ? (clock * 0.7 + h) % 1 : -1);
      ctx.restore();
    };

    // Where a dish looks: at the new top dish, at its twin, or about.
    const look = (i: number): readonly [number, number] => {
      const r = Math.floor(i / N);
      const c = i % N;
      if (aweT > 0 && aweI !== i) {
        const dx = (aweI % N) - c;
        const dy = Math.floor(aweI / N) - r;
        const d = Math.hypot(dx, dy) || 1;
        return [dx / d, dy / d];
      }
      const t = grid[i]!;
      for (const [dx, dy] of DIRS) {
        for (let rr = r + dy, cc = c + dx; rr >= 0 && rr < N && cc >= 0 && cc < N; rr += dy, cc += dx) {
          const o = grid[rr * N + cc];
          if (!o) continue;
          if (o === t && t < MAX) return [dx, dy];
          break;
        }
      }
      const q = hs(Math.floor(clock * 0.45 + hs(i) * 4) * 7 + i);
      return q < 0.4 ? [0, 0] : DIRS[Math.floor(q * 10) % 4]!;
    };

    const draw = () => {
      const s = fit.size();
      ctx.save();
      if (shakeT > 0) {
        const k = (shakeT / 0.3) * cell * 0.06;
        ctx.translate(Math.sin(clock * 83) * k, Math.cos(clock * 67) * k);
      }
      ctx.drawImage(bg, 0, 0, s.w, s.h);
      const bump = Math.sin((PI * bumpT) / 0.16) * cell * 0.05;
      ctx.translate(dv[0] * bump, dv[1] * bump);
      const hands: number[][] = [];
      if (slideT >= 0) {
        const p = Math.min(1, slideT / SLIDE);
        // Ease out with a tiny overshoot (none for reduced motion).
        const e = calm ? 1 - (1 - p) ** 2 : 1 + 2 * (p - 1) ** 3 + (p - 1) ** 2;
        const st = calm ? 0 : 0.16 * Math.sin(PI * p);
        for (const q of sprites) {
          const a = q.fr !== q.tr || q.fc !== q.tc ? st : 0;
          const ax = dv[0] ? 1 + a : 1 - a * 0.6;
          const ay = dv[1] ? 1 + a : 1 - a * 0.6;
          dish(q.t, px(q.fc + (q.tc - q.fc) * e) + cell / 2, py(q.fr + (q.tr - q.fr) * e) + cell / 2, ax, ay, 0, q.m ? 4 : a ? 5 : 0, dv[0], dv[1], q.tr * N + q.tc);
        }
      } else {
        for (let i = 0; i < N * N; i++) {
          const t = grid[i]!;
          if (!t) continue;
          let cx = cx0(i);
          let cy = cy0(i);
          let sx = 1;
          let sy = 1;
          let rot = 0;
          let md = empt <= 2 ? 2 : 0;
          let [lx, ly] = look(i);
          const a = popAge[i]!;
          const k = popKind[i];
          if (a >= 0) {
            if (k === 1) {
              if (a < KISS) {
                // Two halves bump noses and kiss, eyes shut.
                const o = cell * (0.2 - (0.1 * a) / KISS);
                const w = 0.72 + 0.1 * (a / KISS);
                for (const d of [1, -1]) dish(t - 1, cx + dv[0] * o * d, cy + dv[1] * o * d, dv[0] ? w : 1.06, dv[1] ? w : 1.06, 0, 4, 0, 0, i + d);
                continue;
              }
              const b = a - KISS;
              md = 1;
              sx = sy = calm ? 1 : 1 + 0.28 * Math.sin(PI * Math.min(1, b / 0.24));
              if (t >= 7 && !calm) {
                // A little victory dance.
                const d = Math.max(0, 1 - b / 0.95);
                rot = Math.sin(b * 24) * 0.16 * d;
                cy -= Math.abs(Math.sin(b * 12)) * cell * 0.08 * d;
              }
            } else if (k === 2) {
              sx = sy = calm ? 1 : 0.3 + 0.7 * (1 - (1 - Math.min(1, a / 0.2)) ** 3);
            } else if (k === 3) {
              const w = Math.sin(PI * Math.min(1, a / 0.16)) * 0.12;
              sx += dv[0] ? -w : w;
              sy += dv[1] ? -w : w;
            } else if (k === 4) {
              // The waiter's arm slides the dish in from the nearer side.
              const sd = i % N < 2 ? -1 : 1;
              const x0 = sd < 0 ? -cell : s.w + cell;
              if (a < HD) {
                cx = x0 + (cx - x0) * (1 - (1 - a / HD) ** 2);
                sx = sy = 1.08;
                md = 5;
                lx = -sd;
                ly = 0;
                hands.push([cx + sd * cell * 0.42, cy, sd]);
              } else hands.push([cx + sd * cell * 0.42 + (x0 - cx) * ((a - HD) / (HT - HD)) ** 2, cy, sd]);
            }
          }
          if (md === 2 && !calm) cx += Math.sin(clock * 47 + i * 2) * cell * 0.007;
          if (over) {
            // Fainted: X eyes, tongue out, keeled over.
            const e = Math.min(1, overT * 3);
            md = 3;
            rot = (hs(i) - 0.5) * 0.5 * e;
            sy *= 1 - 0.08 * e;
            cy += cell * 0.04 * e;
          }
          dish(t, cx, cy, sx, sy, rot, md, lx, ly, i);
        }
      }
      for (const [hx, hy, sd] of hands) {
        const far = sd! < 0 ? -20 : s.w + 20;
        const ay = hy! + cell * 0.1;
        line(ctx, INK, cell * 0.4, far, ay, hx! + sd! * cell * 0.16, ay);
        line(ctx, "#2b2433", cell * 0.34, far, ay, hx! + sd! * cell * 0.2, ay);
        line(ctx, CREAM, cell * 0.36, hx! + sd! * cell * 0.24, ay, hx! + sd! * cell * 0.14, ay);
        // Palm, three fingers over the tile edge, thumb on top: ink first, then skin.
        for (const [pad, col] of [[cell * 0.025, INK], [0, SKIN]] as const) {
          ell(ctx, hx!, hy! + cell * 0.06, cell * 0.15 + pad, cell * 0.19 + pad, col);
          for (const f of [-1, 0, 1]) ell(ctx, hx! - sd! * cell * 0.14, hy! + cell * (0.06 + f * 0.1), cell * 0.075 + pad, cell * 0.048 + pad, col);
          ell(ctx, hx! - sd! * cell * 0.05, hy! - cell * 0.13, cell * 0.05 + pad, cell * 0.085 + pad, col, sd! * 0.5);
        }
      }
      if (over) {
        ctx.fillStyle = `rgba(36,21,13,${Math.min(0.22, overT * 0.6)})`;
        roundRect(ctx, bx - m, by - m, side + 2 * m, side + 2 * m, m * 0.5);
        ctx.fill();
      }
      for (const b of bits) {
        ctx.globalAlpha = 1 - (b.a / b.m) ** 2;
        if (b.k === 1) star(ctx, b.x, b.y, 4, b.s * 2, b.s * 0.5, b.c, clock * 4);
        else if (b.k === 2) {
          ctx.save();
          ctx.translate(b.x, b.y);
          ctx.rotate(b.a * 9 + b.vx);
          ctx.scale(1, Math.cos(b.a * 11 + b.vx));
          ctx.fillStyle = b.c;
          ctx.fillRect(-b.s, -b.s * 0.6, b.s * 2, b.s * 1.2);
          ctx.restore();
        } else if (b.k === 3) heart(ctx, b.x, b.y, b.s, b.c);
        else ell(ctx, b.x, b.y, b.s, b.s, b.c);
      }
      for (const q of pops) {
        const k = q.a / 0.8;
        ctx.globalAlpha = 1 - k * k;
        const y = q.y - cell * 0.3 - (calm ? 0 : k * cell * 0.7);
        const sz = cell * (0.24 + (calm ? 0 : 0.06 * Math.sin(Math.min(1, k * 4) * PI)));
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
        if (t === best && stripT >= 0 && !calm) z *= 1 + 0.5 * Math.sin(PI * Math.min(1, stripT / 0.4));
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
      const a0 = PI * 1.1;
      const r = R * 0.46;
      ctx.arc(ux, uy, r, a0, PI * 0.75);
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
          const was = popAge[i]!;
          if (was < 0) continue;
          const a = was + dt;
          const k = popKind[i];
          popAge[i] = a;
          if (k === 1 && was < KISS && a >= KISS) burst(i);
          if (k === 4 && was < HD && a >= HD) api.sfx("land");
          if (a > (k === 1 ? KISS + (grid[i]! >= 7 ? 1 : 0.6) : k === 4 ? HT : 0.25)) popAge[i] = -1;
        }
        for (const b of bits) {
          b.a += dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.vy += cell * (b.k === 3 ? -1.2 : b.k === 2 ? 3 : 9) * dt;
          if (b.k === 2) b.vx *= 0.97;
        }
        bits = bits.filter((b) => b.a < b.m);
        for (const q of pops) q.a += dt;
        pops = pops.filter((q) => q.a < 0.8);
        shakeT = Math.max(0, shakeT - dt);
        bumpT = Math.max(0, bumpT - dt);
        aweT -= dt;
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

    // The waiter sets the first two dishes on the table.
    spawn(true);
    spawn(true);
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
