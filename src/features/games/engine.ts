// Shared bits for the waiting-room games: the contract between the host and a
// game, a canvas that follows its box at device resolution, a fixed-step-free
// frame loop that pauses itself, and on-screen buttons for the action games.
// Plain canvas 2D, no game library: each game is a few kilobytes and loads
// only when the guest taps it.

export type Locale = "hy" | "ru" | "en";

export type GameApi = {
  canvas: HTMLCanvasElement;
  /** The live score, shown by the host above the game. */
  setScore(score: number): void;
  /** The round is over: the host shows the score and "play again" (it remounts the game). */
  gameOver(score: number): void;
  /** True while the host covers the game (the "your order is ready" banner, a hidden tab). */
  isPaused(): boolean;
  reducedMotion: boolean;
  locale: Locale;
  /** Short synthesized sound effects; silent unless the guest turned sound on in the host. */
  sfx: (kind: SfxKind) => void;
};

export type SfxKind =
  | "tap"
  | "jump"
  | "land"
  | "coin"
  | "hit"
  | "heavy"
  | "block"
  | "slice"
  | "whoosh"
  | "merge"
  | "bad"
  | "win"
  | "lose";

/** A game mounts into the host's canvas and returns its cleanup. */
export type Game = { mount(api: GameApi): () => void };

// The café palette (globals.css), for drawing.
export const C = {
  matsoni: "#fbfcf8",
  ink: "#13241b",
  muted: "#4a5b51",
  tarragon: "#1d6a43",
  tarragonTint: "#e2eee6",
  tarragonLight: "#5cc48e",
  apricot: "#f2a23a",
  apricotDeep: "#c9780f",
  pomegranate: "#b0213a",
  pomTint: "#f8e3e6",
  mist: "#e8ece6",
  line: "#c9d2c8",
  basalt: "#0e1612",
  basalt2: "#18231d",
  basalt3: "#24322a",
  sky: "#cfe6f2",
  tufa: "#d98c6a", // Yerevan's pink stone
  tufaDark: "#b06a4c",
} as const;

export type Size = { w: number; h: number };

/**
 * Keeps the canvas backing store at device pixels while drawing in CSS
 * pixels. Calls onResize with the CSS size now and on every change.
 */
export function fitCanvas(canvas: HTMLCanvasElement, onResize: (size: Size) => void): {
  ctx: CanvasRenderingContext2D;
  size: () => Size;
  stop: () => void;
} {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");
  let size: Size = { w: 1, h: 1 };
  const apply = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    size = { w: Math.max(1, rect.width), h: Math.max(1, rect.height) };
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    onResize(size);
  };
  apply();
  const observer = new ResizeObserver(apply);
  observer.observe(canvas);
  return { ctx, size: () => size, stop: () => observer.disconnect() };
}

/**
 * requestAnimationFrame loop with dt in seconds, clamped so a stalled tab or
 * a pause never makes things jump. Skips updates while paused but keeps
 * drawing, so the last frame stays on screen.
 */
export function loop(api: GameApi, frame: (dt: number, paused: boolean) => void): () => void {
  let last = performance.now();
  let id = 0;
  const tick = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frame(dt, api.isPaused() || document.hidden);
    id = requestAnimationFrame(tick);
  };
  id = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(id);
}

/** Pointer position in canvas CSS pixels. */
export function pointerPos(canvas: HTMLCanvasElement, e: PointerEvent): { x: number; y: number } {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Draws an emoji (or any glyph) centred at x, y with the given size in px. */
export function glyph(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number) {
  ctx.font = `${Math.round(size)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x, y);
}

/** Numbers and short labels in the UI face. */
export function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = "center",
  weight = 700,
) {
  ctx.font = `${weight} ${Math.round(size)}px "Google Sans", system-ui, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

export function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

export function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Swipe direction from a pointer drag (for grid games). */
export function onSwipe(
  canvas: HTMLCanvasElement,
  handler: (dir: "up" | "down" | "left" | "right") => void,
  minDistance = 24,
): () => void {
  let start: { x: number; y: number; id: number } | null = null;
  const down = (e: PointerEvent) => {
    start = { ...pointerPos(canvas, e), id: e.pointerId };
  };
  const up = (e: PointerEvent) => {
    if (!start || start.id !== e.pointerId) return;
    const p = pointerPos(canvas, e);
    const dx = p.x - start.x;
    const dy = p.y - start.y;
    start = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < minDistance) return;
    handler(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
  };
  const key = (e: KeyboardEvent) => {
    const map: Record<string, "up" | "down" | "left" | "right"> = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
    };
    const dir = map[e.key];
    if (dir) {
      e.preventDefault();
      handler(dir);
    }
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  window.addEventListener("keydown", key);
  return () => {
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", up);
    window.removeEventListener("keydown", key);
  };
}

// --- On-screen buttons for the action games (multi-touch) ------------------

export type PadButton = "left" | "right" | "up" | "down" | "a" | "b" | "c";
export type PadState = Record<PadButton, boolean>;
type PadLayoutItem = { id: PadButton; x: number; y: number; r: number; icon: string };

/**
 * Virtual buttons drawn on the canvas: a left cluster (arrows) and a right
 * cluster (actions). `layout` places them for the current size; `pressed`
 * edges (just went down this frame) are reported once via `consume`.
 * Keyboard works too: arrows, Space/Z = a, X = b, C = c.
 */
export function createPad(
  canvas: HTMLCanvasElement,
  layout: (size: Size) => PadLayoutItem[],
): {
  state: PadState;
  /** True once per press. */
  consume: (id: PadButton) => boolean;
  draw: (ctx: CanvasRenderingContext2D, size: Size) => void;
  stop: () => void;
} {
  const state: PadState = { left: false, right: false, up: false, down: false, a: false, b: false, c: false };
  const edges = new Set<PadButton>();
  const touches = new Map<number, PadButton>();
  let items: PadLayoutItem[] = [];
  let lastSize: Size = { w: 0, h: 0 };

  const hit = (x: number, y: number): PadButton | null => {
    let best: PadLayoutItem | null = null;
    let bestD = Infinity;
    for (const it of items) {
      const d = Math.hypot(x - it.x, y - it.y);
      // Generous hit area: thumbs are not precise.
      if (d < it.r * 1.35 && d < bestD) {
        best = it;
        bestD = d;
      }
    }
    return best?.id ?? null;
  };
  const refresh = () => {
    for (const k of Object.keys(state) as PadButton[]) state[k] = false;
    for (const id of touches.values()) state[id] = true;
    for (const k of keysDown) state[k] = true;
  };
  const press = (id: PadButton) => {
    if (!state[id]) edges.add(id);
  };

  const down = (e: PointerEvent) => {
    e.preventDefault();
    const p = pointerPos(canvas, e);
    const id = hit(p.x, p.y);
    if (!id) return;
    press(id);
    touches.set(e.pointerId, id);
    canvas.setPointerCapture?.(e.pointerId);
    refresh();
  };
  const move = (e: PointerEvent) => {
    if (!touches.has(e.pointerId)) return;
    const p = pointerPos(canvas, e);
    const id = hit(p.x, p.y);
    const prev = touches.get(e.pointerId);
    if (id && id !== prev) {
      press(id);
      touches.set(e.pointerId, id);
      refresh();
    }
  };
  const up = (e: PointerEvent) => {
    touches.delete(e.pointerId);
    refresh();
  };

  const keyMap: Record<string, PadButton> = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
    " ": "a",
    z: "a",
    x: "b",
    c: "c",
  };
  const keysDown = new Set<PadButton>();
  const kd = (e: KeyboardEvent) => {
    const id = keyMap[e.key];
    if (!id) return;
    e.preventDefault();
    if (!keysDown.has(id)) press(id);
    keysDown.add(id);
    refresh();
  };
  const ku = (e: KeyboardEvent) => {
    const id = keyMap[e.key];
    if (!id) return;
    keysDown.delete(id);
    refresh();
  };

  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  window.addEventListener("keydown", kd);
  window.addEventListener("keyup", ku);

  return {
    state,
    consume: (id) => edges.delete(id),
    draw: (ctx, size) => {
      if (size.w !== lastSize.w || size.h !== lastSize.h) {
        items = layout(size);
        lastSize = size;
      }
      for (const it of items) {
        ctx.globalAlpha = state[it.id] ? 0.55 : 0.32;
        ctx.fillStyle = C.ink;
        ctx.beginPath();
        ctx.arc(it.x, it.y, it.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.95;
        ctx.fillStyle = C.matsoni;
        glyph(ctx, it.icon, it.x, it.y + 1, it.r * 0.9);
        ctx.globalAlpha = 1;
      }
    },
    stop: () => {
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    },
  };
}

/** Best score per game on this phone (no account needed). */
export function bestScore(gameId: string): number {
  try {
    return Number(localStorage.getItem(`pativ:game:${gameId}:best`)) || 0;
  } catch {
    return 0;
  }
}

export function saveBest(gameId: string, score: number): number {
  const best = Math.max(bestScore(gameId), score);
  try {
    localStorage.setItem(`pativ:game:${gameId}:best`, String(best));
  } catch {
    // private mode: the best score just isn't kept
  }
  return best;
}

// --- Sound: tiny synthesized effects, no audio files ------------------------

type Note = { f: number; to?: number; t: number; type?: OscillatorType; v?: number; noise?: boolean };
const SFX: Record<SfxKind, Note[]> = {
  tap: [{ f: 660, t: 0.04, type: "triangle", v: 0.15 }],
  jump: [{ f: 320, to: 640, t: 0.12, type: "square", v: 0.08 }],
  land: [{ f: 140, to: 70, t: 0.08, type: "triangle", v: 0.2 }],
  coin: [
    { f: 988, t: 0.06, type: "square", v: 0.07 },
    { f: 1319, t: 0.12, type: "square", v: 0.07 },
  ],
  hit: [{ f: 0, t: 0.08, noise: true, v: 0.35 }, { f: 180, to: 90, t: 0.1, type: "square", v: 0.12 }],
  heavy: [{ f: 0, t: 0.16, noise: true, v: 0.45 }, { f: 110, to: 45, t: 0.18, type: "sawtooth", v: 0.14 }],
  block: [{ f: 420, t: 0.05, type: "square", v: 0.1 }, { f: 0, t: 0.05, noise: true, v: 0.15 }],
  slice: [{ f: 0, t: 0.07, noise: true, v: 0.25 }, { f: 1800, to: 900, t: 0.07, type: "sine", v: 0.06 }],
  whoosh: [{ f: 0, t: 0.12, noise: true, v: 0.12 }],
  merge: [{ f: 523, to: 784, t: 0.1, type: "triangle", v: 0.14 }],
  bad: [{ f: 200, to: 80, t: 0.25, type: "sawtooth", v: 0.12 }],
  win: [
    { f: 523, t: 0.1, type: "square", v: 0.07 },
    { f: 659, t: 0.1, type: "square", v: 0.07 },
    { f: 784, t: 0.1, type: "square", v: 0.07 },
    { f: 1047, t: 0.25, type: "square", v: 0.07 },
  ],
  lose: [
    { f: 392, t: 0.15, type: "triangle", v: 0.12 },
    { f: 311, t: 0.15, type: "triangle", v: 0.12 },
    { f: 233, t: 0.35, type: "triangle", v: 0.12 },
  ],
};

/** A synth for the host to hand to games as api.sfx; plays nothing while muted. */
export function createSfx(isOn: () => boolean): { play: (kind: SfxKind) => void; close: () => void } {
  let ac: AudioContext | null = null;
  let noise: AudioBuffer | null = null;
  let last = new Map<SfxKind, number>();
  return {
    play(kind) {
      if (!isOn()) return;
      try {
        ac ??= new AudioContext();
        if (ac.state === "suspended") void ac.resume();
        const now = ac.currentTime;
        // The same sound at most every 40 ms: a burst of coins doesn't turn into noise.
        if (now - (last.get(kind) ?? -1) < 0.04) return;
        last.set(kind, now);
        let at = now;
        for (const n of SFX[kind]) {
          const gain = ac.createGain();
          gain.gain.setValueAtTime(n.v ?? 0.1, at);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + n.t);
          gain.connect(ac.destination);
          if (n.noise) {
            if (!noise) {
              noise = ac.createBuffer(1, ac.sampleRate * 0.3, ac.sampleRate);
              const d = noise.getChannelData(0);
              for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
            }
            const src = ac.createBufferSource();
            src.buffer = noise;
            src.connect(gain);
            src.start(at);
            src.stop(at + n.t);
          } else {
            const osc = ac.createOscillator();
            osc.type = n.type ?? "sine";
            osc.frequency.setValueAtTime(n.f, at);
            if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, at + n.t);
            osc.connect(gain);
            osc.start(at);
            osc.stop(at + n.t);
          }
          // Notes of one sound play in sequence, except noise layered under a tone.
          if (!n.noise) at += n.t * 0.85;
        }
      } catch {
        // no audio on this device: games stay silent
      }
    },
    close() {
      void ac?.close();
      ac = null;
      last = new Map();
    },
  };
}
