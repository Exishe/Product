import { describe, expect, it } from "vitest";
import { levelFor, parseClaim, parseOffer, pickText, rewardLine, shouldClaim, MAX_LEVEL } from "./rewards";

const offer = (over: Record<string, unknown> = {}) =>
  parseOffer({ on: true, kind: "percent", level: 3, percent: 10, text: {}, game: null, claim: null, ...over })!;

describe("levelFor", () => {
  it("starts at 1 and climbs by the game's step", () => {
    expect(levelFor("runner", 0)).toBe(1);
    expect(levelFor("runner", 49)).toBe(1);
    expect(levelFor("runner", 50)).toBe(2);
    expect(levelFor("merge", 399)).toBe(2);
    expect(levelFor("merge", 400)).toBe(3);
  });
  it("is capped and tolerates nonsense", () => {
    expect(levelFor("slice", 1e9)).toBe(MAX_LEVEL);
    expect(levelFor("slice", -5)).toBe(1);
    expect(levelFor("slice", NaN)).toBe(1);
    expect(levelFor("chess", 500)).toBe(1);
  });
});

describe("parseOffer", () => {
  it("reads an offer and refuses what it does not know", () => {
    expect(offer().level).toBe(3);
    expect(parseOffer({ on: false })).toBeNull();
    expect(parseOffer(null)).toBeNull();
    expect(parseOffer({ on: true, level: 1 })).toBeNull();
    expect(parseOffer({ on: true, level: 99 })).toBeNull();
  });
  it("keeps an earned claim even when rewards were switched off", () => {
    const o = parseOffer({ on: false, claim: { id: "c", kind: "percent", percent: 10, level: 3, game: "runner", status: "open" } });
    expect(o?.on).toBe(false);
    expect(o?.claim?.percent).toBe(10);
  });
});

describe("parseClaim", () => {
  it("defaults to open and drops a bad kind", () => {
    expect(parseClaim({ id: "c", kind: "text", text: { hy: "Սուրճ" } })?.status).toBe("open");
    expect(parseClaim({ id: "c", kind: "other" })).toBeNull();
    expect(parseClaim({ id: "c", kind: "text", status: "applied" })?.status).toBe("applied");
  });
});

describe("shouldClaim", () => {
  it("claims at the goal level in any game", () => {
    expect(shouldClaim(offer(), "runner", 99)).toBe(false); // level 2
    expect(shouldClaim(offer(), "runner", 100)).toBe(true); // level 3
  });
  it("respects the chosen game, off, and an existing claim", () => {
    expect(shouldClaim(offer({ game: "merge" }), "runner", 5000)).toBe(false);
    expect(shouldClaim(offer({ game: "merge" }), "merge", 400)).toBe(true);
    expect(shouldClaim({ ...offer(), on: false }, "runner", 5000)).toBe(false);
    const claimed = offer({ claim: { id: "c", kind: "percent", percent: 10, level: 3, game: "runner", status: "open" } });
    expect(shouldClaim(claimed, "runner", 5000)).toBe(false);
  });
});

describe("wording", () => {
  it("falls back to Armenian, then any language", () => {
    expect(pickText({ hy: "Ա", en: "A" }, "ru")).toBe("Ա");
    expect(pickText({ en: "A" }, "ru")).toBe("A");
    expect(pickText({}, "hy")).toBe("");
  });
  it("words a percent or shows the text", () => {
    const word = (p: number) => `${p}% off`;
    expect(rewardLine({ kind: "percent", percent: 10, text: {} }, "en", word)).toBe("10% off");
    expect(rewardLine({ kind: "text", percent: null, text: { en: "Free coffee" } }, "en", word)).toBe("Free coffee");
  });
});
