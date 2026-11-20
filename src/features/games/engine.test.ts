import { describe, expect, it } from "vitest";
import { afterEach, vi } from "vitest";
import {
  brandPalette,
  C,
  createFrameMeter,
  DPR_STEPS,
  loop,
  lowerDpr,
  rgbToHex,
  type GameApi,
} from "./engine";
import { GAMES } from "./registry";

describe("lowerDpr", () => {
  it("steps 2 → 1.5 → 1 and stops at 1", () => {
    expect(lowerDpr(2)).toBe(1.5);
    expect(lowerDpr(1.5)).toBe(1);
    expect(lowerDpr(1)).toBeNull();
  });
  it("lands on the next step below an odd device ratio", () => {
    expect(lowerDpr(1.75)).toBe(1.5);
    expect(lowerDpr(1.3)).toBe(1);
  });
  it("never goes below 1x", () => {
    expect(Math.min(...DPR_STEPS)).toBe(1);
  });
});

describe("createFrameMeter", () => {
  const feed = (meter: ReturnType<typeof createFrameMeter>, ms: number, n: number) => {
    let fired = 0;
    for (let i = 0; i < n; i++) if (meter.add(ms)) fired++;
    return fired;
  };

  it("stays quiet on a phone that holds 60 fps", () => {
    expect(feed(createFrameMeter(45, 24), 16.7, 600)).toBe(0);
  });
  it("fires once per slow window, after the warm-up", () => {
    const meter = createFrameMeter(45, 24);
    // 20 warm-up frames are ignored, then one window of 45 slow frames.
    expect(feed(meter, 40, 64)).toBe(0);
    expect(feed(meter, 40, 1)).toBe(1);
  });
  it("waits for the new resolution to settle before judging again", () => {
    const meter = createFrameMeter(45, 24);
    feed(meter, 40, 65);
    // After firing, 20 frames are skipped and a full window is needed.
    expect(feed(meter, 40, 64)).toBe(0);
    expect(feed(meter, 40, 1)).toBe(1);
  });
  it("ignores a single hitch inside an otherwise smooth window", () => {
    const meter = createFrameMeter(45, 24);
    feed(meter, 16.7, 20);
    let fired = 0;
    for (let i = 0; i < 45; i++) if (meter.add(i === 10 ? 200 : 16.7)) fired++;
    expect(fired).toBe(0);
  });
  it("starts over after reset (a tab coming back)", () => {
    const meter = createFrameMeter(45, 24);
    feed(meter, 40, 50);
    meter.reset();
    expect(feed(meter, 40, 64)).toBe(0);
  });
});

describe("registry", () => {
  it("lists five games with ids only, no emoji icons", () => {
    expect(GAMES.map((g) => g.id)).toEqual(["runner", "fighter", "merge", "slice", "platformer"]);
    for (const g of GAMES) expect(Object.keys(g).sort()).toEqual(["id", "load"]);
  });
});

describe("rgbToHex", () => {
  it("reads computed colours", () => {
    expect(rgbToHex("rgb(30, 33, 38)")).toBe("#1e2126");
    expect(rgbToHex("rgba(224, 163, 58, 1)")).toBe("#e0a33a");
    expect(rgbToHex("not a colour")).toBeNull();
  });
});

describe("brandPalette", () => {
  const soft: Record<string, string> = {
    "--guest-deep": "#1e2126",
    "--guest-deep-2": "#272b31",
    "--guest-deep-3": "#353a42",
    "--guest-deep-ink": "#ffffff",
    "--guest-deep-accent": "#e0a33a",
    "--guest-success-on-deep": "#8cd3a8",
  };
  const from = (m: Record<string, string>) => (t: string) => m[t] ?? null;
  it("takes the theme's tokens", () => {
    const p = brandPalette(from(soft));
    expect(p.basalt).toBe("#1e2126");
    expect(p.apricot).toBe("#e0a33a");
    expect(p.matsoni).toBe("#ffffff");
  });
  it("keeps the defaults when tokens are missing", () => {
    expect(brandPalette(() => null).apricot).toBe("#f2a23a");
  });
  it("ignores an accent that is unreadable on the panel", () => {
    expect(brandPalette(from({ ...soft, "--guest-deep-accent": "#2a2f36" })).apricot).toBe("#f2a23a");
  });
  it("ignores an accent that collides with the tomato red", () => {
    expect(brandPalette(from({ ...soft, "--guest-deep-accent": "#e10600" })).apricot).toBe("#f2a23a");
  });
});

describe("loop and the hidden tab", () => {
  const frames: ((t: number) => void)[] = [];
  let hidden = false;
  const listeners = new Map<string, () => void>();
  const stub = () => {
    vi.stubGlobal("performance", { now: () => 0 });
    vi.stubGlobal("requestAnimationFrame", (cb: (t: number) => void) => frames.push(cb));
    vi.stubGlobal("cancelAnimationFrame", () => frames.splice(0));
    vi.stubGlobal("document", {
      get hidden() {
        return hidden;
      },
      addEventListener: (n: string, f: () => void) => listeners.set(n, f),
      removeEventListener: (n: string) => listeners.delete(n),
    });
    vi.stubGlobal("window", {
      addEventListener: (n: string, f: () => void) => listeners.set(n, f),
      removeEventListener: (n: string) => listeners.delete(n),
    });
  };
  afterEach(() => {
    vi.unstubAllGlobals();
    frames.splice(0);
    listeners.clear();
    hidden = false;
  });
  it("schedules no frame while hidden, and resumes with a clamped step", () => {
    stub();
    const dts: number[] = [];
    const stop = loop({ isPaused: () => false } as unknown as GameApi, (dt) => dts.push(dt));
    expect(frames).toHaveLength(1);
    hidden = true;
    listeners.get("visibilitychange")!();
    expect(frames).toHaveLength(0); // the pending frame was cancelled, none queued
    hidden = false;
    listeners.get("visibilitychange")!();
    expect(frames).toHaveLength(1);
    frames[0]!(60_000); // a minute later: the game still steps at most 50 ms
    expect(dts[0]).toBeLessThanOrEqual(0.05);
    stop();
    expect(listeners.size).toBe(0);
  });
  it("stops on pagehide and restarts on pageshow", () => {
    stub();
    const stop = loop({ isPaused: () => false } as unknown as GameApi, () => {});
    listeners.get("pagehide")!();
    expect(frames).toHaveLength(0);
    listeners.get("pageshow")!();
    expect(frames).toHaveLength(1);
    stop();
  });
  it("C holds the defaults until a brand is applied", () => {
    expect(C.apricot).toBe("#f2a23a");
  });
});
