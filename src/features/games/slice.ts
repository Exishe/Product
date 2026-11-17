// "Chef's Knife": vegetables are tossed up from the bottom of a wooden board.
// Swipe across them to slice; sliced hot coals and dropped vegetables cost a
// life. No words on the canvas (the host shows the title and rules).
import { C, clamp, fitCanvas, glyph, label, loop, pointerPos, rand, roundRect } from "./engine";
import type { Game } from "./engine";

// Emoji and the colour of its juice.
const VEG: readonly (readonly [string, string])[] = [
  ["🍅", "#e0452f"],
  ["🫑", "#5fae45"],
  ["🍆", "#7a4a8c"],
  ["🥒", "#8cc65a"],
  ["🧅", "#efe2c0"],
  ["🍑", "#f6a05a"],
  ["🍋", "#f4dc4a"],
  ["🥕", "#f08a2a"],
  ["🍇", "#8e4fa8"],
];

type Item = { x: number; y: number; vx: number; vy: number; g: number; rot: number; vr: number; e: number; coal: boolean; ph: number };
type Half = { x: number; y: number; vx: number; vy: number; rot: number; vr: number; e: number; cut: number; side: number };
type Drop = { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; r: number };
type Float = { x: number; y: number; text: string; life: number };
type Pt = { x: number; y: number; t: number };

const LIVES = 3;
const TRAIL = 0.15; // seconds a blade point stays visible
const COMBO_GAP = 0.3; // seconds between slices that still count as one swipe

/** The wooden counter, drawn once per size into its own canvas. */
function makeBoard(w: number, h: number): HTMLCanvasElement | null {
  const cv = document.createElement("canvas");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(w * dpr);
  cv.height = Math.round(h * dpr);
  const g = cv.getContext("2d");
  if (!g) return null;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.fillStyle = C.tufa;
  g.fillRect(0, 0, w, h);
  g.fillStyle = C.matsoni;
  g.globalAlpha = 0.3;
  g.fillRect(0, 0, w, h);
  let s = 7;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const ph = clamp(h / 6, 80, 150);
  g.lineCap = "round";
  for (let i = 0, y = 0; y < h; i++, y += ph) {
    g.globalAlpha = i % 2 ? 0.1 : 0.03;
    g.fillStyle = C.tufaDark;
    g.fillRect(0, y, w, ph);
    g.strokeStyle = C.tufaDark;
    for (let k = 0; k < Math.max(10, w / 40); k++) {
      const gx = rnd() * w;
      const gy = y + 6 + rnd() * (ph - 12);
      const len = 70 + rnd() * 200;
      g.globalAlpha = 0.08 + rnd() * 0.1;
      g.lineWidth = 1 + rnd();
      g.beginPath();
      g.moveTo(gx, gy);
      g.quadraticCurveTo(gx + len / 2, gy + (rnd() - 0.5) * 8, gx + len, gy + (rnd() - 0.5) * 4);
      g.stroke();
    }
    if (i > 0) {
      g.globalAlpha = 0.5;
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
      g.globalAlpha = 0.28;
      g.strokeStyle = C.matsoni;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(0, y + 2);
      g.lineTo(w, y + 2);
      g.stroke();
    }
  }
  const v = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) / 2);
  v.addColorStop(0, "rgba(24,35,29,0)");
  v.addColorStop(1, "rgba(24,35,29,0.38)");
  g.globalAlpha = 1;
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.35;
  g.strokeStyle = C.matsoni;
  g.lineWidth = 2;
  roundRect(g, 8, 8, w - 16, h - 16, 18);
  g.stroke();
  return cv;
}

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.3, y + s * 0.1, x - s * 0.9, y - s * 0.9, x, y - s * 0.35);
  ctx.bezierCurveTo(x + s * 0.9, y - s * 0.9, x + s * 1.3, y + s * 0.1, x, y + s * 0.9);
  ctx.closePath();
}

export const game: Game = {
  mount(api) {
    const { canvas } = api;
    let W = 1;
    let H = 1;
    let R = 30; // item radius
    let board: HTMLCanvasElement | null = null;
    const fc = fitCanvas(canvas, (s) => {
      W = s.w;
      H = s.h;
      R = clamp(Math.min(W, H) * 0.085, 26, 46);
      board = makeBoard(W, H);
    });
    const ctx = fc.ctx;

    const items: Item[] = [];
    let halves: Half[] = [];
    let drops: Drop[] = [];
    let floats: Float[] = [];
    let pts: Pt[] = [];
    let queue: number[] = [];
    let score = 0;
    let lives = LIVES;
    let t = 0; // game time, drives difficulty
    let clock = 0; // real time, drives the blade trail
    let nextToss = 0.5;
    let flash = 0;
    let shake = 0;
    let over = false;
    let overT = 0;
    let finished = false;
    let pointer = -1;
    let last = { x: 0, y: 0 };
    const combo = { n: 0, t: 0, x: 0, y: 0 };
    api.setScore(0);

    const addScore = (n: number) => {
      score += n;
      api.setScore(score);
    };

    const hurt = (f: number) => {
      if (over) return;
      lives--;
      flash = f;
      if (lives <= 0) over = true;
    };

    const finishCombo = () => {
      if (combo.n >= 3 && !over) {
        addScore(combo.n);
        floats.push({ x: combo.x, y: combo.y - R, text: `+${combo.n}`, life: 1 });
      }
      combo.n = 0;
    };

    const burst = (x: number, y: number, vx: number, vy: number, cols: string[], n: number) => {
      const count = api.reducedMotion ? Math.ceil(n / 2) : n;
      for (let i = 0; i < count; i++) {
        const a = rand(0, Math.PI * 2);
        const sp = rand(60, 260);
        const max = rand(0.4, 0.8);
        drops.push({
          x,
          y,
          vx: vx * 0.3 + Math.cos(a) * sp,
          vy: vy * 0.3 + Math.sin(a) * sp - 60,
          life: max,
          max,
          col: cols[i % cols.length]!,
          r: rand(2, 4.5),
        });
      }
    };

    const cut = (it: Item, ang: number) => {
      if (it.coal) {
        burst(it.x, it.y, it.vx, it.vy, [C.apricot, C.pomegranate, "#ffe2a8"], 16);
        if (!api.reducedMotion) shake = 1;
        hurt(1);
        return;
      }
      const nx = -Math.sin(ang);
      const ny = Math.cos(ang);
      for (const side of [1, -1]) {
        const push = rand(70, 120);
        halves.push({
          x: it.x,
          y: it.y,
          vx: it.vx + side * nx * push,
          vy: it.vy * 0.4 + side * ny * push - 30,
          rot: it.rot,
          vr: it.vr + side * rand(2, 5),
          e: it.e,
          cut: ang - it.rot,
          side,
        });
      }
      burst(it.x, it.y, it.vx, it.vy, [VEG[it.e]![1]], 8);
      addScore(1);
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
        const k = clamp(((it.x - a.x) * dx + (it.y - a.y) * dy) / len2, 0, 1);
        if (Math.hypot(it.x - (a.x + dx * k), it.y - (a.y + dy * k)) > R * 1.05) continue;
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
      items.push({
        x,
        y: H + R,
        vx: (rand(0.25, 0.75) * W - x) / flight,
        vy,
        g,
        rot: rand(0, 6.28),
        vr: rand(-4, 4),
        e: Math.floor(Math.random() * VEG.length),
        coal: t > 4 && Math.random() < 0.08 + 0.2 * d,
        ph: rand(0, 6.28),
      });
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
      for (const f of floats) {
        f.y -= 50 * dt;
        f.life -= dt;
      }
      floats = floats.filter((f) => f.life > 0);
      if (combo.n > 0 && (combo.t += dtReal) > COMBO_GAP) finishCombo();
      flash = Math.max(0, flash - dtReal * 2.5);
      shake = Math.max(0, shake - dtReal * 3);
      if (over && (overT += dtReal) > 1) {
        finished = true;
        api.gameOver(score);
      }
    };

    const drawCoal = (it: Item) => {
      const pulse = 0.65 + 0.35 * Math.sin(clock * 7 + it.ph);
      const halo = ctx.createRadialGradient(it.x, it.y, R * 0.3, it.x, it.y, R * 1.9);
      halo.addColorStop(0, `rgba(242,162,58,${0.5 * pulse})`);
      halo.addColorStop(1, "rgba(242,162,58,0)");
      ctx.fillStyle = halo;
      ctx.fillRect(it.x - R * 2, it.y - R * 2, R * 4, R * 4);
      ctx.save();
      ctx.translate(it.x, it.y);
      ctx.rotate(it.rot);
      roundRect(ctx, -R * 0.9, -R * 0.8, R * 1.8, R * 1.6, R * 0.5);
      ctx.fillStyle = C.basalt3;
      ctx.fill();
      ctx.strokeStyle = C.basalt;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-R * 0.55, -R * 0.35);
      ctx.lineTo(-R * 0.15, -R * 0.05);
      ctx.lineTo(-R * 0.3, R * 0.3);
      ctx.lineTo(R * 0.2, R * 0.15);
      ctx.lineTo(R * 0.55, R * 0.45);
      ctx.moveTo(-R * 0.15, -R * 0.05);
      ctx.lineTo(R * 0.25, -R * 0.35);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.strokeStyle = C.apricotDeep;
      ctx.globalAlpha = 0.55 * pulse;
      ctx.lineWidth = 7;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = C.apricot;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = "#ffe2a8";
      ctx.globalAlpha = pulse;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    };

    const drawTrail = () => {
      pts = pts.filter((p) => clock - p.t < TRAIL);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      for (const [col, base, grow, glow] of [
        [C.apricot, 4, 14, 0.55],
        ["#ffffff", 1.5, 4.5, 1],
      ] as const) {
        ctx.strokeStyle = col;
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1]!;
          const b = pts[i]!;
          const k = 1 - (clock - b.t) / TRAIL;
          ctx.globalAlpha = glow * k;
          ctx.lineWidth = base + grow * k;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
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
      if (shake > 0) ctx.translate(rand(-1, 1) * shake * 12, rand(-1, 1) * shake * 12);
      ctx.fillStyle = C.ink;
      for (const it of items) {
        if (it.coal) {
          drawCoal(it);
          continue;
        }
        ctx.globalAlpha = 0.13;
        ctx.beginPath();
        ctx.arc(it.x, it.y + R * 0.15, R * 1.05, 0, 6.29);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.save();
        ctx.translate(it.x, it.y);
        ctx.rotate(it.rot);
        glyph(ctx, VEG[it.e]![0], 0, 0, R * 1.9);
        ctx.restore();
      }
      for (const h of halves) {
        ctx.save();
        ctx.translate(h.x, h.y);
        ctx.rotate(h.rot + h.cut);
        ctx.beginPath();
        ctx.rect(-R * 1.5, h.side > 0 ? 0 : -R * 1.5, R * 3, R * 1.5);
        ctx.clip();
        ctx.rotate(-h.cut);
        glyph(ctx, VEG[h.e]![0], 0, 0, R * 1.9);
        ctx.restore();
      }
      for (const p of drops) {
        ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.29);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      drawTrail();
      for (const f of floats) {
        ctx.globalAlpha = clamp(f.life * 1.5, 0, 1);
        label(ctx, f.text, f.x + 1, f.y + 2, 36, C.ink);
        label(ctx, f.text, f.x, f.y, 36, C.apricot);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      if (flash > 0) {
        ctx.globalAlpha = flash * 0.4;
        ctx.fillStyle = C.pomegranate;
        ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = 1;
      }
      // HUD: lives top-left, score top-right.
      for (let i = 0; i < LIVES; i++) {
        heart(ctx, 24 + i * 32, 28, 11);
        if (i < lives) {
          ctx.fillStyle = C.pomegranate;
          ctx.fill();
          ctx.strokeStyle = C.matsoni;
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          ctx.globalAlpha = 0.4;
          ctx.fillStyle = C.matsoni;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }
      label(ctx, String(score), W - 15, 30, 34, C.ink, "right");
      label(ctx, String(score), W - 16, 28, 34, C.matsoni, "right");
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
