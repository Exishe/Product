// "Café Cat": the café's cheeky ginger cat sneaks through the kitchen, the
// pantry and the closed café hall to steal the chef's plate of fish. It hops
// over counters, stoves, crates and tables, snacks on fish and sausages,
// flattens mice, swats flies, dodges hot burners and the chef's broom. Three
// short hand-made levels. No words on the canvas.
//
// Art direction (docs/games/reference/art-direction.md)
// - Mood: a cartoon caper; a smug cat on a fish heist through a cosy
//   Yerevan café after hours. Mischief, not danger.
// - Camera and scale: side view, 2.5D in layers: the back wall with windows
//   (Ararat in them) and lamps at half parallax, then the furniture you play
//   on. 10 tile rows fill the top 65% of the screen; figures and furniture are
//   drawn in tile units, so everything scales with the tile, no pixel grid.
// - Shapes: the cat round and soft (ovals, a curved tail); the mouse a low
//   pear with a long tail, the fly a dot with glassy wings, the chef a tall
//   white pear under a toque with a broom out in front: three silhouettes
//   that never mix. The world is blocky furniture: counters, stoves, crates,
//   sacks, barrels, tables, racks and chandeliers.
// - Values: the cat (ginger with a dark outline) and the chef's white coat are
//   the strongest contrasts; flames are the brightest hot spots; the back wall
//   stays in a narrow, soft range per level (cream kitchen, brown cellar, deep
//   blue hall at night).
// - Palette: cat ginger #e8873a (player); mouse grey, fly black, chef white
//   with a broom of straw (threats); burners orange-yellow when lit, blue when
//   low (hazard timing); wood, steel and tufa for furniture (ground); silver
//   fish, red sausages, gold plates (reward). Warm lamp light from above,
//   cool shade underneath.
// - Detail: the cat's face (smug grin, wide eyes when hurt, happy squint and
//   tail up when winning), the chef's moustache, the fish; walls stay plain.
// - Rules: one vector style; dark outline on characters only, never on the
//   world; flat fills, one warm key light from the lamps, cool shade below.
// - Signature: Ararat in every window, and pans that swing and clang when the
//   cat lands on the pot rack.
import { C, clamp, createPad, fitCanvas, label, loop, pick, rand, roundRect, type Game, type PadButton, type Size } from "./engine";

// Tile maps, 9 rows each; the floor row is repeated as a tenth (falling
// below it costs a life).
// Solid: # floor, C counter, O stove, X crate, S flour sack, B barrel, = bar.
// One-way (jump up through): - shelf, ~ pot rack, t table, Y chandelier.
// Hazards: ^ burner (on a stove), _ soapy puddle. Decor: h chair.
// Things: P start, o fish or sausage, G fish on a plate, m mouse, f fly,
// c chef, K checkpoint (a milk saucer), D the chef's plate of fish.
const LEVELS: string[][] = [
  [
    "",
    "",
    "",
    "            oo   ooo       ooo        o o o G       oo  oo                          G",
    "                 ---      ~~~~~      --------                       f             ~~~~~",
    "          oo^^                                      ^^  ^^                      oo",
    "          CCOOCC       CC         CC          CC  CCOOCCOOCC            ooo     CC",
    "  P  ooo  CCOOCC    m  CC       K CC    c     CC  CCOOCCOOCC  K  __    m        CC      m    D",
    "###########################   ##############################################  ####################",
  ],
  [
    "",
    "",
    "                                                                ooo",
    "                     oooo                                       ---",
    "             oo      ----        ooo       G                 XX             oooo    f",
    "           ooXX                           ---                XX   f         ----        oo",
    "           SSXX   BB           BB   XX                     BBXX         XX              BB",
    "  P  ooo SSSSXX   BB      m  K BB   XX   m   S   m __   K  BBXX         XXS     m       BB     D",
    "###############   ###############   ###########################     ################################",
  ],
  [
    "",
    "",
    "                                     G",
    "            ooo                  ooo   ooo                            ooo",
    "            YYY                  YYY   YYY                            YYY     f",
    "        oho         h                         oooo                h         G            oo",
    "        ttt        ttt        ==              ====               ttt       ttt           ==",
    "  P oooh   h    m h   h     K ==      c       ====  __ m      K h   h     h   h  ooom    ==    D",
    "########################  ################################  ########################################",
  ],
];

const ROWS = 10;
// Physics in tiles and seconds. A full jump rises 3.3 tiles; falling pulls
// 1.25x harder than rising, so a full-run jump clears about 4.6 tiles of
// flat gap. The maps never ask for more than a 3-tile gap or a 2-tile step.
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
const LIVES = 5;
const TAU = Math.PI * 2;

// k: 0 mouse, 1 fly, 2 chef. dt: time since stomped (chef: since his hat was).
type Foe = { x: number; y: number; vx: number; k: number; bx: number; by: number; t: number; dead: boolean; dt: number };
type Item = { x: number; y: number; gold: boolean; sau: boolean; got: boolean };
// k: 0 debris, 1 heart, 2 score pop, 3 dust and steam, 4 sparkle, 5 confetti
type Spark = { x: number; y: number; vx: number; vy: number; life: number; max: number; col: string; k: number; rot: number; txt?: string };

const ORANGE = "#e8873a";
const ORANGE_DARK = "#b85f1e";
const GOLD = "#ffd23f";
const FRIED = "#f0a23a";
const CONFETTI = [C.apricot, C.pomegranate, C.tarragonLight, GOLD, "#6b8fd6", C.matsoni];
// Per level: wall top, wall bottom, wainscot, floor tones A and B, floor body,
// sky top and bottom (in the windows), window frame
const THEME = [
  ["#f8ecd6", "#ecd5b4", "#3f7a62", "#efe7d8", "#3c3b44", "#4e4040", "#f19a7a", "#ffd9a0", "#fdf7ee"],
  ["#6c4b3d", "#4b332b", "#3a2620", "#9a8673", "#857161", "#43342e", "#26315c", "#55639a", "#2b1d18"],
  ["#2f385c", "#222946", "#5b3626", "#a8703f", "#8c5a30", "#40261a", "#141c44", "#34457e", "#6b4630"],
] as const;

// Stable pseudo-random 0..1 per number (jars, pans, chairs).
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
    const oval = (col: string | CanvasGradient, x: number, y: number, rx: number, ry = rx, rot = 0) => {
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
    // Draw in tile units: origin at (px, py), one unit = k pixels
    const put = (px: number, py: number, k: number, fn: () => void) => {
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(k, k);
      fn();
      ctx.restore();
    };
    const glow = (x: number, y: number, r: number, col: string) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col);
      g.addColorStop(1, "rgba(255,200,120,0)");
      box(g, x - r, y - r, r * 2, r * 2);
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
    let lives = LIVES;
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
    let deadV = 0;
    let joyT = 0; // a happy squint after a stomp or a gold plate
    let slick = false; // on soap
    let rackT = -9; // when the cat last landed on a rack or chandelier

    // Level state
    let map: string[] = [];
    let W = 0;
    let foes: Foe[] = [];
    let items: Item[] = [];
    let burners: [number, number][] = [];
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
    const solid = (c: number, r: number) => "#COXSB=".includes(at(c, r));
    const oneWay = (c: number, r: number) => "-~tY".includes(at(c, r));
    // Burner flame height in tiles: lit, then low and blue, then a short
    // warning flicker as it climbs again. Each stove keeps its own beat.
    const flame = (c: number) => {
      const p = (time / 3 + hash(c >> 1)) % 1;
      return p < 0.45 ? 0.8 : p < 0.85 ? 0.2 : 0.2 + (p - 0.85) * 4;
    };

    const many = (n: number) => Math.max(1, Math.round(calm ? n * 0.35 : n));
    const emit = (k: number, px: number, py: number, pvx: number, pvy: number, max: number, col: string, txt?: string) =>
      sparks.push({ x: px, y: py, vx: pvx, vy: pvy, life: 0, max, col, k, rot: rand(0, TAU), txt });
    const burst = (px: number, py: number, n: number, col: string, k = 0, speed = 4) => {
      for (let i = many(n); i--; ) {
        const a = rand(0, TAU);
        const v = rand(speed * 0.3, speed);
        emit(k, px, py, Math.cos(a) * v, Math.sin(a) * v - (k === 5 ? 4 : k === 0 ? 1 : 0), rand(0.4, 0.8) * (k === 5 ? 2.5 : 1), col);
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
      const rows = [...LEVELS[n]!, LEVELS[n]![8]!];
      W = Math.max(...rows.map((r) => r.length));
      foes = [];
      items = [];
      checks = [];
      sparks = [];
      burners = [];
      map = rows.map((row, r) =>
        [...row.padEnd(W)]
          .map((ch, c) => {
            const cx = c + 0.5;
            const k = "mfc".indexOf(ch);
            if (ch === "P") cp = { x: cx, y: r + 1 };
            else if (ch === "o" || ch === "G") items.push({ x: cx, y: r + 0.5, gold: ch === "G", sau: hash(c * 1.7 + r) > 0.62, got: false });
            else if (k >= 0) foes.push({ x: cx, y: r + 1, vx: k ? -1.1 : -1.6, k, bx: cx, by: r + 0.6, t: rand(0, 6), dead: false, dt: 9 });
            else if (ch === "K") checks.push({ x: cx, y: r + 1, t: -1 });
            else if (ch === "D") door = { x: cx, y: r + 1 };
            else {
              if (ch === "^") burners.push([c, r]);
              return ch;
            }
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
    // last checkpoint about half a second later. why: 0 fell, 1 bitten or
    // stung, 2 burnt, 3 swept by the broom (dir: which way it flies).
    const loseLife = (why: number, dir = 0) => {
      lives--;
      hitDeath = why > 0;
      deadX = x;
      deadY = y;
      deadV = dir * 5;
      stateT = 0;
      api.sfx(why ? (why > 2 ? "whoosh" : "hit") : "bad");
      if (why === 2) api.sfx("ouch", 1.4);
      else api.sfx(why ? "meow" : "whoa", why ? 1.25 : 1.4);
      if (why) {
        if (!calm) shake = 0.25;
        burst(x, y - 0.4, 8, why === 2 ? "#6a6a72" : "#fff", why === 2 ? 3 : 4, 3);
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
      // Soap: hardly any grip, so the cat skates on
      const soap = ground && at(Math.floor(x), Math.floor(y - 0.01)) === "_";
      if (soap && !slick) {
        api.sfx("slip");
        api.sfx("whoa", 1.5);
      }
      slick = soap;
      if (dir) {
        face = dir;
        // Turning around bites harder than speeding up
        vx += dir * (ground ? ACC : AIR) * dt * (Math.sign(vx) === -dir ? 1.8 : 1) * (soap ? 0.3 : 1);
      } else if (ground) {
        vx -= Math.sign(vx) * Math.min(Math.abs(vx), (soap ? 2 : FRICTION) * dt);
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
          // Landing: a squash always, a thud and a dust puff when it was hard;
          // the pans on a rack swing and clang
          squash(-clamp(fallV / 55, 0.08, 0.36));
          if ("~Y".includes(at(Math.floor(x), y))) {
            rackT = time;
            api.sfx("block");
          }
          if (fallV > HARD) {
            api.sfx("land");
            dust(x - 0.2, y, 4, 2.6);
            dust(x + 0.2, y, 4, 2.6);
          }
        }
      }
      runT += Math.abs(vx) * dt;
      if (y > ROWS + 1.5) loseLife(0);
      // Burners: only a lit one bites, and only near the stove top
      for (let c = Math.floor(x - HW + 0.1); c <= Math.floor(x + HW - 0.1); c++)
        for (const r of [Math.floor(y - 0.05), Math.floor(y - CH)])
          if (state === "play" && hurtT <= 0 && at(c, r) === "^" && flame(c) > 0.45 && y > r + 0.4) loseLife(2);
    };

    const updateWorld = (dt: number) => {
      for (const f of foes) {
        f.t += dt;
        f.dt += dt;
        if (f.dead) {
          // A fly drops; a flat mouse pops back up after a beat and runs off
          if (f.k) f.y += dt * 5;
          else if (f.dt > 0.5) {
            if (f.dt - dt <= 0.5) {
              api.sfx("pop");
              f.vx = f.x < x ? -5 : 5;
            }
            f.x += f.vx * dt;
          }
          continue;
        }
        if (f.k === 1) {
          // Buzzes back and forth in loops
          f.x = f.bx + Math.sin(f.t * 0.9) * 2.2;
          f.vx = Math.cos(f.t * 0.9);
          f.y = f.by + Math.sin(f.t * 2.6) * 0.8 + Math.sin(f.t * 9) * 0.08 + 0.3;
        } else {
          // Walk; turn at walls and at edges
          const nx = f.x + f.vx * dt;
          const ahead = Math.floor(nx + Math.sign(f.vx) * (f.k ? 0.5 : 0.35));
          const row = Math.floor(f.y - 0.5);
          if (solid(ahead, row) || !(solid(ahead, row + 1) || oneWay(ahead, row + 1))) f.vx = -f.vx;
          else f.x = nx;
        }
        if (state !== "play") continue;
        const dx = Math.abs(f.x - x);
        const chef = f.k > 1;
        const top = f.y - (chef ? 2.05 : f.k ? 0.55 : 0.42);
        if (vy > 0 && dx < 0.7 && y > top - 0.35 && y < top + 0.35) {
          // Stomped from above (a generous box). The chef can't be beaten:
          // his hat squashes and bounces the cat high.
          vy = pad.state.a || pad.state.up ? -JUMP * (chef ? 1.05 : 0.85) : chef ? -15 : -11;
          squash(0.3);
          api.sfx("boing");
          if (chef) {
            f.dt = 0;
            api.sfx("hah", 0.75);
          } else {
            f.dead = true;
            f.dt = 0;
            joyT = 0.5;
            api.sfx(f.k ? "splat" : "oof", f.k ? 1 : 1.8);
            burst(f.x, f.y - 0.3, 8, f.k ? "#3a3a44" : GOLD, f.k ? 0 : 4, 3);
            addScore(50, f.x, f.y - 1);
          }
        } else if (hurtT <= 0) {
          // Fair hurtbox: only the cat's body against the foe's body, plus the
          // chef's broom out in front of him
          const bx = f.x + Math.sign(f.vx) * (0.95 + Math.sin(f.t * 6) * 0.12);
          if (dx < (chef ? 0.5 : 0.42) && y - CH + 0.2 < f.y - 0.1 && y - 0.05 > top + 0.12) loseLife(1);
          else if (chef && Math.abs(bx - x) < 0.5 && y > f.y - 0.5) loseLife(3, Math.sign(f.vx));
        }
      }
      for (const it of items) {
        if (!it.got && Math.abs(it.x - x) < 0.6 && Math.abs(it.y - y + CH / 2) < 0.75) {
          it.got = true;
          fruit++;
          api.sfx("coin");
          if (it.gold) {
            api.sfx("mmm", 1.3);
            joyT = 0.6;
          }
          addScore(it.gold ? 100 : 10, it.x, it.y - 0.5);
          burst(it.x, it.y, it.gold ? 12 : 6, it.gold ? GOLD : "#fff4c8", 4, 3);
        }
      }
      for (const k of checks) {
        if (k.t < 0 && state === "play" && Math.abs(k.x - x) < 0.8 && Math.abs(k.y - y) < 1.5) {
          k.t = time;
          cp = { x: k.x, y: k.y };
          api.sfx("mmm", 1.2);
        }
        // Hearts float up from the saucer for a while once it's reached
        if (k.t >= 0 && time - k.t < 1.6 && Math.random() < (calm ? 0.04 : 0.12)) emit(1, k.x + rand(-0.3, 0.3), k.y - 0.4, rand(-0.3, 0.3), -1.4, 1, C.pomegranate);
      }
      // Lit burners send up a puff of steam now and then
      for (const [c, r] of burners) if (!calm && flame(c) > 0.45 && Math.random() < 0.03) emit(3, c + rand(0.3, 0.7), r + 0.2, rand(-0.2, 0.2), -1.6, 0.9, "rgba(255,255,255,0.55)");
      if (state === "play" && Math.abs(door.x - x) < 1.1 && y > door.y - 2 && y <= door.y + 0.1) {
        state = "win";
        stateT = 0;
        vx = 0;
        face = 1;
        api.sfx("win");
        api.sfx("meow", 1.45);
        burst(door.x, door.y - 1.6, 40, C.apricot, 5, 6);
        for (const p of sparks) if (p.k === 5) p.col = pick(CONFETTI);
        addScore(500 + Math.max(0, Math.round(90 - levelT)) * 5, door.x, door.y - 2.6);
      }
      for (const p of sparks) {
        p.life += dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const drag = [0, 1, 3, 4, 5, 1.5][p.k]! * dt;
        p.vx *= 1 - drag;
        p.vy = p.vy * (1 - (p.k === 2 ? drag : 0)) + [8, 0, 0, 0, 0, 5][p.k]! * dt;
        if (p.k === 3 || p.k === 4) p.vy *= 1 - drag;
      }
      sparks = sparks.filter((p) => p.life < p.max);
    };

    // --- Drawing (figures and tiles in tile units) --------------------------

    // mood: 0 smug, 1 alarmed, 2 delighted
    const catHead = (cx: number, cy: number, s: number, mood: number) => {
      shape(ORANGE, [cx - s * 0.9, cy - s * 0.2, cx - s * 0.7, cy - s * 1.15, cx - s * 0.15, cy - s * 0.7, cx + s * 0.15, cy - s * 0.7, cx + s * 0.7, cy - s * 1.15, cx + s * 0.9, cy - s * 0.2]);
      oval(ORANGE, cx, cy, s * 0.85);
      shape("#f6b9a0", [cx - s * 0.62, cy - s * 0.55, cx - s * 0.62, cy - s * 0.95, cx - s * 0.3, cy - s * 0.68]);
      shape("#f6b9a0", [cx + s * 0.62, cy - s * 0.55, cx + s * 0.62, cy - s * 0.95, cx + s * 0.3, cy - s * 0.68]);
      oval("#fbe3cc", cx, cy + s * 0.35, s * 0.42, s * 0.3);
      if (mood === 2) {
        // Happy squint and a wide open grin
        lines(C.ink, s * 0.1, [-1, 1].flatMap((d) => [cx + d * s * 0.45, cy, cx + d * s * 0.33, cy - s * 0.15, cx + d * s * 0.33, cy - s * 0.15, cx + d * s * 0.21, cy]));
        oval("#8a1c2e", cx, cy + s * 0.36, s * 0.2, s * 0.16);
        oval("#f07a8a", cx, cy + s * 0.44, s * 0.11, s * 0.07);
      } else if (mood) {
        // Saucer eyes, tiny pupils, an "O" of a mouth
        for (const d of [-1, 1]) {
          oval("#fff", cx + d * s * 0.33, cy - s * 0.1, s * 0.2, s * 0.25);
          oval(C.ink, cx + d * s * 0.3, cy - s * 0.08, s * 0.07);
        }
        oval(C.ink, cx, cy + s * 0.4, s * 0.09, s * 0.12);
      } else {
        // Half-lidded and smug, with a lopsided grin
        oval(C.ink, cx - s * 0.33, cy - s * 0.06, s * 0.13, s * 0.15);
        oval(C.ink, cx + s * 0.33, cy - s * 0.06, s * 0.13, s * 0.15);
        box(ORANGE, cx - s * 0.5, cy - s * 0.24, s, s * 0.15);
        lines(ORANGE_DARK, s * 0.06, [cx - s * 0.5, cy - s * 0.1, cx - s * 0.18, cy - s * 0.1, cx + s * 0.18, cy - s * 0.1, cx + s * 0.5, cy - s * 0.1]);
        lines(C.ink, s * 0.07, [cx - s * 0.14, cy + s * 0.36, cx + s * 0.06, cy + s * 0.42, cx + s * 0.06, cy + s * 0.42, cx + s * 0.32, cy + s * 0.26]);
      }
      oval("#e0707a", cx, cy + s * 0.2, s * 0.12, s * 0.08);
    };

    // A fish facing right, centred on (0, 0)
    const fish = (col: string, r: number) => {
      shape(col, [-r * 0.8, 0, -r * 1.55, -r * 0.62, -r * 1.35, 0, -r * 1.55, r * 0.62]);
      oval(col, 0, 0, r, r * 0.56);
      oval("rgba(255,255,255,0.4)", -r * 0.15, -r * 0.22, r * 0.55, r * 0.14);
      oval("#fff", r * 0.55, -r * 0.12, r * 0.17);
      oval(C.ink, r * 0.6, -r * 0.12, r * 0.08);
    };
    const plate = (r: number) => {
      oval("#c9d2c8", 0, r * 0.5, r * 1.6, r * 0.42);
      oval(C.matsoni, 0, r * 0.45, r * 1.35, r * 0.3);
    };

    const catBody = (air: boolean, b: number, step: number, running: boolean, mood: number) => {
      // Tail sways; it points up in the air and stands straight up for joy
      const sway = calm ? 0 : Math.sin(time * (running ? 9 : 3)) * 0.25;
      ctx.strokeStyle = over ?? ORANGE;
      ctx.lineWidth = 0.11;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-0.28, -0.38 + b);
      if (mood === 2) ctx.bezierCurveTo(-0.45, -0.6, -0.3, -0.9, -0.42 + sway * 0.2, -1.1);
      else ctx.quadraticCurveTo(-0.62, air ? -0.6 : -0.35, -0.55 - sway * 0.3, -(air ? 0.95 : 0.75 + sway));
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
      for (let i = 0; i < 8; i += 2) seg.push(legs[i]! * 0.7, -0.3 + b, legs[i]!, legs[i + 1]! - 0.04);
      lines(ORANGE_DARK, 0.1, seg);
      // Body with stripes, a pale belly and a warm rim from the lamps
      oval(ORANGE, 0, -0.36 + b, 0.36, 0.2);
      oval("#ffb070", 0.06, -0.47 + b, 0.26, 0.07);
      lines(ORANGE_DARK, 0.04, [-0.14, 0, 0.14].flatMap((sx) => [sx, -0.54 + b, sx - 0.03, -0.42 + b]));
      oval("#fbe3cc", 0.12, -0.27 + b, 0.15, 0.08);
      const hx = 0.3;
      const hy = (air ? -0.63 : -0.6) + b;
      catHead(hx, hy, 0.22, mood);
      if (!over) lines("rgba(19,36,27,0.5)", 1 / T, [hx + 0.1, hy + 0.07, hx + 0.32, hy + 0.03, hx + 0.1, hy + 0.1, hx + 0.32, hy + 0.13]);
      // The prize, held in the mouth
      if (state === "win") {
        ctx.save();
        ctx.translate(hx + 0.12, hy + 0.12);
        ctx.rotate(0.25);
        fish(FRIED, 0.14);
        ctx.restore();
      }
    };

    const drawCat = (px: number, py: number, mood: number, rot = 0, alpha = 1) => {
      const blink = hurtT > 0 && state === "play";
      if (alpha <= 0 || (blink && !calm && Math.floor(hurtT * 12) % 2 === 0)) return;
      const air = !ground;
      const running = ground && Math.abs(vx) > 0.5;
      const step = running ? Math.floor(runT * 2.2) % 3 : 3;
      ctx.save();
      ctx.globalAlpha = alpha * (blink ? 0.6 : 1);
      ctx.translate(px, py);
      if (rot) {
        ctx.translate(0, -T * 0.4);
        ctx.rotate(rot);
        ctx.translate(0, T * 0.4);
      }
      // Squash and stretch about the feet
      ctx.scale(T * face * (1 - sq * 0.6), T * (1 + sq));
      outlined("#4a2418", 0.035, () => catBody(air, step === 1 ? -0.04 : 0, step, running, mood));
      ctx.restore();
    };

    // Mouse: a low grey pear on pink feet, long tail; flattened when stomped,
    // then dizzy with stars as it runs off.
    const mouse = (f: Foe) => {
      const st = calm ? 0 : Math.sin(f.t * 22) * 0.05;
      lines("#d98f96", 0.035, [-0.22, -0.12, -0.42, -0.06, -0.42, -0.06, -0.55, -0.2]);
      oval("#e8a0a8", -0.1 + st, -0.03, 0.07, 0.035);
      oval("#e8a0a8", 0.12 - st, -0.03, 0.07, 0.035);
      oval("#8e909e", 0, -0.18, 0.26, 0.16);
      oval("#c9cad3", 0.06, -0.12, 0.15, 0.07);
      oval("#8e909e", 0.24, -0.21, 0.13, 0.1);
      oval("#8e909e", 0.12, -0.36, 0.11);
      oval("#f2b6bf", 0.12, -0.36, 0.065);
      oval("#e86a7a", 0.37, -0.22, 0.04);
      if (f.dead) lines(C.ink, 0.025, [0.2, -0.29, 0.28, -0.22, 0.28, -0.29, 0.2, -0.22]);
      else oval(C.ink, 0.25, -0.26, 0.032);
    };
    // Fly: a black dot with glassy flapping wings and a big red eye
    const fly = (f: Foe) => {
      const flap = calm ? 0 : Math.sin(f.t * 60) * 0.5;
      oval("rgba(225,240,255,0.75)", -0.08, -0.5, 0.15, 0.07, -0.7 + flap);
      oval("#2a2a33", 0, -0.36, 0.15, 0.11);
      oval("#2a2a33", 0.15, -0.38, 0.08);
      oval("#c0303a", 0.18, -0.4, 0.05);
      oval("rgba(225,240,255,0.75)", 0.02, -0.5, 0.15, 0.07, -0.4 - flap);
    };
    // Chef: a round white coat, a curly moustache and a tall toque, sweeping
    // a straw broom out in front of him
    const chef = (f: Foe) => {
      const w = calm ? 0 : Math.sin(f.t * 7) * 0.08;
      const bx = 0.95 + Math.sin(f.t * 6) * 0.12;
      lines("#33333d", 0.13, [-0.12, -0.5, -0.12 + w, -0.05, 0.12, -0.5, 0.12 - w, -0.05]);
      oval("#1e1e22", -0.06 + w, -0.04, 0.14, 0.06);
      oval("#1e1e22", 0.18 - w, -0.04, 0.14, 0.06);
      lines("#8a5a32", 0.06, [0.2, -1.05, bx, -0.12]);
      shape("#d9b25a", [bx - 0.18, -0.2, bx + 0.18, -0.2, bx + 0.3, 0, bx - 0.3, 0]);
      box("#b0213a", bx - 0.18, -0.24, 0.36, 0.06);
      oval(C.matsoni, 0, -0.95, 0.42, 0.52);
      box("#e2e6e0", -0.32, -0.75, 0.64, 0.5);
      lines(C.matsoni, 0.16, [-0.1, -1.2, 0.3, -0.95, 0.3, -0.95, 0.2, -0.95]);
      oval("#f2c29a", 0.24, -0.98, 0.08);
      oval("#f2c29a", 0.05, -1.55, 0.25);
      oval("#e8957a", 0.27, -1.52, 0.09, 0.08);
      oval("#3a2418", 0.12, -1.42, 0.13, 0.05, 0.3);
      oval("#3a2418", 0.34, -1.42, 0.13, 0.05, -0.3);
      oval(C.ink, 0.16, -1.63, 0.035);
      lines("#3a2418", 0.04, [0.07, -1.73, 0.22, -1.69]);
      // The toque squashes when the cat lands on it
      const h = 1 - Math.max(0, 0.3 - f.dt) * 1.6;
      ctx.save();
      ctx.translate(0, -1.75);
      ctx.scale(1 + (1 - h) * 0.5, h);
      box(C.matsoni, -0.2, -0.32, 0.44, 0.34);
      oval(C.matsoni, -0.1, -0.33, 0.16);
      oval(C.matsoni, 0.14, -0.35, 0.17);
      oval(C.matsoni, 0.02, -0.46, 0.18);
      box("#e2e6e0", -0.21, -0.06, 0.46, 0.08);
      ctx.restore();
    };
    const drawFoe = (f: Foe, px: number, py: number) => {
      ctx.save();
      ctx.globalAlpha = f.dead ? Math.max(0, 1 - Math.max(0, f.dt - (f.k ? 0.2 : 1.6)) * 3) : 1;
      ctx.translate(px, py - (f.k || f.dead ? 0 : Math.abs(Math.sin(f.t * 10)) * T * 0.04));
      // Flat as a pancake for half a second after a stomp
      const flat = f.dead && !f.k && f.dt < 0.5;
      ctx.scale((f.vx > 0 ? T : -T) * (flat ? 1.5 : f.k === 1 ? 1.3 : 1), T * (flat ? 0.25 : f.k === 1 ? 1.3 : 1));
      if (f.dead && f.k) ctx.rotate(f.dt * 9);
      outlined("#2a2838", 0.035, () => (f.k > 1 ? chef(f) : f.k ? fly(f) : mouse(f)));
      ctx.restore();
      // Dizzy stars over a mouse that's running off
      if (f.dead && !f.k && f.dt > 0.5)
        for (let i = 0; i < 3; i++) {
          const a = time * 6 + (i * TAU) / 3;
          star(GOLD, px + (Math.cos(a) * 0.25 + 0.1 * Math.sign(f.vx)) * T, py - (0.55 + Math.sin(a) * 0.08) * T, T * 0.09);
        }
    };

    const drawItem = (it: Item) => {
      if (it.gold) {
        oval("rgba(255,226,120,0.35)", 0, 0, 0.5 + (calm ? 0 : Math.sin(time * 5) * 0.06));
        plate(0.25);
        fish(FRIED, 0.24);
        oval("#ffe14a", 0.3, 0.12, 0.08, 0.05);
      } else if (it.sau) {
        ctx.rotate(-0.4);
        lines("#e8d8b0", 0.03, [-0.22, 0, -0.3, -0.07, 0.22, 0, 0.3, -0.07]);
        oval("#b44a36", -0.1, 0, 0.12);
        oval("#b44a36", 0.1, 0, 0.12);
        box("#b44a36", -0.1, -0.12, 0.2, 0.24);
        box("rgba(255,255,255,0.35)", -0.12, -0.07, 0.24, 0.04);
      } else fish("#9cc0d6", 0.2);
    };

    const drawTile = (ch: string, c: number, r: number) => {
      const th = THEME[level]!;
      const top = !solid(c, r - 1);
      const h = hash(c * 3.1 + r * 17);
      const swing = calm ? 0 : Math.sin((time - rackT) * 9 + c) * Math.exp((rackT - time) * 2.5) * 0.5;
      if (ch === "#") {
        // Floor: kitchen checks, cellar flags, hall parquet
        box(th[5], 0, 0, 1.02, 1.02);
        lines("rgba(0,0,0,0.2)", 0.03, [0, 0.55, 1, 0.55, (r % 2) * 0.5, 0.55, (r % 2) * 0.5, 1]);
        if (top) {
          box(th[3], 0, 0, 0.51, 0.24);
          box(th[4], 0.5, 0, 0.52, 0.24);
          box("rgba(255,255,255,0.3)", 0, 0, 1.02, 0.04);
          box("rgba(0,0,0,0.3)", 0, 0.24, 1.02, 0.06);
        }
        if (!solid(c - 1, r)) box("rgba(0,0,0,0.25)", 0, 0, 0.12, 1.02);
        if (!solid(c + 1, r)) box("rgba(0,0,0,0.25)", 0.88, 0, 0.12, 1.02);
        if (r > 8) box("rgba(20,10,20,0.35)", 0, 0, 1.02, 1.02);
      } else if (ch === "C") {
        // Wooden cabinet under a steel worktop
        box("#c08552", 0, 0, 1.02, 1.02);
        box("#a8703f", 0.1, top ? 0.32 : 0.06, 0.82, top ? 0.62 : 0.84);
        oval("#f3d27a", c % 2 ? 0.2 : 0.82, top ? 0.6 : 0.4, 0.05);
        if (top) {
          box("#c9d0d6", -0.04, 0, 1.1, 0.22);
          box("#f4f7f8", -0.04, 0, 1.1, 0.05);
          box("rgba(40,20,20,0.3)", 0, 0.22, 1.02, 0.05);
        }
      } else if (ch === "O") {
        // Stove: black hob and knobs on top, a glowing oven door below
        box("#aab3bb", 0, 0, 1.02, 1.02);
        box("rgba(255,255,255,0.35)", 0, 0, 0.08, 1.02);
        if (top) {
          box("#2c2c33", -0.03, 0, 1.08, 0.16);
          for (const kx of [0.3, 0.7]) oval("#2c2c33", kx, 0.38, 0.08);
          box("#e8eef2", 0.1, 0.62, 0.82, 0.06);
          box("#3a2a2a", 0.12, 0.78, 0.78, 0.3);
        } else {
          box("#3a2a2a", 0.12, 0, 0.78, 0.62);
          box("rgba(255,140,60,0.5)", 0.18, 0.06, 0.66, 0.5);
        }
      } else if (ch === "X") {
        // Crate: plank frame and a diagonal brace
        box("#c79358", 0, 0, 1.02, 1.02);
        lines("rgba(110,60,30,0.35)", 0.02, [0.1, 0.36, 0.9, 0.36, 0.1, 0.66, 0.9, 0.66]);
        lines("#8a5a30", 0.08, [0.06, 0.06, 0.94, 0.06, 0.06, 0.94, 0.94, 0.94, 0.06, 0.06, 0.06, 0.94, 0.94, 0.06, 0.94, 0.94, 0.12, 0.88, 0.88, 0.12]);
      } else if (ch === "S") {
        // Flour sack: tied at the top, a wheat ear on the front, dusty
        box("#d8c9a8", 0.02, 0.45, 0.98, 0.57);
        oval("#d8c9a8", 0.5, 0.5, 0.5, 0.48);
        oval("rgba(255,255,255,0.45)", 0.3, 0.45, 0.14, 0.08);
        lines("#c9a24a", 0.05, [0.5, 0.88, 0.5, 0.5, 0.5, 0.62, 0.4, 0.52, 0.5, 0.62, 0.6, 0.52, 0.5, 0.75, 0.4, 0.65, 0.5, 0.75, 0.6, 0.65]);
        if (top) {
          oval("#e4d7b8", 0.5, 0.06, 0.16, 0.1);
          lines("#8a6a3a", 0.05, [0.38, 0.14, 0.62, 0.14]);
        }
      } else if (ch === "B") {
        // Barrel with staves and iron hoops
        box("#8f5530", 0.06, 0, 0.9, 1.02);
        oval("#a8683a", 0.4, 0.5, 0.16, 0.5);
        lines("rgba(50,25,10,0.35)", 0.03, [0.28, 0, 0.28, 1, 0.72, 0, 0.72, 1]);
        box("#3f3a3a", 0.04, 0.16, 0.94, 0.08);
        box("#3f3a3a", 0.04, 0.78, 0.94, 0.08);
        if (top) oval("#b7774a", 0.51, 0.04, 0.45, 0.07);
      } else if (ch === "=") {
        // Bar counter: dark wood panels, a brass foot rail
        box("#5a3322", 0, 0, 1.02, 1.02);
        box("#4a2a1b", 0.12, top ? 0.32 : 0.06, 0.78, top ? 0.6 : 0.6);
        if (top) {
          box("#2e1a12", -0.04, 0, 1.1, 0.2);
          box("#8a5a3f", -0.04, 0, 1.1, 0.05);
        } else box("#d9b25a", -0.02, 0.8, 1.06, 0.07);
      } else if (ch === "-") {
        // Wall shelf with a bracket; jars of pickles, jam and cherries on it
        box("#9a6a3c", -0.02, 0, 1.04, 0.16);
        box("#c08a52", -0.02, 0, 1.04, 0.04);
        shape("#7a4a28", [0.4, 0.16, 0.6, 0.16, 0.5, 0.48]);
        if (h > 0.3 && !items.some((i) => !i.got && Math.floor(i.x) === c && Math.floor(i.y) === r - 1)) {
          box(["#6aa04a", C.apricot, C.pomegranate][Math.floor(h * 3)]!, 0.28, -0.4, 0.4, 0.4);
          box("#d9b25a", 0.24, -0.48, 0.48, 0.1);
          box("rgba(255,255,255,0.4)", 0.33, -0.34, 0.06, 0.26);
        }
      } else if (ch === "~" || ch === "Y") {
        // Pot rack or chandelier: a bar hung on chains, things dangling below
        const ch2 = ch === "Y";
        const L = at(c - 1, r) !== ch;
        const R = at(c + 1, r) !== ch;
        const cx = ch2 ? (L || R ? -1 : 0.5) : L ? 0.15 : R ? 0.85 : -1;
        if (cx >= 0) lines(ch2 ? "#b08a3a" : "#555a63", 0.04, [cx, 0, cx, -r - 1]);
        box(ch2 ? "#c9a24a" : "#6b707a", -0.02, 0, 1.04, 0.12);
        box(ch2 ? "#f3d27a" : "#a9afb8", -0.02, 0, 1.04, 0.03);
        ctx.save();
        ctx.translate(0.5, 0.12);
        ctx.rotate(swing);
        if (ch2) {
          glow(0, 0.38, 0.9, "rgba(255,226,150,0.45)");
          lines("#b08a3a", 0.04, [0, 0, 0, 0.25]);
          oval("#fff2c0", 0, 0.36, 0.1, 0.13);
        } else {
          lines("#555a63", 0.03, [0, 0, 0, 0.16]);
          const k = Math.floor(h * 3);
          if (k === 0) {
            // A copper pot
            oval("#c46a3a", 0, 0.42, 0.28, 0.22);
            box("#c46a3a", -0.3, 0.2, 0.6, 0.12);
            box("rgba(255,255,255,0.3)", -0.18, 0.3, 0.06, 0.2);
          } else if (k === 1) {
            // A frying pan
            lines("#2f3238", 0.07, [0, 0.16, 0, 0.4]);
            oval("#2f3238", 0, 0.62, 0.24);
            oval("#4a4e57", -0.05, 0.58, 0.14);
          } else {
            // A ladle
            lines("#a9afb8", 0.05, [0, 0.16, 0, 0.55]);
            oval("#a9afb8", 0, 0.62, 0.13, 0.1);
          }
        }
        ctx.restore();
      } else if (ch === "t") {
        // Café table: a white cloth and legs down to the floor
        const left = at(c - 1, r) !== "t";
        const right = at(c + 1, r) !== "t";
        const g = groundBelow(c + 0.5, r + 1);
        for (const lx of [left ? 0.2 : -1, right ? 0.8 : -1]) if (lx > 0 && g > 0) box("#6b4630", lx - 0.05, 0.3, 0.1, g - r - 0.3);
        box("#f4efe6", -0.03, 0, 1.06, 0.22);
        box("#ddd5c6", -0.03, 0.22, 1.06, 0.12);
      } else if (ch === "h") {
        // Bistro chair; after closing some stand upside down on the tables
        if (at(c, r + 1) === "t") {
          ctx.translate(0, 1.5);
          ctx.scale(1, -1);
        }
        const d = h > 0.5 ? 0.2 : 0.8;
        lines("#7a4a2a", 0.07, [0.2, 0.55, 0.2, 1, 0.8, 0.55, 0.8, 1, d, 0.55, d, -0.1, d, 0.05, 1 - d + (d - 0.5) * 0.6, 0.05]);
        box("#b0213a", 0.12, 0.48, 0.76, 0.1);
      } else if (ch === "^") {
        // Gas burner: tall orange flames when lit, a low blue ring between
        const fh = flame(c);
        const on = fh > 0.45;
        const fl = calm ? 0 : Math.sin(time * 31 + c * 2) * 0.06;
        box("#1a1a1f", 0.12, 0.92, 0.76, 0.08);
        if (on) glow(0.5, 0.75, 0.8, "rgba(255,150,60,0.4)");
        for (const [dx, k] of [[-0.18, 0.7], [0.18, 0.75], [0, 1]] as const) {
          shape(on ? "#ff6a1a" : "#3d7bff", [0.5 + dx - 0.16, 0.95, 0.5 + dx + fl * k, 0.95 - fh * k, 0.5 + dx + 0.16, 0.95]);
          shape(on ? GOLD : "#a8d0ff", [0.5 + dx - 0.07, 0.95, 0.5 + dx - fl, 0.95 - fh * k * 0.55, 0.5 + dx + 0.07, 0.95]);
        }
      } else if (ch === "_") {
        // Soapy puddle with bubbles rising off it
        oval("rgba(190,228,248,0.8)", 0.5, 0.97, 0.62, 0.08);
        oval("rgba(255,255,255,0.8)", 0.32, 0.95, 0.2, 0.025);
        for (const i of [0.2, 0.55, 0.85]) {
          const p = calm ? 0.3 : (time * 0.5 + i + c * 0.37) % 1;
          oval(`rgba(235,248,255,${0.8 - p * 0.8})`, i + Math.sin(p * 6) * 0.05, 0.9 - p * 0.7, 0.04 + p * 0.04);
        }
      }
    };

    const drawBackground = (w: number) => {
      const th = THEME[level]!;
      const v = viewH;
      const g = ctx.createLinearGradient(0, 0, 0, v);
      g.addColorStop(0, th[0]);
      g.addColorStop(1, th[1]);
      box(g, 0, 0, w, v);
      const off = camX * T * 0.5;
      // The wall: kitchen tiles, cellar bricks, hall wallpaper stripes
      const bw = T * [0.7, 1.3, 0.6][level]!;
      const bh = T * [0.45, 0.65, 40][level]!;
      const seg: number[] = [];
      for (let yy = 0, i = 0; yy < v; yy += bh, i++) {
        seg.push(0, yy, w, yy);
        for (let xx = -((off + (i % 2) * bw * 0.5) % bw); xx < w; xx += bw) seg.push(xx, yy, xx, yy + bh);
      }
      lines(level ? "rgba(0,0,0,0.18)" : "rgba(170,130,90,0.3)", level > 1 ? T * 0.14 : 1, seg);
      // Windows with Ararat in them (dusk, then moonlit), and between them
      // pendant lamps or bare bulbs (the hall has its chandeliers)
      const [ww, wh, wy] = ([[2.6, 2, 1.2], [1.4, 0.8, 1.8], [2.2, 3.4, 1]] as const)[level]!.map((n) => n * T) as [number, number, number];
      const sp = T * 9;
      for (let i = Math.floor(off / sp) - 1; i * sp - off < w + sp; i++) {
        const x0 = i * sp - off + T * 1.5;
        const fr = th[8];
        if (level === 1) shape("rgba(190,210,255,0.1)", [x0, wy + wh, x0 + ww, wy + wh, x0 + ww + T * 2.5, v, x0 + T * 1.5, v]);
        box(fr, x0 - T * 0.15, wy - T * 0.15, ww + T * 0.3, wh + T * 0.3);
        if (level > 1) oval(fr, x0 + ww / 2, wy, ww / 2 + T * 0.15);
        const sky = ctx.createLinearGradient(0, wy - ww / 2, 0, wy + wh);
        sky.addColorStop(0, th[6]);
        sky.addColorStop(1, th[7]);
        box(sky, x0, wy, ww, wh);
        if (level > 1) oval(sky, x0 + ww / 2, wy, ww / 2);
        if (level) oval("#fff6d8", x0 + ww * 0.72, wy + wh * 0.22, T * 0.22);
        shape(level ? "rgba(20,20,50,0.45)" : "rgba(170,90,110,0.45)", [x0, wy + wh, x0 + ww * 0.35, wy + wh * 0.5, x0 + ww * 0.6, wy + wh * 0.75, x0 + ww * 0.75, wy + wh * 0.66, x0 + ww, wy + wh]);
        shape("rgba(255,255,255,0.6)", [x0 + ww * 0.26, wy + wh * 0.59, x0 + ww * 0.35, wy + wh * 0.5, x0 + ww * 0.44, wy + wh * 0.59]);
        lines(fr, T * 0.08, [x0 + ww / 2, wy - (level > 1 ? ww / 2 : 0), x0 + ww / 2, wy + wh, x0, wy + wh * 0.5, x0 + ww, wy + wh * 0.5]);
        const lx = x0 + T * 4.8;
        if (level < 2) {
          lines("#3a3a3a", 1.5, [lx, 0, lx, T * 1.3]);
          glow(lx, T * 1.6, T * 2.4, "rgba(255,222,150,0.35)");
          if (!level) shape(C.tarragon, [lx - T * 0.45, T * 1.62, lx - T * 0.15, T * 1.25, lx + T * 0.15, T * 1.25, lx + T * 0.45, T * 1.62]);
          oval("#fff2c0", lx, T * 1.62, T * 0.13);
        }
      }
      // A lower band behind the furniture: green tiles, dark bricks, wood panels
      const by = v - T * 3.4;
      box(th[2], 0, by, w, v - by);
      box("rgba(255,255,255,0.18)", 0, by, w, T * 0.08);
      const pan: number[] = [];
      for (let xx = -(off % (T * 1.6)); xx < w; xx += T * 1.6) pan.push(xx, by, xx, v);
      lines("rgba(0,0,0,0.18)", 1, pan);
    };

    // The chef's plate of fish on a little pedestal table, glowing; empty
    // once the cat has it.
    const drawGoal = () => {
      const won = state === "win" || (state === "end" && lives > 0);
      glow(0, -1.3, 1.8 + (calm ? 0 : Math.sin(time * 4) * 0.1), "rgba(255,226,150,0.5)");
      lines("#6b4630", 0.12, [0, -1, 0, 0, -0.35, 0, 0.35, 0]);
      box("#8a5a3a", -0.65, -1.08, 1.3, 0.12);
      plate(0.42);
      if (won) return;
      ctx.save();
      ctx.translate(0, -1.32);
      fish(FRIED, 0.42);
      ctx.restore();
      oval("#ffe14a", 0.5, -1.22, 0.13, 0.08);
      ctx.strokeStyle = "rgba(255,255,255,0.8)";
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      for (const dx of [-0.2, 0.1]) {
        const wv = calm ? 0 : Math.sin(time * 4 + dx * 20) * 0.08;
        ctx.moveTo(dx, -1.65);
        ctx.quadraticCurveTo(dx + 0.12 + wv, -1.9, dx - wv, -2.15);
      }
      ctx.stroke();
    };

    // Checkpoint: the cat's milk saucer; it fills once reached
    const drawCheck = (k: { t: number }) => {
      oval("#8a1c2e", 0, -0.1, 0.4, 0.12);
      box(C.pomegranate, -0.4, -0.2, 0.8, 0.12);
      oval(k.t >= 0 ? C.matsoni : "#5a1424", 0, -0.2, 0.36, 0.08);
    };

    const groundBelow = (gx: number, gy: number) => {
      const c = Math.floor(gx);
      for (let r = Math.max(0, Math.floor(gy)); r < ROWS; r++) if (solid(c, r) || oneWay(c, r)) return r;
      return -1;
    };

    const draw = () => {
      const s = fit.size();
      const th = THEME[level]!;
      ctx.save();
      if (shake > 0) ctx.translate(rand(-1, 1) * shake * 10, rand(-1, 1) * shake * 10);
      ctx.beginPath();
      ctx.rect(0, 0, s.w, viewH);
      ctx.clip();
      drawBackground(s.w);
      const ox = -camX * T;
      const oy = viewH - ROWS * T;
      // Dark down in the gaps, so they read as drops
      const haze = ctx.createLinearGradient(0, oy + T * 7.3, 0, viewH);
      haze.addColorStop(0, "rgba(30,15,25,0)");
      haze.addColorStop(1, "rgba(30,15,25,0.75)");
      box(haze, 0, oy + T * 7.3, s.w, T * 2.7);
      for (let r = 0; r < ROWS; r++) {
        for (let c = Math.max(0, Math.floor(camX) - 1); c <= Math.min(W - 1, camX + s.w / T + 1); c++) {
          const ch = at(c, r);
          if (ch !== " ") put(ox + c * T, oy + r * T, T, () => drawTile(ch, c, r));
        }
      }
      for (const k of checks) put(ox + k.x * T, oy + k.y * T, T, () => drawCheck(k));
      put(ox + door.x * T, oy + door.y * T, T, drawGoal);
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
      for (const f of foes) if (!f.dead && f.k !== 1) oval("#3c1e32", ox + f.x * T, oy + f.y * T, T * (f.k ? 0.45 : 0.24), T * 0.06);
      ctx.globalAlpha = 1;
      for (const it of items) if (!it.got) put(ox + it.x * T, oy + it.y * T + (calm ? 0 : Math.sin(time * 3 + it.x) * T * 0.06), T, () => drawItem(it));
      for (const f of foes) if (!f.dead || f.dt < 2.2) drawFoe(f, ox + f.x * T, oy + f.y * T);
      const mood = state === "win" || joyT > 0 ? 2 : slick ? 1 : 0;
      if (state === "play") drawCat(ox + x * T, oy + y * T, mood);
      else if (state === "win" || (state === "end" && lives > 0)) {
        // Prize in the mouth, hopping for joy
        const hop = calm || stateT < 0.3 ? 0 : Math.abs(Math.sin(stateT * 9)) * 0.35;
        drawCat(ox + x * T, oy + (y - hop) * T, 2);
      } else if (hitDeath && stateT < 0.9) {
        // Knocked off: a little tumble up and down, fading
        const t = stateT;
        drawCat(ox + (deadX + deadV * t) * T, oy + (deadY - 4 * t + 9 * t * t) * T, 1, (calm ? 0.5 : t * 9) * -face, 1 - t);
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
        } else if (p.k === 1) {
          // A heart
          const r = T * 0.07;
          oval(p.col, px - r, py, r);
          oval(p.col, px + r, py, r);
          shape(p.col, [px - r * 1.95, py + r * 0.3, px + r * 1.95, py + r * 0.3, px, py + r * 2.2]);
        } else oval(p.col, px, py, T * 0.06);
      }
      ctx.globalAlpha = 1;
      // Fades between levels, the level number as one opens, the game-over dim
      let fade = Math.max(0, 1 - levelT * 3);
      if (state === "win") fade = level + 1 < LEVELS.length ? clamp((stateT - 1.4) * 2.5, 0, 1) : 0;
      if (fade > 0) {
        ctx.globalAlpha = fade;
        box(th[1], 0, 0, s.w, viewH);
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

      // HUD on a soft pill: lives, fish, level, score
      const hs = clamp(T * 0.36, 10, 16);
      const hy = 12 + hs * 1.2;
      ctx.fillStyle = "rgba(255,246,236,0.7)";
      roundRect(ctx, 6, hy - hs * 1.25, s.w - 12, hs * 2.5, hs * 1.25);
      ctx.fill();
      for (let i = 0; i < LIVES; i++) {
        ctx.globalAlpha = i < lives ? 1 : 0.25;
        catHead(12 + hs + i * hs * 1.85, hy + hs * 0.1, hs * 0.8, 0);
      }
      ctx.globalAlpha = 1;
      const fx = 12 + hs * 10.8;
      put(fx, hy, hs * 2, () => fish("#9cc0d6", 0.3));
      label(ctx, String(fruit), fx + hs * 1.1, hy, hs * 1.4, C.ink, "left");
      label(ctx, `${level + 1}/${LEVELS.length}`, s.w / 2 + hs * 3, hy, hs * 1.3, C.ink);
      label(ctx, String(score), s.w - 16, hy, hs * 1.4, C.ink, "right");

      // Pad area: the dark floor in the foreground
      const pg = ctx.createLinearGradient(0, viewH, 0, s.h);
      pg.addColorStop(0, th[5]);
      pg.addColorStop(1, "#1c1416");
      box(pg, 0, viewH, s.w, s.h - viewH);
      box(th[3], 0, viewH, s.w, 4);
      box("rgba(20,10,10,0.4)", 0, viewH + 4, s.w, 5);
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
        joyT -= dt;
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
          slick = false;
        }
        if (state === "dead" && stateT > RESPAWN) respawn();
        if (state === "win") {
          x += (door.x - 0.95 - x) * Math.min(1, dt * 5);
          if (!calm && Math.random() < 0.4) emit(5, door.x + rand(-1.5, 1.5), door.y - rand(2.4, 3.6), rand(-1, 1), rand(-1, 0), 1.6, pick(CONFETTI));
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
