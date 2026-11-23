import { describe, expect, it } from "vitest";
import { isLiveNow, localNow, promoFromRow, titleOf, validWindow } from "./model";

describe("promos model", () => {
  it("reads a row, trimming the dates to the minute", () => {
    const p = promoFromRow({
      id: "p",
      title: { hy: "Ակցիա", xx: "no" },
      body: {},
      badge: "-20%",
      is_on: true,
      starts_at: "2026-11-23T18:00:00",
      ends_at: null,
    });
    expect(p).toEqual({
      id: "p",
      title: { hy: "Ակցիա" },
      text: {},
      badge: "-20%",
      isOn: true,
      startsAt: "2026-11-23T18:00",
      endsAt: null,
    });
    expect(titleOf(p)).toBe("Ակցիա");
  });

  it("tells the café's wall clock from the server's", () => {
    const at = Date.parse("2026-11-23T20:30:00Z");
    expect(localNow("Asia/Yerevan", at)).toBe("2026-11-24T00:30");
    expect(localNow("UTC", at)).toBe("2026-11-23T20:30");
  });

  it("is live only when on and inside the window, the end excluded", () => {
    const base = { isOn: true, startsAt: "2026-11-23T10:00", endsAt: "2026-11-23T12:00" };
    expect(isLiveNow(base, "2026-11-23T09:59")).toBe(false);
    expect(isLiveNow(base, "2026-11-23T10:00")).toBe(true);
    expect(isLiveNow(base, "2026-11-23T11:59")).toBe(true);
    expect(isLiveNow(base, "2026-11-23T12:00")).toBe(false);
    expect(isLiveNow({ ...base, isOn: false }, "2026-11-23T11:00")).toBe(false);
    expect(isLiveNow({ isOn: true, startsAt: null, endsAt: null }, "2026-11-23T11:00")).toBe(true);
  });

  it("an end must come after the start", () => {
    expect(validWindow("2026-11-23T10:00", "2026-11-23T10:00")).toBe(false);
    expect(validWindow("2026-11-23T10:00", "2026-11-23T10:01")).toBe(true);
    expect(validWindow(null, "2026-11-23T10:00")).toBe(true);
  });
});
