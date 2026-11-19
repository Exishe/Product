import { describe, expect, it } from "vitest";
import { createFrameMeter, DPR_STEPS, lowerDpr } from "./engine";
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
