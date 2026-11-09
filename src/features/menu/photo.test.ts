import { describe, expect, it } from "vitest";
import { fitWithin } from "./photo";

describe("fitWithin", () => {
  it("shrinks a landscape photo so its long side is 600 px", () => {
    expect(fitWithin(4000, 3000, 600)).toEqual({ width: 600, height: 450 });
  });

  it("shrinks a portrait photo by its height", () => {
    expect(fitWithin(3000, 4000, 600)).toEqual({ width: 450, height: 600 });
  });

  it("never enlarges a small photo", () => {
    expect(fitWithin(400, 300, 600)).toEqual({ width: 400, height: 300 });
  });
});
