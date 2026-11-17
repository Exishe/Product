// "Rooftop Cat": a ginger cat runs across Yerevan rooftops at sunset, jumps
// gaps, stomps pigeons, picks apricots and reaches the café door. Three short
// hand-made levels. No words on the canvas.
//
// Art direction (docs/games/reference/art-direction.md)
// - Mood: a warm Yerevan evening; a ginger cat trots home over pink tufa roofs
//   towards a low sun. Unhurried, golden, a little cosy.
// - Camera and scale: side view, 2.5D in layers: sky, Ararat, three city
//   layers with parallax, then the play layer. 10 tile rows fill the top 65%
//   of the screen; vector shapes scale with the tile, no pixel grid.
// - Shapes: the cat round and soft (ovals, a curved tail); the walking pigeon
//   a plump upright blob, the flying pigeon a wide wing V; the world blocky
//   (tufa blocks, tin ribs, straight poles).
// - Values: the cat and pigeons carry the strongest contrast (dark outline,
//   saturated fill); sky and far city stay pale in a narrow range; roofs mid.
// - Palette: cat ginger #e8873a (player), slate pigeons #8d98a8 / #5d6680
//   (threat), tufa #d98c6a (ground), apricot and gold (reward), tarragon door
//   (goal). Warm key light from the sun on the right (#ffd2a0 on right edges
//   and roof tops); cool violet shadow on left and under edges. Far layers
//   paler and cooler, near layers darker and warmer.
// - Detail: faces, the apricots, the café door and its cup sign; far layers
//   are flat shapes with window dots, nothing busy behind play.
// - Rules: one vector style; dark outline on characters only, never on the
//   world; flat fills with one warm key and cool shade, haze for distance.
// - Signature: window lights across the far city as the sun sinks behind
//   Ararat, and chimneys that start smoking once the cat passes them.
import { C, clamp, createPad, fitCanvas, label, loop, pick, rand, roundRect, type Game, type PadButton, type Size } from "./engine";

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
    "              f                      Goo                                                                         f",
    "                    o                ----                               p     ooo                 f",
    "                                      p              ooo              ###### ~~~~~                          oo             G",
    "              o  p  W               ###### ~~~~     -----     o   H   ######         K p W        oo      #####          ----",
    "  P   ooo       ==========      K   ######       K  p  A        ############        ============       p  #####     K   p     p   A  D",
    "#############   ##########    ############      =============   ############        ############    ###########    =======================",
    "#############   ##########    ############      #############   ############        ############    ###########    #######################",
  ],
];

const ROWS = 10;
// Physics in tiles and seconds. A full jump rises 3.3 tiles; falling pulls
// 1.25x harder than rising, so a full-run jump clears about 4.6 tiles of
// flat gap. The maps never ask for more than a 4-tile gap or a 2-tile step.
const RUN = 7;
const ACC = 48;
const AIR = 34;
const FRICTION = 42;
const GRAVITY = 55;
const FALL = 1.25;
const JUMP = 19;
const MAX_FALL = 20;
const COYOTE = 0.09;
const BUFFER = 0.1;
const HW = 0.35; // cat half width (against walls and floors)
const CH = 0.8; // cat height
const HARD = 16; // landing speed that thuds
const RESPAWN = 0.5; // seconds from a fall or hit to the checkpoint
const TAU = Math.PI * 2;

type Foe = { x: number; y: number; vx: number; fly: boolean; bx: number; by: number; t: number; dead: boolean; dt: number };
type Item = { x: number; y: number; gold: boolean; got: boolean };
// k: 0 debris, 1 feather, 2 score pop, 3 dust, 4 sparkle, 5 confetti
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; k: number; rot: number; txt?: string };

const ORANGE = "#e8873a";
const ORANGE_DARK = "#b85f1e";
const GOLD = "#ffd23f";
const CLOTHES = [C.pomegranate, C.matsoni, C.tarragonLight, C.apricot, "#6b8fd6"];
const CONFETTI = [C.apricot, C.pomegranate, C.tarragonLight, GOLD, "#6b8fd6", C.matsoni];
const RIM = "rgba(255,210,160,0.6)"; // the sun's key light
const SHADE = "rgba(70,40,100,0.22)"; // cool shadow
// Far to near: parallax, colour, min/max height (tiles), seed, rim strength
const CITY = [
  [0.1, "#d2b4cf", 2.6, 5, 11, 0.2],
  [0.25, "#ba8c9b", 1.6, 3.8, 57, 0.3],
  [0.5, "#8e5f68", 0.8, 3, 93, 0.45],
] as const;

// Stable pseudo-random 0..1 per number (skylines, windows, laundry).
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
    // The pad's icons are drawn here as shapes (font arrows render unevenly).
    let padL: { id: PadButton; x: number; y: number; r: number }[] = [];
    const pad = createPad(canvas, (s) => {
      const vh = Math.round(s.h * 0.65);
      const r = clamp(Math.min(s.w * 0.11, (s.h - vh) * 0.3), 30, 44);
      const cy = vh + (s.h - vh) / 2;
      padL = [
        { id: "left", x: 18 + r, y: cy, r },
        { id: "right", x: 36 + r * 3, y: cy, r },
        { id: "a", x: s.w - 18 - r * 1.3, y: cy, r: r * 1.3 },
      ];
      return padL.map((p) => ({ ...p, icon: "" }));
    });

    // Small drawing helpers. While `over` is set every fill is that colour:
    // drawing a figure four times offset in it gives the figure an outline.
    let over: string | null = null;
    const box = (col: string | CanvasGradient, x: number, y: number, w: number, h: number) => {
      ctx.fillStyle = over ?? col;
      ctx.fillRect(x, y, w, h);
    };
    const oval = (col: string, x: number, y: number, rx: number, ry = rx, rot = 0) => {
      ctx.fillStyle = over ?? col;
      ctx.beginPath();
      ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot, 0, TAU);
      ctx.fill();
    };
    const path = (pts: number[], ox = 0, oy = 0, k = 1) => {
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 2) ctx.lineTo(ox + pts[i]! * k, oy + pts[i + 1]! * k);
      ctx.closePath();
    };
    const shape = (col: string, pts: number[]) => {
      ctx.fillStyle = over ?? col;
      path(pts);
      ctx.fill();
    };
    // Stroked segments: [x1, y1, x2, y2, x1, y1, ...]
    const lines = (col: string, w: number, pts: number[]) => {
      ctx.strokeStyle = over ?? col;
      ctx.lineWidth = w;
      ctx.lineCap = "round";
      ctx.beginPath();
      for (let i = 0; i < pts.length; i += 4) {
        ctx.moveTo(pts[i]!, pts[i + 1]!);
        ctx.lineTo(pts[i + 2]!, pts[i + 3]!);
      }
      ctx.stroke();
    };
    const outlined = (col: string, d: number, fn: () => void) => {
      // A see-through figure gets no outline: stacked passes would darken it
      if (ctx.globalAlpha < 1) return fn();
      over = col;
      for (const [ox, oy] of [[-d, 0], [d, 0], [0, -d], [0, d]] as const) {
        ctx.save();
        ctx.translate(ox, oy);
        fn();
        ctx.restore();
      }
      over = null;
      fn();
    };
    const star = (col: string, x: number, y: number, r: number) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i * Math.PI) / 4 - Math.PI / 2;
        const rr = i % 2 ? r * 0.32 : r;
        ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.fill();
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
    let hitDeath = false;
    let deadX = 0;
    let deadY = 0;

    // Level state
    let map: string[] = [];
    let W = 0;
    let foes: Foe[] = [];
    let items: Item[] = [];
    let checks: { x: number; y: number; t: number }[] = []; // t: time reached, -1 not yet
    let door = { x: 0, y: 0 };
    let sparks: Spark[] = [];
    let cp = { x: 0, y: 0 };
    let camX = 0;
    let look = 0;

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
    let dustT = 0;
    let sq = 0; // squash (<0) and stretch (>0), on a spring
    let sqv = 0;

    const at = (c: number, r: number) => (c < 0 || c >= W ? "#" : (map[r]?.[c] ?? " "));
    const solid = (c: number, r: number) => "#=WH".includes(at(c, r));
    const oneWay = (c: number, r: number) => "-~".includes(at(c, r));

    const many = (n: number) => Math.max(1, Math.round(calm ? n * 0.35 : n));
    const emit = (k: number, px: number, py: number, pvx: number, pvy: number, max: number, col: string, txt?: string) =>
      sparks.push({ x: px, y: py, vx: pvx, vy: pvy, life: 0, max, col, k, rot: rand(0, TAU), txt });
    const burst = (px: number, py: number, n: number, col: string, k = 0, speed = 4) => {
      for (let i = many(n); i--; ) {
        const a = rand(0, TAU);
        const v = rand(speed * 0.3, speed);
        emit(k, px, py, Math.cos(a) * v, Math.sin(a) * v - (k === 5 ? 4 : k === 0 ? 1 : 0), rand(0.4, 0.8) * (k === 5 ? 2.5 : k === 1 ? 1.8 : 1), col);
      }
    };
    const dust = (px: number, py: number, n: number, spread: number) => {
      for (let i = many(n); i--; ) emit(3, px + rand(-0.15, 0.15), py - 0.08, rand(-spread, spread), -rand(0.2, 0.9), rand(0.3, 0.55), "#f8e6d2");
    };
    const squash = (v: number) => {
      sq = calm ? v / 2 : v;
      sqv = 0;
    };
    const addScore = (n: number, px: number, py: number) => {
      score += n;
      api.setScore(score);
      emit(2, px, py, 0, -2.2, 0.8, n > 10 ? "#fff3a0" : "#fff", `+${n}`);
    };

    const respawn = () => {
      x = cp.x;
      y = cp.y;
      vx = vy = 0;
      face = 1;
      hurtT = 1;
      ground = false;
      state = "play";
      dust(x, y, 8, 2.5);
      squash(-0.25);
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
              foes.push({ x: cx, y: r + 1, vx: -1.4, fly: ch === "f", bx: cx, by: r + 0.6, t: rand(0, 6), dead: false, dt: 0 });
            else if (ch === "K") checks.push({ x: cx, y: r + 1, t: -1 });
            else if (ch === "D") door = { x: cx, y: r + 1 };
            else return ch;
            return " ";
          })
          .join(""),
      );
      levelT = 0;
      respawn();
      hurtT = 0;
      look = 0;
      // A short pan back to the cat as the level opens
      camX = calm ? 0 : 6;
    };
    // Instant retry: a fall or a hit costs a life and puts the cat back at the
    // last checkpoint about half a second later.
    const loseLife = (fell: boolean) => {
      lives--;
      hitDeath = !fell;
      deadX = x;
      deadY = y;
      stateT = 0;
      api.sfx(fell ? "bad" : "hit");
      api.sfx(fell ? "whoa" : "meow", fell ? 1.4 : 1.25);
      if (!fell) {
        if (!calm) shake = 0.25;
        burst(x, y - 0.4, 8, "#fff", 4, 3);
      }
      if (lives > 0) state = "dead";
      else {
        state = "end";
        api.sfx("lose");
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
        api.sfx("jump");
        squash(0.3);
        dust(x, y, 3, 1.2);
      }
      // Release early for a lower jump; fall faster than you rise.
      vy = Math.min(MAX_FALL, vy + GRAVITY * dt * (vy < 0 ? (s.a || s.up ? 1 : 2.4) : FALL));
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
      const was = ground;
      const fallV = vy;
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
      if (ground) {
        coyote = COYOTE;
        if (!was) {
          // Landing: a squash always, a thud and a dust puff when it was hard
          squash(-clamp(fallV / 55, 0.08, 0.36));
          if (fallV > HARD) {
            api.sfx("land");
            dust(x - 0.2, y, 4, 2.6);
            dust(x + 0.2, y, 4, 2.6);
          }
        }
      }
      runT += Math.abs(vx) * dt;
      if (y > ROWS + 1.5) loseLife(true);
    };

    const updateWorld = (dt: number) => {
      for (const f of foes) {
        if (f.dead) {
          f.dt += dt;
          continue;
        }
        f.t += dt;
        if (f.fly) {
          // Back and forth along a sine wave
          f.x = f.bx + Math.sin(f.t * 0.9) * 2.2;
          f.vx = Math.cos(f.t * 0.9);
          f.y = f.by + Math.sin(f.t * 2.6) + 0.3;
        } else {
          // Walk; turn at walls and at roof edges
          const nx = f.x + f.vx * dt;
          const ahead = Math.floor(nx + Math.sign(f.vx) * 0.35);
          const row = Math.floor(f.y - 0.5);
          if (solid(ahead, row) || !(solid(ahead, row + 1) || oneWay(ahead, row + 1))) f.vx = -f.vx;
          else f.x = nx;
        }
        if (state !== "play") continue;
        const dx = Math.abs(f.x - x);
        if (vy > 0 && dx < 0.7 && y > f.y - 0.9 && y < f.y - 0.2) {
          // Stomped from above (a generous box): bounce and a feather puff
          f.dead = true;
          vy = pad.state.a || pad.state.up ? -JUMP * 0.85 : -11;
          squash(0.3);
          api.sfx("boing");
          api.sfx("oof", 1.6);
          burst(f.x, f.y - 0.35, 12, f.fly ? "#c9cfdc" : "#eef1f5", 1, 3);
          addScore(50, f.x, f.y - 1);
        } else if (hurtT <= 0 && dx < 0.42 && y - CH + 0.2 < f.y - 0.12 && y - 0.05 > f.y - 0.55) {
          // Fair hurtbox: only the cat's body against the pigeon's body
          loseLife(false);
        }
      }
      for (const it of items) {
        if (!it.got && Math.abs(it.x - x) < 0.6 && Math.abs(it.y - y + CH / 2) < 0.75) {
          it.got = true;
          fruit++;
          api.sfx("coin");
          addScore(it.gold ? 100 : 10, it.x, it.y - 0.5);
          burst(it.x, it.y, it.gold ? 12 : 6, it.gold ? GOLD : "#fff4c8", 4, 3);
        }
      }
      for (const k of checks) {
        if (k.t < 0 && state === "play" && Math.abs(k.x - x) < 0.8 && Math.abs(k.y - y) < 1.5) {
          k.t = time;
          cp = { x: k.x, y: k.y };
          api.sfx("meow", 0.95);
          burst(k.x + 0.4, k.y - 1.6, 8, C.apricot, 4, 2.5);
        }
      }
      if (state === "play" && Math.abs(door.x - x) < 0.7 && y > door.y - 2 && y <= door.y + 0.1) {
        state = "win";
        stateT = 0;
        vx = 0;
        api.sfx("win");
        api.sfx("yay", 1.3);
        burst(door.x, door.y - 2.6, 40, C.apricot, 5, 6);
        for (const p of sparks) if (p.k === 5) p.col = pick(CONFETTI);
        addScore(500 + Math.max(0, Math.round(90 - levelT)) * 5, door.x, door.y - 3.6);
      }
      for (const p of sparks) {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const drag = [0, 1.5, 3, 4, 5, 1.5][p.k]! * dt;
        p.vx *= 1 - drag;
        p.vy = p.vy * (1 - (p.k === 2 ? drag : 0)) + [8, 1.5, 0, 0, 0, 5][p.k]! * dt;
        if (p.k === 3 || p.k === 4) p.vy *= 1 - drag;
      }
      sparks = sparks.filter((p) => p.life < p.max);
    };

    // --- Drawing (positions in CSS px; s = tile size) -----------------------

    const catHead = (cx: number, cy: number, s: number) => {
      shape(ORANGE, [cx - s * 0.9, cy - s * 0.2, cx - s * 0.7, cy - s * 1.15, cx - s * 0.15, cy - s * 0.7, cx + s * 0.15, cy - s * 0.7, cx + s * 0.7, cy - s * 1.15, cx + s * 0.9, cy - s * 0.2]);
      oval(ORANGE, cx, cy, s * 0.85);
      shape("#f6b9a0", [cx - s * 0.62, cy - s * 0.55, cx - s * 0.62, cy - s * 0.95, cx - s * 0.3, cy - s * 0.68]);
      shape("#f6b9a0", [cx + s * 0.62, cy - s * 0.55, cx + s * 0.62, cy - s * 0.95, cx + s * 0.3, cy - s * 0.68]);
      oval("#fbe3cc", cx, cy + s * 0.35, s * 0.42, s * 0.3);
      oval(C.ink, cx - s * 0.33, cy - s * 0.08, s * 0.12, s * 0.15);
      oval(C.ink, cx + s * 0.33, cy - s * 0.08, s * 0.12, s * 0.15);
      oval("#fff", cx - s * 0.29, cy - s * 0.13, s * 0.04);
      oval("#fff", cx + s * 0.37, cy - s * 0.13, s * 0.04);
      oval("#e0707a", cx, cy + s * 0.2, s * 0.12, s * 0.08);
    };

    const catBody = (s: number, air: boolean, b: number, step: number, running: boolean) => {
      // Tail sways; it points up in the air
      const sway = calm ? 0 : Math.sin(time * (running ? 9 : 3)) * 0.25;
      ctx.strokeStyle = over ?? ORANGE;
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
      // Body with stripes, a pale belly and a warm rim from the sun
      oval(ORANGE, 0, -s * 0.36 + b, s * 0.36, s * 0.2);
      oval("#ffb070", s * 0.06, -s * 0.47 + b, s * 0.26, s * 0.07);
      lines(ORANGE_DARK, s * 0.04, [-0.14, 0, 0.14].flatMap((sx) => [sx * s, -s * 0.54 + b, sx * s - s * 0.03, -s * 0.42 + b]));
      oval("#fbe3cc", s * 0.12, -s * 0.27 + b, s * 0.15, s * 0.08);
      const hx = s * 0.3;
      const hy = -s * (air ? 0.63 : 0.6) + b;
      catHead(hx, hy, s * 0.22);
      if (!over) lines("rgba(19,36,27,0.5)", 1, [hx + s * 0.1, hy + s * 0.07, hx + s * 0.32, hy + s * 0.03, hx + s * 0.1, hy + s * 0.1, hx + s * 0.32, hy + s * 0.13]);
    };

    const drawCat = (px: number, py: number, rot = 0, alpha = 1) => {
      const s = T;
      const blink = hurtT > 0 && state === "play";
      if (alpha <= 0 || (blink && !calm && Math.floor(hurtT * 12) % 2 === 0)) return;
      const air = !ground;
      const running = ground && Math.abs(vx) > 0.5;
      const step = running ? Math.floor(runT * 2.2) % 3 : 3;
      ctx.save();
      ctx.globalAlpha = alpha * (blink ? 0.6 : 1);
      ctx.translate(px, py);
      if (rot) {
        ctx.translate(0, -s * 0.4);
        ctx.rotate(rot);
        ctx.translate(0, s * 0.4);
      }
      // Squash and stretch about the feet
      ctx.scale(face * (1 - sq * 0.6), 1 + sq);
      outlined("#4a2418", Math.max(1, s * 0.035), () => catBody(s, air, step === 1 ? -s * 0.04 : 0, step, running));
      ctx.restore();
    };

    // Walker: plump and upright, head bobbing. Flyer: a wide wing V.
    const walker = (t: number) => {
      const bob = Math.sin(t * 8);
      lines("#d46a4a", 0.05, [-0.05, -0.15, -0.08 + bob * 0.05, 0, 0.07, -0.15, 0.1 - bob * 0.05, 0]);
      shape("#6c7686", [-0.2, -0.32, -0.5, -0.22, -0.46, -0.14, -0.16, -0.2]);
      oval("#9aa3b3", 0, -0.3, 0.27, 0.2, -0.2);
      oval("#7f8899", -0.06, -0.31, 0.17, 0.1, -0.25);
      lines("#4e5566", 0.03, [-0.14, -0.33, -0.02, -0.29, -0.16, -0.27, -0.04, -0.23]);
      const hx = 0.2 + Math.max(0, bob) * 0.07;
      oval("#5f9a8c", 0.13, -0.45, 0.1, 0.11);
      oval("#7a8494", hx, -0.58, 0.11);
      shape("#f0b25a", [hx + 0.09, -0.6, hx + 0.19, -0.56, hx + 0.09, -0.53]);
      oval("#ff8a3c", hx + 0.04, -0.6, 0.035);
      oval(C.ink, hx + 0.045, -0.6, 0.017);
    };
    const flyer = (t: number) => {
      const flap = calm ? 0.3 : Math.sin(t * 14);
      shape("#3f455a", [-0.02, -0.42, -0.1, -0.5 - flap * 0.42, -0.34, -0.42 - flap * 0.5, -0.22, -0.36]);
      shape("#4c5268", [-0.42, -0.36, -0.62, -0.46, -0.62, -0.26]);
      oval("#5d6680", 0, -0.36, 0.33, 0.11);
      oval("#e9ecf2", -0.24, -0.35, 0.07, 0.08);
      oval("#4f8f86", 0.2, -0.39, 0.08, 0.08);
      oval("#6a7290", 0.32, -0.42, 0.1, 0.09);
      shape("#f0b25a", [0.4, -0.44, 0.5, -0.41, 0.4, -0.38]);
      oval("#ff8a3c", 0.35, -0.44, 0.03);
      shape("#7d86a4", [0.04, -0.38, 0.0, -0.46 - flap * 0.5, -0.24, -0.4 - flap * 0.6, -0.42, -0.4 - flap * 0.48, -0.16, -0.32]);
      lines("#2f3446", 0.04, [-0.24, -0.4 - flap * 0.6, -0.42, -0.4 - flap * 0.48]);
    };
    const drawPigeon = (f: Foe, px: number, py: number) => {
      const s = T;
      ctx.save();
      ctx.globalAlpha = f.dead ? Math.max(0, 1 - f.dt * 4) : 1;
      ctx.translate(px, py - (f.fly || f.dead ? 0 : Math.abs(Math.sin(f.t * 8)) * s * 0.04));
      ctx.scale(f.vx > 0 ? s : -s, s * (f.dead ? 1 - Math.min(1, f.dt * 6) * 0.6 : 1));
      outlined("#2a2838", 0.035, () => (f.fly ? flyer(f.t) : walker(f.t)));
      ctx.restore();
    };

    const drawFruit = (gold: boolean, px: number, py: number, r: number) => {
      if (gold) oval("rgba(255,226,120,0.35)", px, py, r * (1.9 + (calm ? 0 : Math.sin(time * 5) * 0.2)));
      oval(C.apricotDeep, px, py, r + 1);
      oval(gold ? GOLD : C.apricot, px, py, r);
      oval(gold ? "#f2b820" : "#ea8a2a", px + r * 0.3, py + r * 0.28, r * 0.6);
      oval(gold ? "#fff6c2" : "#ffd28a", px - r * 0.38, py - r * 0.35, r * 0.28);
      ctx.strokeStyle = C.apricotDeep;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(px + r * 0.9, py, r * 0.9, Math.PI * 0.8, Math.PI * 1.2);
      ctx.stroke();
      lines("#6b4a2a", Math.max(1, r * 0.15), [px, py - r * 0.85, px + r * 0.1, py - r * 1.15]);
      oval(C.tarragon, px + r * 0.4, py - r * 1.05, r * 0.42, r * 0.18, -0.5);
    };

    const drawTile = (ch: string, c: number, r: number, px: number, py: number) => {
      const s = T;
      const t = s + 0.5;
      const top = !solid(c, r - 1) && !"HW".includes(ch);
      if (ch === "#" || ch === "=") {
        // Tufa blocks in slightly varied stones, mortar, then light: warm on
        // the sun side (right) and on top, cool on the left and below.
        const h = hash(c * 3.1 + r * 17);
        box(h > 0.66 ? "#d6896a" : h > 0.33 ? C.tufa : "#db8f6e", px, py, t, t);
        const o = r % 2 ? s * 0.25 : s * 0.75;
        const o2 = px + ((o + s / 2) % s);
        lines("rgba(150,80,70,0.55)", 1, [px, py + s / 2, px + s, py + s / 2, px + o, py, px + o, py + s / 2, o2, py + s / 2, o2, py + s]);
        if (r > 7) box(`rgba(70,40,90,${(r - 7) * 0.12})`, px, py, t, t);
        if (!solid(c + 1, r)) box(RIM, px + s * 0.9, py, s * 0.1, t);
        if (!solid(c - 1, r)) box(SHADE, px, py, s * 0.14, t);
        if (!solid(c, r + 1)) box("rgba(60,30,70,0.35)", px, py + s * 0.78, t, s * 0.22);
        if (top) {
          if (ch === "=") {
            // Tin roof cap with ribs, slightly overhanging
            box("#7f9196", px - 1, py - s * 0.08, t + 2, s * 0.34);
            box("#a9babd", px - 1, py - s * 0.08, t + 2, s * 0.07);
            for (let i = 0; i < 4; i++) box("#c7d4d6", px + (i + 0.3) * (s / 4), py - s * 0.02, 2, s * 0.26);
            box("rgba(60,30,70,0.3)", px, py + s * 0.26, t, s * 0.06);
          } else {
            // Coping stone: a lit top face and a shadow line under its lip
            box("#eeaa86", px - 1, py - s * 0.1, t + 2, s * 0.2);
            box("#ffd2aa", px - 1, py - s * 0.1, t + 2, s * 0.05);
            box("rgba(80,40,70,0.28)", px, py + s * 0.1, t, s * 0.07);
          }
          if (!solid(c + 1, r)) box("#ffe2c0", px + s * 0.85, py - s * 0.1, s * 0.15 + 1, s * 0.2);
        }
      } else if (ch === "W") {
        // Water tank on two legs, lit on the right
        box("#5d6b72", px + s * 0.2, py + s * 0.7, s * 0.08, s * 0.3);
        box("#5d6b72", px + s * 0.72, py + s * 0.7, s * 0.08, s * 0.3);
        ctx.fillStyle = "#94abb4";
        roundRect(ctx, px + s * 0.06, py + s * 0.06, s * 0.88, s * 0.68, s * 0.12);
        ctx.fill();
        box("#7e979f", px + s * 0.06, py + s * 0.28, s * 0.88, s * 0.05);
        box("#7e979f", px + s * 0.06, py + s * 0.5, s * 0.88, s * 0.05);
        box(RIM, px + s * 0.8, py + s * 0.1, s * 0.1, s * 0.6);
        box(SHADE, px + s * 0.06, py + s * 0.1, s * 0.12, s * 0.6);
        box("#d4e0e2", px + s * 0.06, py, s * 0.88, s * 0.08);
      } else if (ch === "H") {
        box("#b9705a", px + s * 0.15, py + s * 0.15, s * 0.7, s * 0.85);
        box(RIM, px + s * 0.72, py + s * 0.15, s * 0.13, s * 0.85);
        box(SHADE, px + s * 0.15, py + s * 0.15, s * 0.12, s * 0.85);
        box("#8f5038", px + s * 0.08, py, s * 0.84, s * 0.18);
        box("#e7a27f", px + s * 0.08, py, s * 0.84, s * 0.05);
      } else if (ch === "-") {
        // Plank, with a post at each end
        box("#8a5a3a", px, py, t, s * 0.22);
        box("#c8956a", px, py, t, s * 0.06);
        box("rgba(60,30,40,0.3)", px, py + s * 0.22, t, s * 0.05);
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
        box("rgba(70,40,100,0.2)", sw + s * 0.2, py + s * 0.1, s * 0.1, s * 0.45);
      } else if (ch === "A") {
        const m = px + s / 2;
        lines("#4b4250", 2, [m, py + s, m, py - s * 0.9, m - s * 0.45, py - s * 0.8, m + s * 0.45, py - s * 0.8, m - s * 0.33, py - s * 0.5, m + s * 0.33, py - s * 0.5, m - s * 0.2, py - s * 0.2, m + s * 0.2, py - s * 0.2]);
        oval(calm || Math.sin(time * 3) > 0 ? "#ff6a4a" : "#a04a3a", m, py - s * 0.92, 2.5);
      }
    };

    const drawBackground = (w: number) => {
      const v = viewH;
      const g = ctx.createLinearGradient(0, 0, 0, v);
      g.addColorStop(0, "#8f95cf");
      g.addColorStop(0.42, "#ebbac2");
      g.addColorStop(0.72, "#ffd39e");
      g.addColorStop(1, "#ffb97c");
      box(g, 0, 0, w, v);
      // The low sun and its glow
      const sx = w * 0.76;
      const sy = v * 0.44;
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, v * 0.6);
      glow.addColorStop(0, "rgba(255,240,200,1)");
      glow.addColorStop(0.12, "rgba(255,214,150,0.6)");
      glow.addColorStop(1, "rgba(255,190,140,0)");
      box(glow, 0, 0, w, v);
      oval("#fff4d8", sx, sy, T * 0.95);
      // Long thin clouds, lit from below
      for (let i = 0; i < 4; i++) {
        const span = w + T * 8;
        const cx = ((((hash(i + 3) * span - camX * T * 0.03 - (calm ? 0 : time * 3)) % span) + span) % span) - T * 4;
        const cy = v * (0.1 + hash(i + 9) * 0.26);
        oval("rgba(240,200,215,0.6)", cx, cy, T * (1.4 + hash(i) * 1.5), T * 0.16);
        oval("rgba(255,232,200,0.75)", cx + T * 0.3, cy + T * 0.08, T * (0.9 + hash(i + 1)), T * 0.08);
      }
      // Ararat: the palest, coolest layer, warm on the sun side
      const mx = w * 0.28 - camX * T * 0.04;
      shape("#dcc3db", [mx - v * 0.9, v * 0.8, mx, v * 0.28, mx + v * 0.38, v * 0.55, mx + v * 0.6, v * 0.47, mx + v * 1.1, v * 0.8]);
      shape("#ecd0d6", [mx, v * 0.28, mx + v * 0.38, v * 0.55, mx + v * 0.6, v * 0.47, mx + v * 1.1, v * 0.8, mx + v * 0.25, v * 0.8, mx + v * 0.1, v * 0.5]);
      shape("#fdf3ee", [mx - v * 0.12, v * 0.36, mx, v * 0.28, mx + v * 0.1, v * 0.34, mx + v * 0.04, v * 0.37, mx - v * 0.04, v * 0.345]);
      shape("#fdf3ee", [mx + v * 0.53, v * 0.5, mx + v * 0.6, v * 0.47, mx + v * 0.66, v * 0.5]);
      const haze = ctx.createLinearGradient(0, v * 0.45, 0, v);
      haze.addColorStop(0, "rgba(255,214,190,0)");
      haze.addColorStop(1, "rgba(255,214,190,0.55)");
      // Three city layers: each nearer one darker, warmer and faster, with a
      // sunlit right edge and windows lighting up.
      CITY.forEach(([par, col, lo, hi, seed, rim], li) => {
        const bw = T * (1.2 + par);
        const off = camX * T * par;
        for (let i = Math.floor(off / bw) - 1; i * bw - off < w; i++) {
          const h = hash(i + seed);
          const bh = (lo + h * (hi - lo)) * T;
          const ww = bw * (0.72 + hash(i * 3.7 + seed) * 0.3);
          const bx = i * bw - off;
          const top = v - bh;
          box(col, bx, top, ww, bh);
          if (h > 0.8) {
            // A church: drum and cone
            box(col, bx + ww * 0.3, top - T * 0.45, ww * 0.4, T * 0.46);
            shape(col, [bx + ww * 0.24, top - T * 0.45, bx + ww / 2, top - T * 1.2, bx + ww * 0.76, top - T * 0.45]);
          }
          box(`rgba(255,205,160,${rim})`, bx + ww - T * 0.07, top, T * 0.07, bh);
          const ws = T * (0.07 + li * 0.05);
          for (let a = 0; top + T * (0.35 + a * 0.5) < v - T * 0.3; a++)
            for (let b = 0; bx + T * (0.18 + b * 0.36) < bx + ww - T * 0.2; b++)
              if (hash(i * 31 + a * 7 + b * 13 + seed) > 0.6)
                box(li ? "#ffd98a" : "rgba(255,236,170,0.9)", bx + T * (0.18 + b * 0.36), top + T * (0.35 + a * 0.5), ws, ws * 1.4);
        }
        if (li < 2) box(haze, 0, v * 0.45, w, v * 0.55);
      });
    };

    const drawDoor = (px: number, py: number) => {
      const s = T;
      const open = state === "win" || (state === "end" && lives > 0) ? clamp(stateT * 3, 0, 1) : 0;
      box("#b9725a", px - s * 0.8, py - s * 2.35, s * 1.6, s * 2.35);
      box(RIM, px + s * 0.7, py - s * 2.35, s * 0.1, s * 2.35);
      box(SHADE, px - s * 0.8, py - s * 2.35, s * 0.14, s * 2.35);
      // Warm light from inside, brighter as the door opens
      const gl = ctx.createRadialGradient(px, py - s * 0.9, 0, px, py - s * 0.9, s * (1.6 + open * 1.2));
      gl.addColorStop(0, `rgba(255,214,140,${0.35 + open * 0.4})`);
      gl.addColorStop(1, "rgba(255,200,120,0)");
      box(gl, px - s * 3, py - s * 4, s * 6, s * 4);
      ctx.fillStyle = "#ffd88e";
      roundRect(ctx, px - s * 0.45, py - s * 1.8, s * 0.9, s * 1.8, s * 0.4);
      ctx.fill();
      const dw = s * 0.9 * (1 - open * 0.8);
      ctx.fillStyle = C.tarragon;
      roundRect(ctx, px - s * 0.45, py - s * 1.8, dw, s * 1.8, Math.min(s * 0.4, dw / 2));
      ctx.fill();
      if (open < 0.4) {
        box("#ffe2a8", px - s * 0.3, py - s * 1.45, s * 0.6, s * 0.5);
        box(C.tarragon, px - s * 0.02, py - s * 1.45, s * 0.04, s * 0.5);
        oval(GOLD, px + s * 0.28, py - s * 0.8, s * 0.06);
      }
      // Striped apricot awning with scalloped edge
      for (let i = 0; i < 6; i++) {
        const ax = px - s * 0.9 + i * s * 0.3;
        const col = i % 2 ? C.matsoni : C.apricot;
        box(col, ax, py - s * 2.25, s * 0.3, s * 0.3);
        oval(col, ax + s * 0.15, py - s * 1.95, s * 0.15);
      }
      box("rgba(70,40,100,0.18)", px - s * 0.9, py - s * 1.85, s * 1.8, s * 0.08);
      // Cup sign with steam (a lot more of it when the cat arrives)
      ctx.fillStyle = C.matsoni;
      roundRect(ctx, px - s * 0.45, py - s * 3.05, s * 0.9, s * 0.7, s * 0.15);
      ctx.fill();
      box(C.apricotDeep, px - s * 0.2, py - s * 2.85, s * 0.32, s * 0.3);
      lines(C.apricotDeep, 3, [px + s * 0.12, py - s * 2.8, px + s * 0.22, py - s * 2.7]);
      box(C.apricotDeep, px - s * 0.28, py - s * 2.53, s * 0.48, s * 0.04);
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const tall = 0.3 + open * 0.5;
      for (const dx of open ? [-0.16, -0.03, 0.1] : [-0.1, 0.03]) {
        const wv = calm ? 0 : Math.sin(time * (4 + open * 4) + dx * 20) * s * 0.06;
        ctx.moveTo(px + dx * s, py - s * 3.1);
        ctx.quadraticCurveTo(px + dx * s + s * 0.1 + wv, py - s * (3.1 + tall / 2), px + dx * s - wv, py - s * (3.1 + tall));
      }
      ctx.stroke();
    };

    // Checkpoint: a chimney stub with a flag; once reached the flag runs up
    // and the chimney starts smoking.
    const drawCheck = (k: { t: number }, px: number, py: number) => {
      const s = T;
      const on = k.t >= 0;
      const since = time - k.t;
      if (on) {
        for (let i = 0; i < 4; i++) {
          if (since < i * 0.4) continue;
          const p = (since * 0.45 + i / 4) % 1;
          oval(`rgba(150,132,150,${0.55 * (1 - p)})`, px - s * 0.05 + Math.sin(p * 5 + i) * s * 0.12 + p * s * 0.4, py - s * (0.95 + p * 1.7), s * (0.12 + p * 0.24));
        }
      }
      box("#b56f55", px - s * 0.28, py - s * 0.78, s * 0.56, s * 0.78);
      box(RIM, px + s * 0.18, py - s * 0.78, s * 0.1, s * 0.78);
      box("#8f5038", px - s * 0.34, py - s * 0.9, s * 0.68, s * 0.16);
      box("#4b4250", px + s * 0.24, py - s * 1.9, 2, s * 1.05);
      const up = on ? Math.min(1, since * 3) : 0;
      const fy = py - s * (1.1 + up * 0.75);
      const wv = calm ? 0 : Math.sin(time * 6) * s * 0.05;
      shape(on ? C.apricot : "#9a8f95", [px + s * 0.24 + 2, fy, px + s * (0.72 - (1 - up) * 0.2), fy + s * 0.13 + wv, px + s * 0.24 + 2, fy + s * 0.28]);
    };

    const groundBelow = (gx: number, gy: number) => {
      const c = Math.floor(gx);
      for (let r = Math.max(0, Math.floor(gy)); r < ROWS; r++) if (solid(c, r) || oneWay(c, r)) return r;
      return -1;
    };

    const draw = () => {
      const s = fit.size();
      ctx.save();
      if (shake > 0) ctx.translate(rand(-1, 1) * shake * 10, rand(-1, 1) * shake * 10);
      ctx.beginPath();
      ctx.rect(0, 0, s.w, viewH);
      ctx.clip();
      drawBackground(s.w);
      const ox = -camX * T;
      const oy = viewH - ROWS * T;
      // Cool dusk down in the streets, so gaps read as drops
      const haze = ctx.createLinearGradient(0, oy + T * 7.3, 0, viewH);
      haze.addColorStop(0, "rgba(60,35,75,0)");
      haze.addColorStop(1, "rgba(60,35,75,0.65)");
      box(haze, 0, oy + T * 7.3, s.w, T * 2.7);
      for (let r = 0; r < ROWS; r++) {
        for (let c = Math.max(0, Math.floor(camX) - 1); c <= Math.min(W - 1, camX + s.w / T + 1); c++) {
          const ch = at(c, r);
          if (ch !== " ") drawTile(ch, c, r, ox + c * T, oy + r * T);
        }
      }
      for (const k of checks) drawCheck(k, ox + k.x * T, oy + k.y * T);
      drawDoor(ox + door.x * T, oy + door.y * T);
      // Soft contact shadows: they shrink as the cat rises
      if (state === "play" || state === "win") {
        const gr = groundBelow(x, y - 0.01);
        if (gr >= 0) {
          const k = clamp(1 - (gr - y) * 0.2, 0.25, 1);
          ctx.globalAlpha = 0.3 * k;
          oval("#3c1e32", ox + x * T, oy + gr * T, T * 0.36 * k, T * 0.08);
        }
      }
      ctx.globalAlpha = 0.25;
      for (const f of foes) if (!f.dead && !f.fly) oval("#3c1e32", ox + f.x * T, oy + f.y * T, T * 0.24, T * 0.06);
      ctx.globalAlpha = 1;
      for (const it of items) if (!it.got) drawFruit(it.gold, ox + it.x * T, oy + it.y * T + (calm ? 0 : Math.sin(time * 3 + it.x) * T * 0.06), T * 0.22);
      for (const f of foes) if (!f.dead || f.dt < 0.3) drawPigeon(f, ox + f.x * T, oy + f.y * T);
      if (state === "play") drawCat(ox + x * T, oy + y * T);
      else if (state === "win") drawCat(ox + x * T, oy + y * T, 0, 1 - clamp((stateT - 0.25) * 3, 0, 1));
      else if (hitDeath && stateT < 0.9) {
        // Knocked off: a little tumble up and down, fading
        const t = stateT;
        drawCat(ox + deadX * T, oy + (deadY - 4 * t + 9 * t * t) * T, (calm ? 0.5 : t * 9) * -face, 1 - t);
      }
      for (const p of sparks) {
        const a = 1 - p.life / p.max;
        const px = ox + p.x * T;
        const py = oy + p.y * T;
        ctx.globalAlpha = p.k === 5 ? Math.min(1, a * 3) : a;
        if (p.k === 2) {
          const sz = T * (p.txt!.length > 3 ? 0.6 : 0.45) * (1 + 0.5 * Math.max(0, 1 - p.life * 6));
          label(ctx, p.txt!, px + 1.5, py + 2, sz, "rgba(90,35,30,0.8)");
          label(ctx, p.txt!, px, py, sz, p.col);
        } else if (p.k === 3) oval(p.col, px, py, T * 0.08 * (1 + p.life * 3));
        else if (p.k === 4) star(p.col, px, py, T * 0.18 * a + 1);
        else if (p.k === 5) {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(p.rot + (calm ? 0 : p.life * 7));
          ctx.scale(calm ? 1 : Math.cos(p.life * 11 + p.rot), 1);
          box(p.col, -T * 0.08, -T * 0.04, T * 0.16, T * 0.08);
          ctx.restore();
        } else if (p.k === 1) oval(p.col, px, py, T * 0.12, T * 0.045, p.rot + Math.sin(p.life * 6) * 0.8);
        else oval(p.col, px, py, T * 0.06);
      }
      ctx.globalAlpha = 1;
      // Fades between levels, the level number as one opens, the game-over dim
      let fade = Math.max(0, 1 - levelT * 3);
      if (state === "win") fade = level + 1 < LEVELS.length ? clamp((stateT - 1.4) * 2.5, 0, 1) : 0;
      if (fade > 0) {
        ctx.globalAlpha = fade;
        box("#f7c8a0", 0, 0, s.w, viewH);
        ctx.globalAlpha = 1;
      }
      if (state === "play" && levelT < 1.5) {
        ctx.globalAlpha = Math.min(1, levelT * 5, (1.5 - levelT) * 3);
        const bx = s.w / 2;
        const by = viewH * 0.3;
        ctx.fillStyle = "rgba(255,248,236,0.88)";
        roundRect(ctx, bx - T * 1.5, by - T * 0.8, T * 3, T * 1.6, T * 0.8);
        ctx.fill();
        label(ctx, `${level + 1}/${LEVELS.length}`, bx, by - T * 0.12, T * 0.75, C.ink);
        for (let i = 0; i < LEVELS.length; i++) oval(i <= level ? C.apricot : C.line, bx + (i - 1) * T * 0.4, by + T * 0.48, T * 0.09);
        ctx.globalAlpha = 1;
      }
      if (state === "end" && lives <= 0) box(`rgba(19,36,27,${Math.min(0.45, stateT * 0.5)})`, 0, 0, s.w, viewH);
      ctx.restore();

      // HUD on a soft pill: lives, apricots, level, score
      const hs = clamp(T * 0.36, 10, 16);
      const hy = 12 + hs * 1.2;
      ctx.fillStyle = "rgba(255,246,236,0.55)";
      roundRect(ctx, 6, hy - hs * 1.25, s.w - 12, hs * 2.5, hs * 1.25);
      ctx.fill();
      for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = i < lives ? 1 : 0.25;
        catHead(14 + hs + i * hs * 2.3, hy + hs * 0.1, hs);
      }
      ctx.globalAlpha = 1;
      const fx = 14 + hs * 8;
      drawFruit(false, fx, hy + hs * 0.1, hs * 0.6);
      label(ctx, String(fruit), fx + hs * 1.1, hy, hs * 1.4, C.ink, "left");
      label(ctx, `${level + 1}/${LEVELS.length}`, s.w / 2 + hs * 2, hy, hs * 1.3, C.ink);
      label(ctx, String(score), s.w - 16, hy, hs * 1.4, C.ink, "right");

      // Pad area: the tufa wall below the roofline
      const pg = ctx.createLinearGradient(0, viewH, 0, s.h);
      pg.addColorStop(0, "#a5654c");
      pg.addColorStop(1, "#6a3d36");
      box(pg, 0, viewH, s.w, s.h - viewH);
      const bh = T * 0.8;
      for (let yy = viewH + 8, i = 0; yy < s.h; yy += bh, i++) {
        const seg = [0, yy, s.w, yy];
        for (let xx = (i % 2) * T * 0.8; xx < s.w; xx += T * 1.6) seg.push(xx, yy, xx, yy + bh);
        lines("rgba(50,25,30,0.18)", 1, seg);
      }
      box("#eeaa86", 0, viewH, s.w, 4);
      box("rgba(40,20,30,0.35)", 0, viewH + 4, s.w, 5);
      pad.draw(ctx, s);
      // Icons as shapes, with rounded corners
      ctx.lineJoin = "round";
      for (const b of padL) {
        const r = b.r * 0.4;
        const d = b.id === "left" ? -1 : 1;
        ctx.globalAlpha = pad.state[b.id] ? 1 : 0.88;
        ctx.fillStyle = ctx.strokeStyle = C.matsoni;
        ctx.lineWidth = r * 0.3;
        path(b.id === "a" ? [0, -1, 0.95, 0.05, 0.38, 0.05, 0.38, 0.85, -0.38, 0.85, -0.38, 0.05, -0.95, 0.05] : [d * 0.85, 0, -d * 0.6, -0.85, -d * 0.6, 0.85], b.x + (b.id === "a" ? 0 : -d * r * 0.1), b.y, r);
        ctx.fill();
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    const stopLoop = loop(api, (dt, paused) => {
      if (!paused && !reported) {
        time += dt;
        stateT += dt;
        shake = Math.max(0, shake - dt);
        sqv += (-sq * 320 - sqv * 16) * dt;
        sq += sqv * dt;
        if (state === "play") {
          levelT += dt;
          hurtT -= dt;
          // Two substeps keep fast falls from skipping a tile
          updateCat(dt / 2);
          if (state === "play") updateCat(dt / 2);
          // Little dust kicks while running
          dustT += ground && Math.abs(vx) > 4.5 ? dt : 0;
          if (dustT > (calm ? 0.3 : 0.12)) {
            dustT = 0;
            emit(3, x - face * 0.25, y - 0.05, -face * rand(0.3, 1), -rand(0.2, 0.6), 0.35, "#f8e6d2");
          }
        } else {
          pad.consume("a");
          pad.consume("up");
        }
        if (state === "dead" && stateT > RESPAWN) respawn();
        if (state === "win") {
          x += (door.x - x) * Math.min(1, dt * 5);
          if (!calm && Math.random() < 0.4) emit(5, door.x + rand(-1.5, 1.5), door.y - rand(3.2, 4.5), rand(-1, 1), rand(-1, 0), 1.6, pick(CONFETTI));
          if (stateT > 1.9) {
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
        // Camera: look ahead of the cat (eased, so turning doesn't snap);
        // back to the checkpoint during a retry; gentler with reduced motion
        const view = fit.size().w / T;
        look += ((calm ? 0.8 : 1.8) * face - look) * Math.min(1, dt * 2.5);
        const fx = state === "dead" && stateT > 0.1 ? cp.x : x;
        const target = clamp(fx + look - view * 0.4, 0, Math.max(0, W - view));
        camX += (target - camX) * Math.min(1, dt * (calm ? 3 : state === "dead" ? 9 : 5));
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
