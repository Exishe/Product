// "Yard Fighters": a one-on-one cartoon scuffle in an old Yerevan courtyard.
// The Chef (the guest) and the Baker (the phone) trade ladle pokes, kicks and
// spinning lavash discs. Hits make flour puffs and stars; a knocked-out
// fighter sits down dizzy. Best of three rounds. No words on the canvas.
import { C, clamp, createPad, fitCanvas, glyph, label, loop, rand, roundRect, type Game, type PadButton, type Size } from "./engine";

type State = "idle" | "walk" | "punch" | "kick" | "throw" | "block" | "hit" | "ko" | "win";
type Fighter = {
  cpu: boolean;
  x: number; // world units from the arena's left edge
  y: number; // height above the floor
  vx: number;
  vy: number;
  kb: number; // knock-back speed, decays
  face: number;
  hp: number;
  chip: number; // the trail behind the health bar
  st: State;
  t: number;
  done: boolean; // this attack already landed (or the disc left the hand)
  inv: number;
  cd: number;
  wins: number;
};
type Intent = { mv: number; block: boolean; jump: boolean; a: boolean; b: boolean; c: boolean };
type Disc = { x: number; vx: number; owner: Fighter; spin: number };
type Bit = { x: number; y: number; vx: number; vy: number; life: number; max: number; r: number; star: boolean };

const ROUND = 45;
const WALK = 105;
const GRAV = 1300;
const SKIN = "#f2c49b";
const INK = C.ink;
// Attack timing in seconds: [duration, active from, active to, reach, damage].
const ATK = { punch: [0.26, 0.06, 0.15, 34, 6], kick: [0.46, 0.17, 0.3, 50, 10], throw: [0.36, 0.14, 0.14, 0, 0] } as const;
const STUN = 0.32;

const star = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) => {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = "#ffd23f";
  ctx.fill();
  ctx.lineWidth = r * 0.18;
  ctx.strokeStyle = C.apricotDeep;
  ctx.stroke();
};

// A chunky outlined stroke: arms, legs, the rolling pin.
const limb = (ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, w: number, color: string) => {
  ctx.lineCap = "round";
  for (const [lw, c] of [[w + 3, INK], [w, color]] as const) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = c;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
};

const blob = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, lw = 2.2) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
};

const ext = (f: Fighter) => {
  if (f.st !== "punch" && f.st !== "kick" && f.st !== "throw") return 0;
  const [d, on, off] = ATK[f.st];
  return f.t < on ? f.t / on : f.t < off ? 1 : Math.max(0, 1 - (f.t - off) / (d - off));
};

export const game: Game = {
  mount(api) {
    const canvas = api.canvas;
    const calm = api.reducedMotion;
    const prevTouch = canvas.style.touchAction;
    canvas.style.touchAction = "none";

    // Layout in CSS px; the world is 300 units tall, fighters about 110.
    let ax = 0;
    let aw = 1;
    let ah = 1;
    let u = 1;
    let ww = 300;
    let floorY = 1;
    let bg: HTMLCanvasElement | null = null;
    let cBtn = { x: 0, y: 0, r: 0 };
    let arrows: { id: PadButton; x: number; y: number; r: number }[] = [];

    const mk = (cpu: boolean): Fighter => ({
      cpu, x: 0, y: 0, vx: 0, vy: 0, kb: 0, face: cpu ? -1 : 1, hp: 100, chip: 100, st: "idle", t: 0, done: false, inv: 0, cd: 0, wins: 0,
    });
    const P = mk(false);
    const B = mk(true);
    let discs: Disc[] = [];
    let bits: Bit[] = [];
    let round = 1;
    let phase: "intro" | "fight" | "ko" = "intro";
    let phaseT = 0;
    let timer = ROUND;
    let over = false;
    let reported = false;
    let score = 0;
    let dealt = 0;
    let bonus = 0;
    let shake = 0;
    let stop = 0;
    let now = 0;

    const setScore = () => {
      const s = Math.round(dealt) + bonus;
      if (s !== score) {
        score = s;
        api.setScore(score);
      }
    };

    const paintBg = (s: Size) => {
      const c = document.createElement("canvas");
      const dpr = canvas.width / s.w;
      c.width = canvas.width;
      c.height = canvas.height;
      const b = c.getContext("2d");
      if (!b) return null;
      b.scale(dpr, dpr);
      const W = s.w;
      const wallTop = ah * 0.2;
      const floorTop = ah * 0.62;
      // Golden-hour sky.
      let g = b.createLinearGradient(0, 0, 0, wallTop);
      g.addColorStop(0, "#f5b86a");
      g.addColorStop(1, "#fde3b0");
      b.fillStyle = g;
      b.fillRect(0, 0, W, wallTop + 2);
      // Tufa wall with stone courses.
      b.fillStyle = C.tufa;
      b.fillRect(0, wallTop, W, floorTop - wallTop);
      b.strokeStyle = "rgba(176,106,76,0.45)";
      b.lineWidth = 1.2;
      const row = Math.max(10, ah * 0.045);
      for (let y = wallTop, i = 0; y < floorTop; y += row, i++) {
        b.beginPath();
        b.moveTo(0, y);
        b.lineTo(W, y);
        for (let x = (i % 2) * row; x < W; x += row * 2) {
          b.moveTo(x, y);
          b.lineTo(x, Math.min(floorTop, y + row));
        }
        b.stroke();
      }
      b.fillStyle = C.tufaDark;
      b.fillRect(0, wallTop - 4, W, 8);
      // Arched doorways and a window with geraniums.
      const arch = (x: number, top: number, w: number, bottom: number, fill: string) => {
        b.beginPath();
        b.moveTo(x, bottom);
        b.lineTo(x, top + w / 2);
        b.arc(x + w / 2, top + w / 2, w / 2, Math.PI, 0);
        b.lineTo(x + w, bottom);
        b.closePath();
        b.fillStyle = fill;
        b.fill();
        b.lineWidth = Math.max(3, w * 0.09);
        b.strokeStyle = C.tufaDark;
        b.stroke();
      };
      const dw = aw * 0.17;
      arch(ax + aw * 0.12, floorTop - (floorTop - wallTop) * 0.78, dw, floorTop, C.basalt3);
      arch(ax + aw * 0.66, floorTop - (floorTop - wallTop) * 0.74, dw, floorTop, "#4f7480");
      b.strokeStyle = "rgba(19,36,27,0.35)";
      b.lineWidth = 1.5;
      b.beginPath();
      b.moveTo(ax + aw * 0.66 + dw / 2, floorTop - (floorTop - wallTop) * 0.6);
      b.lineTo(ax + aw * 0.66 + dw / 2, floorTop);
      b.stroke();
      const wx = ax + aw * 0.42;
      const wy = wallTop + (floorTop - wallTop) * 0.22;
      arch(wx, wy, dw * 0.7, wy + dw * 0.9, "#3a5560");
      b.fillStyle = C.tufaDark;
      b.fillRect(wx - 6, wy + dw * 0.9, dw * 0.7 + 12, 6);
      for (let i = 0; i < 4; i++) blob(b, wx + 4 + i * dw * 0.16, wy + dw * 0.86, dw * 0.08, i % 2 ? C.pomegranate : "#e0405a", 0);
      // Laundry line.
      const lx0 = ax + aw * 0.03;
      const lx1 = ax + aw * 0.97;
      const ly = wallTop + ah * 0.05;
      const sag = ah * 0.07;
      b.strokeStyle = "rgba(19,36,27,0.6)";
      b.lineWidth = 1.2;
      b.beginPath();
      b.moveTo(lx0, ly);
      b.quadraticCurveTo((lx0 + lx1) / 2, ly + sag * 2, lx1, ly);
      b.stroke();
      const cloth = [C.apricot, C.sky, C.pomTint, C.matsoni, C.tarragonLight, "#f3d36b"];
      for (let i = 0; i < 6; i++) {
        const t = 0.12 + i * 0.15;
        const x = lx0 + (lx1 - lx0) * t;
        const y = ly + sag * 4 * t * (1 - t);
        const cw = aw * (i % 2 ? 0.06 : 0.08);
        const ch = ah * (i % 3 ? 0.08 : 0.11);
        b.fillStyle = cloth[i]!;
        roundRect(b, x - cw / 2, y, cw, ch, 3);
        b.fill();
        b.fillStyle = C.tufaDark;
        b.fillRect(x - cw / 2 + 2, y - 2, 3, 6);
        b.fillRect(x + cw / 2 - 5, y - 2, 3, 6);
      }
      // Floor: paving in perspective.
      g = b.createLinearGradient(0, floorTop, 0, ah);
      g.addColorStop(0, "#c9a07c");
      g.addColorStop(1, "#e3c29d");
      b.fillStyle = g;
      b.fillRect(0, floorTop, W, ah - floorTop);
      const cx = ax + aw / 2;
      const tw = aw / 7;
      b.strokeStyle = "rgba(122,74,48,0.35)";
      b.lineWidth = 1;
      b.beginPath();
      for (let i = -12; i <= 12; i++) {
        b.moveTo(cx + i * tw * 0.7, floorTop);
        b.lineTo(cx + i * tw * 1.6, ah);
      }
      for (let j = 1; j < 6; j++) {
        const y = floorTop + (ah - floorTop) * (j / 6) ** 1.5;
        b.moveTo(0, y);
        b.lineTo(W, y);
      }
      b.stroke();
      g = b.createLinearGradient(0, floorTop, 0, floorTop + ah * 0.05);
      g.addColorStop(0, "rgba(90,40,20,0.3)");
      g.addColorStop(1, "rgba(90,40,20,0)");
      b.fillStyle = g;
      b.fillRect(0, floorTop, W, ah * 0.05);
      // Nardi table with two stools at the back right.
      const nx = ax + aw * 0.86;
      const ny = floorTop + ah * 0.06;
      const nw = aw * 0.15;
      limb(b, nx - nw * 0.4, ny, nx - nw * 0.4, ny + ah * 0.08, 2, "#6b4128");
      limb(b, nx + nw * 0.4, ny, nx + nw * 0.4, ny + ah * 0.08, 2, "#6b4128");
      for (const sx of [nx - nw * 0.75, nx + nw * 0.75]) {
        b.fillStyle = "#8a5634";
        roundRect(b, sx - nw * 0.14, ny + ah * 0.035, nw * 0.28, ah * 0.018, 2);
        b.fill();
        b.fillRect(sx - 1.5, ny + ah * 0.05, 3, ah * 0.035);
      }
      b.fillStyle = "#8a5634";
      roundRect(b, nx - nw / 2, ny - ah * 0.02, nw, ah * 0.03, 2);
      b.fill();
      b.fillStyle = "#f0dcb4";
      b.fillRect(nx - nw * 0.45, ny - ah * 0.028, nw * 0.9, ah * 0.016);
      for (let i = 0; i < 10; i++) {
        const x = nx - nw * 0.43 + i * nw * 0.086;
        b.fillStyle = i % 2 ? C.pomegranate : "#3a2a20";
        b.beginPath();
        b.moveTo(x, ny - ah * 0.028);
        b.lineTo(x + nw * 0.04, ny - ah * 0.016);
        b.lineTo(x + nw * 0.08, ny - ah * 0.028);
        b.fill();
      }
      blob(b, nx - nw * 0.2, ny - ah * 0.033, ah * 0.008, C.matsoni, 0.8);
      blob(b, nx + nw * 0.15, ny - ah * 0.033, ah * 0.008, INK, 0);
      // Pergola: posts, beam, vine and grapes.
      const wood = "#7a4f30";
      b.fillStyle = wood;
      b.fillRect(ax + 2, 0, aw * 0.025, floorTop + ah * 0.1);
      b.fillRect(ax + aw * 0.975 - 2, 0, aw * 0.025, floorTop + ah * 0.1);
      b.fillRect(0, ah * 0.17, W, ah * 0.025);
      for (let x = (ax % 40) - 40; x < W; x += Math.max(26, aw * 0.08)) b.fillRect(x, 0, aw * 0.012, ah * 0.19);
      const leaves = ["#2f7a45", C.tarragon, "#4a9a55", C.tarragonLight];
      for (let x = -10, i = 0; x < W + 10; x += 9, i++) {
        const y = ah * 0.17 + Math.sin(i * 1.7) * ah * 0.025;
        blob(b, x, y, ah * (0.022 + ((i * 7) % 5) * 0.004), leaves[i % 4]!, 0);
        if (i % 3 === 0) blob(b, x + 4, y - ah * 0.06, ah * 0.02, leaves[(i + 1) % 4]!, 0);
      }
      for (const t of [0.08, 0.3, 0.55, 0.8]) {
        const gx = ax + aw * t;
        const gy = ah * 0.2;
        const gr = ah * 0.012;
        for (let r = 0; r < 4; r++) {
          for (let k = 0; k <= 3 - r; k++) blob(b, gx + (k - (3 - r) / 2) * gr * 1.7, gy + r * gr * 1.5, gr, k % 2 ? "#6a2f80" : "#4f2463", 0);
        }
      }
      // Warm evening light from the right.
      g = b.createLinearGradient(W, 0, 0, ah);
      g.addColorStop(0, "rgba(255,190,90,0.28)");
      g.addColorStop(1, "rgba(255,190,90,0)");
      b.fillStyle = g;
      b.fillRect(0, 0, W, ah);
      // Front paving under the buttons, lighter and calm.
      b.fillStyle = "#efe2cf";
      b.fillRect(0, ah, W, s.h - ah);
      b.fillStyle = "rgba(122,74,48,0.25)";
      b.fillRect(0, ah, W, 3);
      return c;
    };

    const layout = (s: Size) => {
      const ph = s.h - ah;
      const r = clamp(Math.min(s.w * 0.075, ph * 0.15), 27, 38);
      const L = Math.max(14, ax + 8);
      const R = Math.min(s.w - 14, ax + aw - 8);
      const y1 = ah + Math.max(r + 10, ph * 0.34);
      const y2 = y1 + r * 2.2;
      cBtn = { x: R - r * 3.4, y: y1, r };
      arrows = [
        { id: "left", x: L + r, y: y1 + r * 0.6, r },
        { id: "right", x: L + r * 3.4, y: y1 + r * 0.6, r },
        { id: "down", x: L + r * 2.2, y: y2 + r * 0.5, r },
        { id: "up", x: R - r, y: y1, r },
      ];
      return [
        ...arrows.map((a) => ({ ...a, icon: "" })),
        { id: "c" as const, x: cBtn.x, y: y1, r, icon: "🫓" },
        { id: "a" as const, x: R - r * 3.4, y: y2, r, icon: "✊" },
        { id: "b" as const, x: R - r, y: y2, r, icon: "🦶" },
      ];
    };

    const fit = fitCanvas(canvas, (s) => {
      ah = Math.round(s.h * 0.62);
      aw = Math.min(s.w, ah * 1.7);
      ax = (s.w - aw) / 2;
      u = ah / 300;
      ww = aw / u;
      floorY = ah * 0.93;
      bg = paintBg(s);
      for (const f of [P, B]) f.x = clamp(f.x, 28, ww - 28);
    });
    const ctx = fit.ctx;
    const pad = createPad(canvas, layout);

    const reset = () => {
      for (const f of [P, B]) {
        Object.assign(f, { x: ww * (f.cpu ? 0.72 : 0.28), y: 0, vx: 0, vy: 0, kb: 0, face: f.cpu ? -1 : 1, hp: 100, chip: 100, st: "idle", t: 0, done: false, inv: 0, cd: 0 });
      }
      discs = [];
      timer = ROUND;
      phase = "intro";
      phaseT = 0;
    };
    reset();

    const setSt = (f: Fighter, st: State) => {
      f.st = st;
      f.t = 0;
      f.done = false;
    };

    const burst = (x: number, y: number, n: number, stars: number) => {
      for (let i = 0; i < n + stars; i++) {
        const st = i >= n;
        const a = rand(0, Math.PI * 2);
        const sp = st ? rand(60, 120) : rand(20, 70);
        bits.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp + (st ? 80 : 20), life: 0, max: st ? 0.7 : 0.5, r: st ? 6 : rand(5, 9), star: st });
      }
    };

    const endRound = (winner: Fighter) => {
      phase = "ko";
      phaseT = 0;
      const loser = winner === P ? B : P;
      setSt(loser, "ko");
      setSt(winner, "win");
      winner.wins++;
      discs = [];
      if (winner === P) bonus += 300 + Math.ceil(timer) * 5;
      if (winner.wins >= 2) {
        over = true;
        if (winner === P) bonus += 1000;
      }
      setScore();
    };

    // from: +1 when the blow travels to the right.
    const hurt = (att: Fighter, def: Fighter, dmg: number, from: number, hx: number, hy: number) => {
      if (def.inv > 0 || def.st === "ko" || phase !== "fight") return false;
      const blocked = def.st === "block" && def.face === -from;
      const d = blocked ? dmg * 0.2 : dmg;
      def.hp = Math.max(0, def.hp - d);
      def.kb = from * (blocked ? 70 : 190);
      burst(hx, hy, blocked ? 3 : 6, blocked ? 0 : 3);
      if (!blocked) {
        setSt(def, "hit");
        def.inv = 0.4;
        def.vx = 0;
      }
      if (!att.cpu) {
        dealt += d;
        setScore();
      }
      if (!calm && !blocked) {
        shake = dmg >= 10 ? 0.2 : 0.1;
        stop = 0.05;
      }
      if (def.hp <= 0) endRound(att);
      return true;
    };

    const act = (f: Fighter, o: Fighter, dt: number, i: Intent) => {
      f.t += dt;
      f.inv = Math.max(0, f.inv - dt);
      f.cd = Math.max(0, f.cd - dt);
      const ground = f.y <= 0;
      const atk = f.st === "punch" || f.st === "kick" || f.st === "throw";
      if ((atk && f.t >= ATK[f.st as "punch"][0]) || (f.st === "hit" && f.t >= STUN)) setSt(f, "idle");
      if (phase === "fight") {
        if (f.st === "punch" || f.st === "kick") {
          const [, on, off, reach, dmg] = ATK[f.st];
          const dx = (o.x - f.x) * f.face;
          if (!f.done && f.t >= on && f.t <= off && dx > 0 && dx < reach + 16 && Math.abs(o.y - f.y) < 55) {
            f.done = true;
            hurt(f, o, dmg, f.face, f.x + f.face * (reach - 4), f.y + (f.st === "kick" ? 34 : 60));
          }
          if (ground) f.vx = 0;
        } else if (f.st === "throw") {
          if (ground) f.vx = 0;
          if (!f.done && f.t >= ATK.throw[1]) {
            f.done = true;
            discs.push({ x: f.x + f.face * 30, vx: f.face * 230, owner: f, spin: 0 });
          }
        } else if (f.st !== "hit") {
          if (ground) f.face = o.x > f.x ? 1 : -1;
          if (i.c && f.cd <= 0) {
            setSt(f, "throw");
            f.cd = 3;
          } else if (i.b) setSt(f, "kick");
          else if (i.a) setSt(f, "punch");
          else if (ground && i.jump) {
            f.vy = 430;
            f.vx = i.mv * WALK * 1.15;
            setSt(f, "idle");
          } else if (ground && i.block) {
            if (f.st !== "block") setSt(f, "block");
            f.vx = 0;
          } else if (ground) {
            f.vx = i.mv * WALK;
            const st: State = i.mv ? "walk" : "idle";
            if (f.st !== st) setSt(f, st);
          }
        }
      }
      if (f.st === "ko" || f.st === "win") f.vx = 0;
      if (!ground || f.vy > 0) {
        f.vy -= GRAV * dt;
        f.y += f.vy * dt;
        if (f.y <= 0) {
          f.y = 0;
          f.vy = 0;
          if (f.st === "idle") f.vx = 0;
        }
      }
      f.x = clamp(f.x + (f.vx + f.kb) * dt, 28, ww - 28);
      f.kb *= Math.exp(-7 * dt);
      f.chip = f.chip > f.hp ? Math.max(f.hp, f.chip - 30 * dt) : f.hp;
    };

    // The Baker's brain: a short think every half second, sharper each round.
    let think = 0;
    const aiHold = { mv: 0, block: false };
    const cpu = (dt: number): Intent => {
      const out: Intent = { mv: aiHold.mv, block: aiHold.block, jump: false, a: false, b: false, c: false };
      think -= dt;
      if (think > 0) return out;
      const lvl = Math.min(round, 3);
      think = rand(0.45, 0.65) - lvl * 0.06;
      const dx = P.x - B.x;
      const dist = Math.abs(dx);
      const dir = Math.sign(dx);
      const r = Math.random();
      aiHold.mv = 0;
      aiHold.block = false;
      const threat = discs.some((d) => d.owner === P && Math.abs(d.x - B.x) < 130 && Math.sign(B.x - d.x) === Math.sign(d.vx));
      const swing = (P.st === "punch" || P.st === "kick") && dist < 75;
      if ((threat || swing) && r < 0.15 + lvl * 0.12) {
        if (threat && Math.random() < 0.5) out.jump = true;
        else aiHold.block = true;
      } else if (dist < 48) {
        if (r < 0.35 + lvl * 0.1) out.a = true;
        else if (r < 0.55 + lvl * 0.08) out.b = true;
        else if (r < 0.75) aiHold.mv = -dir;
      } else if (dist < 66) {
        if (r < 0.3 + lvl * 0.1) out.b = true;
        else aiHold.mv = dir;
      } else if (dist > 110 && B.cd <= 0 && r < 0.2 + lvl * 0.08) out.c = true;
      else {
        aiHold.mv = dir;
        if (r > 0.93) out.jump = true;
      }
      out.mv = aiHold.mv;
      out.block = aiHold.block;
      return out;
    };

    const update = (dt: number) => {
      const s = pad.state;
      const me: Intent = { mv: (s.right ? 1 : 0) - (s.left ? 1 : 0), block: s.down, jump: pad.consume("up"), a: pad.consume("a"), b: pad.consume("b"), c: pad.consume("c") };
      if (stop > 0) {
        stop -= dt;
        return;
      }
      now += dt;
      shake = Math.max(0, shake - dt);
      phaseT += dt;
      if (phase === "intro" && phaseT > 1.4) phase = "fight";
      if (phase === "ko" && phaseT > (over ? 1.6 : 1.9)) {
        if (over) {
          if (!reported) {
            reported = true;
            api.gameOver(score);
          }
          return;
        }
        round++;
        reset();
        return;
      }
      const idle: Intent = { mv: 0, block: false, jump: false, a: false, b: false, c: false };
      const fight = phase === "fight";
      act(P, B, dt, fight ? me : idle);
      act(B, P, dt, fight ? cpu(dt) : idle);
      // Keep the two bodies apart.
      const gap = B.x - P.x;
      if (Math.abs(gap) < 34 && Math.abs(P.y - B.y) < 60) {
        const push = ((34 - Math.abs(gap)) / 2) * (gap >= 0 ? 1 : -1);
        P.x = clamp(P.x - push, 28, ww - 28);
        B.x = clamp(B.x + push, 28, ww - 28);
      }
      for (const d of discs) {
        d.x += d.vx * dt;
        d.spin += dt * 14;
        const o = d.owner === P ? B : P;
        if (Math.abs(o.x - d.x) < 20 && o.y < 38 && hurt(d.owner, o, 12, Math.sign(d.vx), d.x, 46)) d.x = -999;
      }
      if (discs.length === 2 && Math.abs(discs[0]!.x - discs[1]!.x) < 20) {
        burst(discs[0]!.x, 46, 8, 2);
        discs = [];
      }
      discs = discs.filter((d) => d.x > -20 && d.x < ww + 20);
      for (const b of bits) {
        b.life += dt;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.vy -= (b.star ? 260 : 30) * dt;
      }
      bits = bits.filter((b) => b.life < b.max);
      if (fight) {
        timer -= dt;
        if (timer <= 0) {
          timer = 0;
          endRound(B.hp > P.hp ? B : P); // a tie goes to the guest
        }
      }
    };

    // --- Drawing -----------------------------------------------------------

    const fighter = (f: Fighter) => {
      const baker = f.cpu;
      const cloth = baker ? "#f6ecd9" : "#ffffff";
      const shade = baker ? "#e2d2b4" : "#e3e8ea";
      const pants = baker ? "#7a5a3c" : "#33413a";
      const sx = ax + f.x * u;
      // Soft shadow on the floor.
      ctx.fillStyle = "rgba(70,30,15,0.25)";
      ctx.beginPath();
      ctx.ellipse(sx, floorY + 2, 24 * u * (1 - Math.min(0.5, f.y / 200)), 5 * u, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.save();
      let hop = 0;
      if (f.st === "win") hop = calm ? 0 : Math.abs(Math.sin(now * 6)) * 8;
      ctx.translate(sx, floorY - (f.y + hop) * u);
      ctx.scale(f.face * u, u);
      if (f.inv > 0 && !calm && Math.floor(now * 16) % 2) ctx.globalAlpha = 0.6;
      const e = ext(f);
      let hipY = -34 + Math.sin(now * 4 + (baker ? 1.3 : 0)) * 1.2;
      let lean = 0;
      let ff = [7, 0];
      let bf = [-9, 0];
      let fh = [16, -12];
      let bh = [-10, -10];
      const ko = f.st === "ko";
      if (f.st === "walk") {
        const w = Math.sin(f.t * 12);
        ff = [7 + w * 9, -Math.max(0, w) * 4];
        bf = [-9 - w * 9, -Math.max(0, -w) * 4];
        hipY -= Math.abs(w) * 1.5;
      } else if (f.st === "punch" || f.st === "throw") {
        fh = [16 + 24 * e, -14 - (f.st === "throw" ? 14 : 8) * e];
        lean = 0.12 * e;
      } else if (f.st === "kick") {
        ff = [7 + 38 * e, -30 * e];
        bf = [-9 - 4 * e, 0];
        fh = [12, -20];
        bh = [-14, -28];
        lean = -0.3 * e;
      } else if (f.st === "block") {
        hipY = -30;
        fh = [14, -34];
        bh = [10, -28];
      } else if (f.st === "hit") {
        lean = -0.35;
        fh = [4, -40];
        bh = [-16, -36];
      } else if (f.st === "win") {
        fh = [24, -46];
      } else if (ko) {
        hipY = -9;
        ff = [26, -2];
        bf = [18, 0];
        lean = -0.3 + Math.sin(now * 3) * (calm ? 0 : 0.08);
        fh = [12, 4];
        bh = [-14, 6];
      }
      if (f.y > 0 && !ko && f.st !== "kick") {
        ff = [10, -16];
        bf = [-6, -10];
      }
      limb(ctx, -4, hipY, bf[0]!, bf[1]! - 3, 8, pants);
      blob(ctx, bf[0]! + 3, bf[1]! - 2, 4.5, INK, 0);
      limb(ctx, 4, hipY, ff[0]!, ff[1]! - 3, 8, pants);
      blob(ctx, ff[0]! + 3, ff[1]! - 2, 4.5, INK, 0);
      ctx.translate(0, hipY);
      ctx.rotate(lean);
      // Back arm, body, head, front arm with the tool.
      limb(ctx, -2, -24, bh[0]!, bh[1]!, 7, shade);
      blob(ctx, bh[0]!, bh[1]!, 4, SKIN, 1.6);
      ctx.fillStyle = cloth;
      roundRect(ctx, baker ? -17 : -14, -31, baker ? 34 : 28, baker ? 37 : 34, baker ? 13 : 9);
      ctx.fill();
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = INK;
      ctx.stroke();
      if (baker) {
        ctx.fillStyle = C.tarragon;
        roundRect(ctx, -6, -18, 22, 24, 5);
        ctx.fill();
        ctx.stroke();
        limb(ctx, 2, -18, 2, -30, 1, C.tarragon);
        ctx.fillStyle = "rgba(255,255,255,0.8)";
        for (const [x, y] of [[-10, -22], [6, -8], [12, -2], [-4, -4], [10, -26], [-12, -10]]) ctx.fillRect(x!, y!, 2.2, 2.2);
      } else {
        for (let k = 0; k < 3; k++) {
          blob(ctx, 3, -22 + k * 7, 1.6, C.line, 0);
          blob(ctx, 9, -22 + k * 7, 1.6, C.line, 0);
        }
        const flap = Math.sin(now * 9) * (calm ? 0 : 2);
        ctx.fillStyle = C.apricot;
        ctx.beginPath();
        ctx.moveTo(-8, -30);
        ctx.lineTo(-20, -24 + flap);
        ctx.lineTo(-18, -18 + flap);
        ctx.lineTo(-4, -26);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.ellipse(2, -30, 11, 4.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      blob(ctx, 3, -44, 13, SKIN);
      // Face: eyes change with the mood.
      ctx.strokeStyle = INK;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      if (ko) {
        for (const ex of [5, 11]) {
          ctx.moveTo(ex - 2, -48);
          ctx.lineTo(ex + 2, -44);
          ctx.moveTo(ex + 2, -48);
          ctx.lineTo(ex - 2, -44);
        }
      } else if (f.st === "hit") {
        ctx.moveTo(6, -49);
        ctx.lineTo(10, -46);
        ctx.lineTo(6, -43);
      } else if (f.st === "win") {
        ctx.arc(9, -45, 2.5, Math.PI, 0);
      } else {
        ctx.moveTo(5, -51);
        ctx.lineTo(12, -50);
      }
      ctx.stroke();
      if (!ko && f.st !== "hit" && f.st !== "win") blob(ctx, 9, -46, 2, INK, 0);
      blob(ctx, 15.5, -42, 3.4, "#e9a77e", 1.4);
      if (baker) {
        ctx.fillStyle = "#4a2f1e";
        ctx.beginPath();
        ctx.ellipse(10, -37, 8, 3.2, -0.15, 0, Math.PI * 2);
        ctx.ellipse(1, -37.5, 5, 2.6, 0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = cloth;
        ctx.beginPath();
        ctx.ellipse(2, -55, 15, 6, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        blob(ctx, 7, -38, 2.4, "#f19a8a", 0);
        ctx.beginPath();
        ctx.arc(11, -36, 3, 0.2, 2.2);
        ctx.stroke();
        for (const [x, y, r] of [[-6, -66, 7], [12, -66, 7], [3, -71, 8.5]]) blob(ctx, x!, y!, r!, "#ffffff");
        ctx.fillStyle = "#ffffff";
        roundRect(ctx, -9, -63, 24, 10, 2);
        ctx.fill();
        ctx.stroke();
      }
      const ang = Math.atan2(fh[1]! + 24, fh[0]! - 4);
      const cx = Math.cos(ang);
      const cy = Math.sin(ang);
      const [hx, hy] = [fh[0]!, fh[1]!];
      limb(ctx, 4, -24, hx, hy, 7.5, cloth);
      if (baker) {
        limb(ctx, hx + cy * 12, hy - cx * 12, hx - cy * 12, hy + cx * 12, 6, "#d9a066");
      } else {
        limb(ctx, hx - cx * 3, hy - cy * 3, hx + cx * 15, hy + cy * 15, 2, "#9aa6ad");
        blob(ctx, hx + cx * 20, hy + cy * 20, 5.5, "#c7d0d5", 1.8);
      }
      blob(ctx, hx, hy, 4.5, SKIN, 1.6);
      if (ko) {
        for (let k = 0; k < 3; k++) {
          const a = now * 3 + (k * Math.PI * 2) / 3;
          star(ctx, 3 + Math.cos(a) * 16, -62 + Math.sin(a) * 5, 4.5, now * 4);
        }
      }
      ctx.restore();
    };

    const disc = (d: Disc) => {
      const x = ax + d.x * u;
      const y = floorY - 46 * u;
      const r = 12 * u;
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        ctx.moveTo(x - Math.sign(d.vx) * (r + 4), y - r * 0.5 + k * r * 0.5);
        ctx.lineTo(x - Math.sign(d.vx) * (r + 16 + k * 4), y - r * 0.5 + k * r * 0.5);
      }
      ctx.stroke();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(d.spin);
      blob(ctx, 0, 0, r, "#f3d9a4", 2);
      ctx.fillStyle = "#c98f4a";
      for (let k = 0; k < 5; k++) {
        ctx.beginPath();
        ctx.arc(Math.cos(k * 1.3) * r * 0.55, Math.sin(k * 2.1) * r * 0.5, r * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const bar = (f: Fighter, left: boolean) => {
      const cx = ax + aw / 2;
      const bw = Math.min(aw * 0.36, 230);
      const bh = 14;
      const y = 12;
      const x0 = left ? cx - 30 - bw : cx + 30;
      ctx.fillStyle = "rgba(19,36,27,0.55)";
      roundRect(ctx, x0 - 2, y - 2, bw + 4, bh + 4, 9);
      ctx.fill();
      const part = (v: number, color: string) => {
        const w = (bw * v) / 100;
        if (w < 1) return;
        ctx.fillStyle = color;
        roundRect(ctx, left ? x0 : x0 + bw - w, y, w, bh, 7);
        ctx.fill();
      };
      part(f.chip, "#ffe08a");
      part(f.hp, left ? C.tarragon : C.pomegranate);
      const ix = left ? x0 + 12 : x0 + bw - 12;
      glyph(ctx, left ? "👨‍🍳" : "🥖", ix, y + bh + 16, 20);
      for (let k = 0; k < 2; k++) {
        const mx = ix + (left ? 1 : -1) * (24 + k * 16);
        blob(ctx, mx, y + bh + 16, 5.5, k < f.wins ? C.apricot : "rgba(251,252,248,0.5)", 1.8);
      }
    };

    const draw = () => {
      const s = fit.size();
      ctx.clearRect(0, 0, s.w, s.h);
      if (bg) ctx.drawImage(bg, 0, 0, s.w, s.h);
      ctx.save();
      if (shake > 0) ctx.translate(rand(-4, 4) * shake * 5, rand(-3, 3) * shake * 5);
      fighter(B);
      fighter(P);
      for (const d of discs) disc(d);
      for (const b of bits) {
        const k = 1 - b.life / b.max;
        const x = ax + b.x * u;
        const y = floorY - b.y * u;
        ctx.globalAlpha = Math.min(1, k * 1.6);
        if (b.star) star(ctx, x, y, b.r * u, b.life * 8);
        else blob(ctx, x, y, b.r * u * (1.6 - k * 0.6), "#fffaf0", 0);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      // HUD: health bars, round markers, the clock.
      bar(P, true);
      bar(B, false);
      const cx = ax + aw / 2;
      blob(ctx, cx, 22, 21, C.matsoni, 2.5);
      label(ctx, String(Math.ceil(timer)), cx, 23, 19, timer < 10 ? C.pomegranate : INK);
      if (phase === "intro") {
        const p = Math.min(1, phaseT / 0.3);
        const r = ah * 0.13 * (calm ? 1 : 0.6 + 0.4 * p);
        blob(ctx, cx, ah * 0.42, r, C.apricot, 4);
        label(ctx, String(round), cx, ah * 0.42 + 2, r * 1.2, INK);
      }
      if (phase === "ko" && over) glyph(ctx, "🏆", ax + (P.st === "win" ? P : B).x * u, floorY - 140 * u, 34);
      // The pad: arrows drawn as triangles, actions as icons.
      pad.draw(ctx, s);
      ctx.fillStyle = C.matsoni;
      for (const a of arrows) {
        const rot = { left: Math.PI, right: 0, up: -Math.PI / 2, down: Math.PI / 2 }[a.id as "up"];
        const k = a.r * 0.42;
        ctx.beginPath();
        for (let i = 0; i < 3; i++) {
          const t = rot + (i * Math.PI * 2) / 3;
          ctx.lineTo(a.x + Math.cos(t) * k, a.y + Math.sin(t) * k);
        }
        ctx.fill();
      }
      // Lavash cooldown ring.
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      ctx.strokeStyle = P.cd > 0 ? C.apricot : C.tarragonLight;
      ctx.beginPath();
      ctx.arc(cBtn.x, cBtn.y, cBtn.r + 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - P.cd / 3));
      ctx.stroke();
    };

    const stopLoop = loop(api, (dt, paused) => {
      if (!paused && !reported) update(dt);
      draw();
    });

    return () => {
      stopLoop();
      pad.stop();
      fit.stop();
      canvas.style.touchAction = prevTouch;
    };
  },
};
