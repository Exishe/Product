import { readdirSync, readFileSync } from "node:fs";
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
  pickWordmark,
  wordmarkBackgrounds,
  wordmarkTones,
  type Brand,
} from "./brand";
import { brandStyle, contrast, GUEST_THEMES, THEME_FACTS } from "./themes";

// Blanca by Melonpan, from the approved design (Brand.dc.html).
const BLANCA: Brand = {
  colors: { header: "#3e312f", accent: "#705d4c", highlight: "#c49871", line: "#ead7bf", page: "#f9f0e3" },
  headingFont: "Cormorant",
  bodyFont: "Jost",
  scriptFont: "Great Vibes",
  plate: "porcelain",
  wordmark: "r1/brand/1.webp",
  wordmarkDark: "r1/brand/2.webp",
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
      wordmarkDark: null,
    });
  });

  it("reads the dark wordmark when the brand has one (ADR-065), alone or with the light one", () => {
    expect(parseBrand({ wordmark: "r1/brand/1.webp", wordmark_dark: "r1/brand/2.webp" })).toMatchObject({
      wordmark: "r1/brand/1.webp",
      wordmarkDark: "r1/brand/2.webp",
    });
    expect(parseBrand({ wordmark_dark: "r1/brand/2.webp" })).toMatchObject({
      wordmark: null,
      wordmarkDark: "r1/brand/2.webp",
    });
    for (const bad of [7, "", null, { path: "x" }]) expect(parseBrand({ wordmark_dark: bad })).toBeNull();
    expect(brandJson({ ...EMPTY_BRAND, wordmarkDark: "r1/brand/2.webp" })).toEqual({
      wordmark_dark: "r1/brand/2.webp",
    });
    // A brand saved before the second slot never sends the new key.
    expect(brandJson({ ...EMPTY_BRAND, wordmark: "r1/brand/1.webp" })).toEqual({
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

  it("keeps the line colour for hairlines but never puts text on a dark chip", () => {
    for (const theme of GUEST_THEMES) {
      for (const line of ["#3e312f", "#000000", "#7f7f7f", "#ffffff", "#ead7bf", "#c2185b"]) {
        const brand: Brand = { ...EMPTY_BRAND, colors: { line } };
        const { style, check } = brandTokens(theme, brand);
        const v = vars(style);
        expect(v["--guest-line"]).toBe(line);
        expect(v["--guest-tab-border"]).toBe(line);
        const chip = v["--guest-chip"];
        if (chip) {
          // Tags, the "popular" badge and pressed buttons: ink text on the chip;
          // with plate "none" the dish's large initial in accent text.
          expect(contrast(THEME_FACTS[theme].ink, chip)).toBeGreaterThanOrEqual(4.5);
          expect(contrast(THEME_FACTS[theme].accentText, chip)).toBeGreaterThanOrEqual(3);
        }
        expect(check.ignored.includes("line")).toBe(chip !== line);
      }
    }
    // A dark espresso line on Pure: lightened for chips, and the editor is told.
    const dark = brandTokens("soft", { ...EMPTY_BRAND, colors: { line: "#3e312f" } });
    expect(dark.check.ignored).toEqual(["line"]);
    expect(vars(dark.style)["--guest-chip"]).not.toBe("#3e312f");
    // Blanca's pale sand line reads as it is.
    expect(vars(brandTokens("soft", BLANCA).style)["--guest-chip"]).toBe("#ead7bf");
  });

  it("drops the header as accent text when it doesn't read on the brand's page", () => {
    // #7a5c2e is 5.3:1 on Pure's grey-white page but 3.8:1 on this sand page.
    const brand: Brand = { ...EMPTY_BRAND, colors: { header: "#7a5c2e", page: "#d8c9a8" } };
    expect(vars(brandStyle("soft", "#7a5c2e"))["--guest-accent-text"]).toBe("#7a5c2e");
    const v = vars(brandTokens("soft", brand).style);
    expect(v["--guest-page"]).toBe("#d8c9a8");
    expect(v["--guest-accent-text"]).toBeUndefined();
    for (const theme of GUEST_THEMES) {
      const t = vars(brandTokens(theme, brand).style);
      const page = t["--guest-page"] ?? THEME_FACTS[theme].page;
      if (t["--guest-accent-text"])
        expect(contrast(t["--guest-accent-text"], page)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("knows the accent text each preset really uses", () => {
    const css = readFileSync("src/app/globals.css", "utf8");
    for (const theme of GUEST_THEMES)
      expect(css).toContain(`--guest-accent-text: ${THEME_FACTS[theme].accentText};`);
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
    expect(googleFontsHref({ ...EMPTY_BRAND, scriptFont: "Mrs Saint Delafield" })).toBe(
      "https://fonts.googleapis.com/css2?family=Mrs+Saint+Delafield&display=swap",
    );
  });
});

describe("pickWordmark", () => {
  const both = { ...EMPTY_BRAND, wordmark: "light-bg.webp", wordmarkDark: "dark-bg.webp" };

  it("takes the light-ink picture on a dark background and the dark-ink one on a light background", () => {
    expect(pickWordmark(both, "#3e312f")).toBe("dark-bg.webp");
    expect(pickWordmark(both, "#000000")).toBe("dark-bg.webp");
    expect(pickWordmark(both, "#f9f0e3")).toBe("light-bg.webp");
    expect(pickWordmark(both, "#ffffff")).toBe("light-bg.webp");
  });

  it("falls back to the only picture there is, and to none", () => {
    expect(pickWordmark({ ...both, wordmarkDark: null }, "#3e312f")).toBe("light-bg.webp");
    expect(pickWordmark({ ...both, wordmark: null }, "#f9f0e3")).toBe("dark-bg.webp");
    expect(pickWordmark(EMPTY_BRAND, "#3e312f")).toBeNull();
    expect(pickWordmark(null, "#3e312f")).toBeNull();
  });

  it("knows what is behind the wordmark: the header band, and the page under the slim bar", () => {
    // Blanca: a dark band on a cream page.
    expect(wordmarkBackgrounds("soft", BLANCA)).toEqual({ header: "#3e312f", page: "#f9f0e3" });
    expect(wordmarkTones("soft", BLANCA)).toEqual({ header: true, page: false });
    // No header colour: the name sits on the page.
    expect(wordmarkTones("soft", { ...both })).toEqual({ header: false, page: false });
    expect(wordmarkTones("wine", { ...both })).toEqual({ header: true, page: true });
    expect(wordmarkTones("evening", null)).toEqual({ header: false, page: false });
    // A page colour the theme ignores is not what guests see.
    expect(wordmarkBackgrounds("wine", { ...both, colors: { page: "#f9f0e3" } }).page).toBe(
      THEME_FACTS.wine.page,
    );
    // A light band on Wine's dark page.
    expect(wordmarkTones("wine", { ...both, colors: { header: "#f9f0e3" } })).toEqual({
      header: false,
      page: true,
    });
  });
});

it("mix blends two colours", () => {
  expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  expect(mix("#3e312f", "#3e312f", 0.3)).toBe("#3e312f");
});

it("the font list matches private.brand_fonts() in the newest migration that defines it", () => {
  const dir = "supabase/migrations";
  const defines = /create (or replace )?function private\.brand_fonts\(\)/;
  const newest = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .reverse()
    .map((f) => readFileSync(`${dir}/${f}`, "utf8"))
    .find((sql) => defines.test(sql));
  expect(newest).toBeDefined();
  const sql = newest ?? "";
  const start = sql.indexOf("select array[", sql.search(defines));
  const body = sql.slice(start, sql.indexOf("]", start));
  const inSql = [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
  expect(inSql).toContain("Mrs Saint Delafield");
  expect(inSql).toEqual(BRAND_FONTS.map((f) => f.family).sort());
});
