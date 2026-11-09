import { describe, expect, it } from "vitest";
import { offsetFromSamples, parseServerTime } from "./server-clock";

describe("offsetFromSamples", () => {
  it("assumes the server read its clock halfway through the round trip", () => {
    expect(offsetFromSamples([{ sentAt: 1_000, receivedAt: 1_200, serverNow: 5_100 }])).toBe(4_000);
  });

  it("corrects a tablet whose clock is two hours behind", () => {
    const real = Date.UTC(2026, 10, 13, 18, 30);
    const device = real - 2 * 3_600_000;
    const offset = offsetFromSamples([{ sentAt: device, receivedAt: device + 80, serverNow: real + 40 }]);
    expect(offset).toBe(2 * 3_600_000);
  });

  it("trusts the sample with the shortest round trip", () => {
    const offset = offsetFromSamples([
      { sentAt: 0, receivedAt: 900, serverNow: 1_000 }, // slow: answer delayed on the way back
      { sentAt: 2_000, receivedAt: 2_060, serverNow: 2_530 },
      { sentAt: 4_000, receivedAt: 4_400, serverNow: 4_700 },
    ]);
    expect(offset).toBe(500);
  });

  it("ignores impossible or useless samples", () => {
    expect(
      offsetFromSamples([
        { sentAt: 1_000, receivedAt: 900, serverNow: 5_000 }, // answer before the question
        { sentAt: 0, receivedAt: 15_000, serverNow: 5_000 }, // 15 s round trip says nothing useful
        { sentAt: 0, receivedAt: 100, serverNow: Number.NaN },
      ]),
    ).toBeNull();
    expect(offsetFromSamples([])).toBeNull();
  });
});

describe("parseServerTime", () => {
  it("reads the time route's answer", () => {
    expect(parseServerTime({ now: 1_789_000_000_000 })).toBe(1_789_000_000_000);
  });

  it("refuses anything else", () => {
    expect(parseServerTime({ now: "soon" })).toBeNull();
    expect(parseServerTime(null)).toBeNull();
    expect(parseServerTime({ now: -1 })).toBeNull();
  });
});
