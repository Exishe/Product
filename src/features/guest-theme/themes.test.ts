import { describe, expect, it } from "vitest";
import {
  GUEST_THEMES,
  RECOMMENDED_THEME,
  THEME_CHOICES,
  brandStyle,
  contrast,
  guestTheme,
  themeColor,
} from "./themes";

describe("guest themes", () => {
  it("falls back to Evening for a missing or unknown theme", () => {
    expect(guestTheme(undefined)).toBe("evening");
    expect(guestTheme("coffee")).toBe("evening");
    expect(guestTheme("wine")).toBe("wine");
  });

  it("gives the browser bar the page colour", () => {
    expect(themeColor("wine")).toBe("#260212");
    expect(themeColor("soft")).toBe("#eceef1");
  });

  it("keeps the presets' text pairs at AA", () => {
    expect(contrast("#ffffff", "#e10600")).toBeGreaterThanOrEqual(4.5); // white on the red
    expect(contrast("#ffc7c6", "#4f0423")).toBeGreaterThanOrEqual(4.5); // blush on burgundy
    expect(contrast("#8a5a00", "#eceef1")).toBeGreaterThanOrEqual(4.5); // small amber text in Pure, on the page
    expect(contrast("#8a5a00", "#ffffff")).toBeGreaterThanOrEqual(4.5); // … and on a card
    expect(contrast("#5f6570", "#eceef1")).toBeGreaterThanOrEqual(4.5); // grey meta in Pure
    expect(contrast("#1b1d21", "#e0a33a")).toBeGreaterThanOrEqual(4.5); // black on the amber badge
    expect(contrast("#e9ecef", "#1e2126")).toBeGreaterThanOrEqual(4.5); // the initial on a dark plate
    expect(contrast("#7f6135", "#f6f1e7")).toBeGreaterThanOrEqual(4.5); // small gold text in Evening
  });

  it("offers Pure (stored as soft) first, as recommended", () => {
    expect(THEME_CHOICES[0]).toBe("soft");
    expect(RECOMMENDED_THEME).toBe("soft");
    expect([...THEME_CHOICES].sort()).toEqual([...GUEST_THEMES].sort());
  });

  it("lets a brand colour take over the accent, with readable text on it", () => {
    expect(brandStyle("soft", null)).toBeUndefined();
    expect(brandStyle("soft", "red")).toBeUndefined();
    const dark = brandStyle("soft", "#1d4ed8") as Record<string, string>;
    expect(dark["--guest-accent"]).toBe("#1d4ed8");
    expect(dark["--guest-on-accent"]).toBe("#ffffff");
    expect(dark["--guest-accent-text"]).toBe("#1d4ed8");
    expect(dark["--guest-badge"]).toBe("#1d4ed8"); // Pure's amber roles follow the brand too
    expect(dark["--guest-on-tab"]).toBe("#ffffff");
    const light = brandStyle("evening", "#f5d90a") as Record<string, string>;
    expect(light["--guest-on-accent"]).toBe("#000000");
    // too light for small text on ivory: the theme's own accent text stays
    expect(light["--guest-accent-text"]).toBeUndefined();
  });
});
