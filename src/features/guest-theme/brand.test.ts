import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BRAND_FONTS,
  EMPTY_BRAND,
  brandJson,
  brandPage,
  brandTokens,
  googleFontsHref,
  ignoredRoles,
  mix,
  parseBrand,
  type Brand,
} from "./brand";
import { brandStyle, contrast, GUEST_THEMES } from "./themes";

// Blanca by Melonpan, from the approved design (Brand.dc.html).
const BLANCA: Brand = {
  colors: { header: "#3e312f", accent: "#705d4c", highlight: "#c49871", line: "#ead7bf", page: "#f9f0e3" },
  headingFont: "Cormorant",
  bodyFont: "Jost",
  scriptFont: "Great Vibes",
  plate: "porcelain",
  wordmark: "r1/brand/1.webp",
};
const vars = (s: unknown) => (s ?? {}) as Record<string, string>;

describe("parseBrand", () => {
  it("reads nothing as no brand", () => {
    for (const raw of [null, undefined, "x", [], {}, { colors: {} }, { plate: "gold" }])
      expect(parseBrand(raw)).toBeNull();
  });

  it("keeps only known roles, #rrggbb colours (lowercased) and listed fonts of the right kind", () => {
    const b = parseBrand({
      colors: { header: "#3E312F", sky: "#ffffff", accent: "brown" },
      heading_font: "Comic Sans MS",
      body_font: "Cormorant", // a serif is not a body font
      script_font: "Great Vibes",
      plate: "dark",
      wordmark: "r1/brand/1.webp",
    });
    expect(b).toEqual({
      colors: { header: "#3e312f" },
      headingFont: null,
      bodyFont: null,
      scriptFont: "Great Vibes",
      plate: "dark",
      wordmark: "r1/brand/1.webp",
    });
  });

  it("round-trips through brandJson", () => {
    expect(parseBrand(brandJson(BLANCA))).toEqual(BLANCA);
    expect(brandJson(EMPTY_BRAND)).toBeNull();
  });
});

describe("brandTokens", () => {
  it("without a brand is exactly today's look", () => {
    for (const theme of GUEST_THEMES) {
      expect(brandTokens(theme, null).style).toBeUndefined();
      expect(brandTokens(theme, null, "#c2185b").style).toEqual(brandStyle(theme, "#c2185b"));
    }
  });

  it("maps Blanca's five colours onto their roles on Pure", () => {
    const { style, check } = brandTokens("soft", BLANCA);
    const v = vars(style);
    expect(check.ignored).toEqual([]);
    expect(v["--guest-page"]).toBe("#f9f0e3");
    expect(v["--brand-header"]).toBe("#3e312f");
    expect(v["--guest-accent"]).toBe("#3e312f"); // filled buttons
    expect(v["--brand-on-header"]).toBe("#f9f0e3"); // cream on espresso
    expect(v["--guest-accent-text"]).toBe("#705d4c"); // prices
    expect(v["--guest-tab"]).toBe("#705d4c");
    expect(v["--guest-badge"]).toBe("#c49871");
    expect(v["--guest-line"]).toBe("#ead7bf");
    expect(v["--font-display"]).toMatch(/^"Cormorant", var\(--font-noto-serif-armenian\)/);
    expect(v["--font-ui"]).toMatch(/^"Jost", var\(--font-noto-sans-armenian\)/);
    expect(v["--brand-font-script"]).toMatch(/^"Great Vibes"/);
  });

  it("keeps every text pair it sets at WCAG AA", () => {
    const v = vars(brandTokens("soft", BLANCA).style);
    const page = v["--guest-page"]!;
    expect(contrast(v["--brand-on-header"]!, v["--brand-header"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v["--brand-on-header-muted"]!, v["--brand-header"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v["--guest-accent-text"]!, page)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v["--guest-accent-text"]!, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v["--guest-on-tab"]!, v["--guest-tab"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v["--guest-on-badge"]!, v["--guest-badge"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v["--guest-on-accent"]!, v["--guest-accent"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v["--guest-muted"]!, page)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(v["--guest-title"]!, page)).toBeGreaterThanOrEqual(3);
  });

  it("ignores a page the theme's ink can't be read on, and a pale accent for text", () => {
    const pale: Brand = { ...EMPTY_BRAND, colors: { page: "#333333", accent: "#ead7bf" } };
    expect(ignoredRoles("soft", pale)).toEqual(["page", "accent"]);
    const v = vars(brandTokens("soft", pale).style);
    expect(v["--guest-page"]).toBeUndefined();
    expect(v["--guest-accent-text"]).toBeUndefined();
    expect(brandPage(pale, "soft")).toBeNull();
    // Wine is dark: a light page would turn its white ink unreadable.
    expect(ignoredRoles("wine", { ...EMPTY_BRAND, colors: { page: "#f9f0e3" } })).toEqual(["page"]);
  });
});

describe("googleFontsHref", () => {
  it("asks only for the chosen families and the weights each has", () => {
    expect(googleFontsHref(null)).toBeNull();
    expect(googleFontsHref(EMPTY_BRAND)).toBeNull();
    expect(googleFontsHref(BLANCA)).toBe(
      "https://fonts.googleapis.com/css2?family=Cormorant:wght@300;400;500&family=Jost:wght@300;400;500;600;700&family=Great+Vibes&display=swap",
    );
    expect(googleFontsHref({ ...EMPTY_BRAND, headingFont: "Prata", bodyFont: "PT Sans" })).toBe(
      "https://fonts.googleapis.com/css2?family=Prata&family=PT+Sans:wght@400;700&display=swap",
    );
  });
});

it("mix blends two colours", () => {
  expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  expect(mix("#3e312f", "#3e312f", 0.3)).toBe("#3e312f");
});

it("the font list matches private.brand_fonts() in the migration", () => {
  const sql = readFileSync("supabase/migrations/20261119100000_brand_profile.sql", "utf8");
  const start = sql.indexOf("select array[", sql.indexOf("create function private.brand_fonts()"));
  const body = sql.slice(start, sql.indexOf("]", start));
  const inSql = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  expect(inSql).toEqual(BRAND_FONTS.map((f) => f.family).sort());
});
