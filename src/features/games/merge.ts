// "Merge the Feast": swipe to slide a 4x4 table of dishes; two equal dishes
// that meet become the next dish. Reach the cake. No words on the canvas.
import { C, fitCanvas, glyph, label, loop, onSwipe, roundRect, type Game, type Size } from "./engine";

type Dir = "up" | "down" | "left" | "right";
type Sprite = { t: number; fr: number; fc: number; tr: number; tc: number };

const N = 4;
const MAX = 12;
const SLIDE = 0.1;
const POP = 0.18;
const DISHES = ["", "🌿", "🍅", "🥒", "🧅", "🍆", "🫓", "🧀", "🥟", "🍢", "🍖", "🍇", "🎂"];
// Tile colours warm up from herb green to pomegranate; [background, value ink].
const LIGHT = C.muted;
const DARK = "rgba(251,252,248,0.85)";
const TILE: [string, string][] = [
  ["", ""],
  [C.tarragonTint, LIGHT],
  ["#eef0c8", LIGHT],
  ["#f7e3a6", LIGHT],
  ["#f6cf7c", LIGHT],
  [C.apricot, LIGHT],
  ["#e8924a", DARK],
  [C.tufa, DARK],
  ["#c9694f", DARK],
  ["#c04a52", DARK],
  [C.pomegranate, DARK],
  ["#8a1a36", DARK],
  ["#5e1229", DARK],
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
    let score = 0;
    let over = false;
    let overT = 0;
    let reported = false;
    let bx = 0;
    let by = 0;
    let side = 0;
    let gap = 0;
    let cell = 0;
    let stripY = 0;
    let best = 1;

    const fit = fitCanvas(canvas, (s: Size) => {
      side = Math.max(120, Math.min(s.w - 24, s.h - 110, 480));
      gap = side * 0.026;
      cell = (side - gap * (N + 1)) / N;
      bx = (s.w - side) / 2;
      by = Math.max(8, (s.h - side - 44) / 2);
      stripY = by + side + 26;
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

    // Ends the slide: merged dishes pop, a new dish appears, check for the end.
    const finish = () => {
      if (slideT < 0) return;
      slideT = -1;
      sprites = [];
      for (const i of merged) {
        popAge[i] = 0;
        popKind[i] = 1;
      }
      merged = [];
      spawn();
      if (!canMove()) {
        over = true;
        overT = 0;
      }
    };

    const move = (dir: Dir) => {
      if (over) return;
      finish();
      if (over) return;
      const at = (k: number, i: number): [number, number] =>
        dir === "left" ? [k, i] : dir === "right" ? [k, N - 1 - i] : dir === "up" ? [i, k] : [N - 1 - i, k];
      const next: number[] = new Array(N * N).fill(0);
      const sp: Sprite[] = [];
      const mg: number[] = [];
      let gained = 0;
      let moved = false;
      for (let k = 0; k < N; k++) {
        let n = 0;
        let prev = 0;
        for (let i = 0; i < N; i++) {
          const [r, c] = at(k, i);
          const t = grid[r * N + c]!;
          if (!t) continue;
          if (prev === t && t < MAX) {
            const [tr, tc] = at(k, n - 1);
            next[tr * N + tc] = t + 1;
            gained += 2 ** (t + 1);
            mg.push(tr * N + tc);
            sp.push({ t, fr: r, fc: c, tr, tc });
            best = Math.max(best, t + 1);
            prev = 0;
            moved = true;
          } else {
            const [tr, tc] = at(k, n);
            next[tr * N + tc] = t;
            sp.push({ t, fr: r, fc: c, tr, tc });
            if (tr !== r || tc !== c) moved = true;
            prev = t;
            n++;
          }
        }
      }
      if (!moved) return;
      grid = next;
      sprites = sp;
      merged = mg;
      slideT = 0;
      if (gained) {
        score += gained;
        api.setScore(score);
      }
    };

    const px = (c: number) => bx + gap + c * (cell + gap);
    const py = (r: number) => by + gap + r * (cell + gap);

    const tile = (t: number, cx: number, cy: number, scale: number) => {
      const sz = cell * scale;
      const x = cx - sz / 2;
      const y = cy - sz / 2;
      const [bg, ink] = TILE[t]!;
      ctx.fillStyle = "rgba(19,36,27,0.16)";
      roundRect(ctx, x, y + sz * 0.04, sz, sz, sz * 0.18);
      ctx.fill();
      ctx.fillStyle = bg;
      roundRect(ctx, x, y, sz, sz, sz * 0.18);
      ctx.fill();
      if (t === MAX) {
        ctx.strokeStyle = C.apricot;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
      glyph(ctx, DISHES[t]!, cx, cy + sz * 0.04, sz * 0.5);
      label(ctx, String(2 ** t), x + sz * 0.11, y + sz * 0.16, sz * 0.17, ink, "left");
    };

    const popScale = (i: number) => {
      const a = popAge[i]!;
      if (a < 0 || calm) return 1;
      const p = Math.min(1, a / POP);
      return popKind[i] === 2 ? 0.3 + 0.7 * (1 - (1 - p) ** 3) : 1 + 0.2 * Math.sin(Math.PI * p);
    };

    const draw = () => {
      const s = fit.size();
      ctx.clearRect(0, 0, s.w, s.h);
      ctx.fillStyle = C.matsoni;
      ctx.fillRect(0, 0, s.w, s.h);
      ctx.fillStyle = C.mist;
      roundRect(ctx, bx, by, side, side, side * 0.045);
      ctx.fill();
      ctx.fillStyle = "rgba(201,210,200,0.7)";
      for (let r = 0; r < N; r++) {
        for (let c = 0; c < N; c++) {
          roundRect(ctx, px(c), py(r), cell, cell, cell * 0.18);
          ctx.fill();
        }
      }
      if (slideT >= 0) {
        const p = Math.min(1, slideT / SLIDE);
        const e = 1 - (1 - p) * (1 - p);
        for (const m of sprites) {
          tile(m.t, px(m.fc + (m.tc - m.fc) * e) + cell / 2, py(m.fr + (m.tr - m.fr) * e) + cell / 2, 1);
        }
      } else {
        for (let i = 0; i < N * N; i++) {
          const t = grid[i]!;
          if (t) tile(t, px(i % N) + cell / 2, py(Math.floor(i / N)) + cell / 2, popScale(i));
        }
      }
      // Progress strip: dishes found so far stay lit.
      const step = side / MAX;
      const es = Math.min(26, step * 0.8);
      for (let t = 1; t <= MAX; t++) {
        ctx.globalAlpha = t <= best ? 1 : 0.22;
        glyph(ctx, DISHES[t]!, bx + step * (t - 0.5), stripY, es);
      }
      ctx.globalAlpha = 1;
      if (over) {
        ctx.fillStyle = `rgba(251,252,248,${Math.min(0.6, overT * 1.5)})`;
        roundRect(ctx, bx, by, side, side, side * 0.045);
        ctx.fill();
      }
    };

    const stopSwipe = onSwipe(canvas, move, 20);
    const stopLoop = loop(api, (dt, paused) => {
      if (!paused) {
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
        if (over) {
          overT += dt;
          if (overT > 0.9 && !reported) {
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
      canvas.style.touchAction = prevTouch;
    };
  },
};
