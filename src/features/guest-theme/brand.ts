import type { CSSProperties } from "react";
import { THEME_FACTS, brandStyle, contrast, type GuestTheme } from "./themes";

// The café's brand profile (ADR-057): restaurants.brand, read with the menu.
// It sits on top of the theme preset: every role below replaces some of the
// preset's --guest-* tokens, but only where the result keeps WCAG contrast;
// a role that would not is ignored on the guest page and flagged in the
// admin editor. No brand means the preset exactly as it is.

export const BRAND_COLOR_ROLES = ["header", "accent", "highlight", "line", "page"] as const;
export type BrandColorRole = (typeof BRAND_COLOR_ROLES)[number];

export const PLATE_STYLES = ["porcelain", "dark", "none"] as const;
export type PlateStyle = (typeof PLATE_STYLES)[number];

export type FontKind = "serif" | "sans" | "script";
export type BrandFont = {
  family: string;
  kind: FontKind;
  /** Weights Google Fonts serves for the family (checked on 2026-11-19). */
  weights: readonly number[];
};

// Free Google fonts with Latin and Cyrillic (all SIL OFL 1.1), checked
// against the css2 API on 2026-11-19. Armenian is in none of them: it falls
// through per glyph to Noto Serif Armenian (serif, script) or Noto Sans
// Armenian (sans), which the app already self-hosts. Keep in step with
// private.brand_fonts() in 20261119100000_brand_profile.sql.
export const BRAND_FONTS: readonly BrandFont[] = [
  { family: "Cormorant", kind: "serif", weights: [300, 400, 500, 600, 700] },
  { family: "Cormorant Garamond", kind: "serif", weights: [300, 400, 500, 600, 700] },
  { family: "Playfair Display", kind: "serif", weights: [400, 500, 600, 700] },
  { family: "Lora", kind: "serif", weights: [400, 500, 600, 700] },
  { family: "EB Garamond", kind: "serif", weights: [400, 500, 600, 700] },
  { family: "PT Serif", kind: "serif", weights: [400, 700] },
  { family: "Prata", kind: "serif", weights: [400] },
  { family: "Forum", kind: "serif", weights: [400] },
  { family: "Yeseva One", kind: "serif", weights: [400] },
  { family: "Literata", kind: "serif", weights: [300, 400, 500, 600, 700] },
  { family: "Oswald", kind: "sans", weights: [300, 400, 500, 600, 700] },
  { family: "Unbounded", kind: "sans", weights: [300, 400, 500, 600, 700] },
  { family: "Jost", kind: "sans", weights: [300, 400, 500, 600, 700] },
  { family: "Montserrat", kind: "sans", weights: [300, 400, 500, 600, 700] },
  { family: "Inter", kind: "sans", weights: [300, 400, 500, 600, 700] },
  { family: "Manrope", kind: "sans", weights: [300, 400, 500, 600, 700] },
  { family: "Rubik", kind: "sans", weights: [300, 400, 500, 600, 700] },
  { family: "PT Sans", kind: "sans", weights: [400, 700] },
  { family: "Raleway", kind: "sans", weights: [300, 400, 500, 600, 700] },
  { family: "Nunito", kind: "sans", weights: [300, 400, 500, 600, 700] },
  { family: "Commissioner", kind: "sans", weights: [300, 400, 500, 600, 700] },
  { family: "Golos Text", kind: "sans", weights: [400, 500, 600, 700] },
  { family: "Great Vibes", kind: "script", weights: [400] },
  { family: "Marck Script", kind: "script", weights: [400] },
  { family: "Bad Script", kind: "script", weights: [400] },
  { family: "Caveat", kind: "script", weights: [400, 500, 600, 700] },
  { family: "Lobster", kind: "script", weights: [400] },
];

const FONT = new Map(BRAND_FONTS.map((f) => [f.family, f]));
/** Fonts the editor offers for titles, for body text and for the script accent. */
export const HEADING_FONTS = BRAND_FONTS.filter((f) => f.kind !== "script");
export const BODY_FONTS = BRAND_FONTS.filter((f) => f.kind === "sans");
export const SCRIPT_FONTS = BRAND_FONTS.filter((f) => f.kind === "script");

export type Brand = {
  colors: Partial<Record<BrandColorRole, string>>;
  headingFont: string | null;
  bodyFont: string | null;
  scriptFont: string | null;
  plate: PlateStyle | null;
  /** Storage path of the wordmark (the café's name as a picture). */
  wordmark: string | null;
};

export const EMPTY_BRAND: Brand = {
  colors: {},
  headingFont: null,
  bodyFont: null,
  scriptFont: null,
  plate: null,
  wordmark: null,
};

const HEX = /^#[0-9a-f]{6}$/i;
const font = (v: unknown, kinds: readonly FontKind[]) =>
  typeof v === "string" && kinds.includes(FONT.get(v)?.kind as FontKind) ? v : null;

/** The brand from api.public_menu or the table, read defensively; null when there is none. */
export function parseBrand(raw: unknown): Brand | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const colors: Brand["colors"] = {};
  const rc = r.colors && typeof r.colors === "object" ? (r.colors as Record<string, unknown>) : {};
  for (const role of BRAND_COLOR_ROLES) {
    const v = rc[role];
    if (typeof v === "string" && HEX.test(v)) colors[role] = v.toLowerCase();
  }
  const brand: Brand = {
    colors,
    headingFont: font(r.heading_font, ["serif", "sans"]),
    bodyFont: font(r.body_font, ["sans"]),
    scriptFont: font(r.script_font, ["script"]),
    plate: PLATE_STYLES.find((p) => p === r.plate) ?? null,
    wordmark: typeof r.wordmark === "string" && r.wordmark ? r.wordmark : null,
  };
  return isEmptyBrand(brand) ? null : brand;
}

export const isEmptyBrand = (b: Brand) =>
  Object.keys(b.colors).length === 0 &&
  !b.headingFont &&
  !b.bodyFont &&
  !b.scriptFont &&
  !b.plate &&
  !b.wordmark;

/** The jsonb api.set_brand takes (empty values left out). */
export function brandJson(b: Brand): Record<string, unknown> | null {
  if (isEmptyBrand(b)) return null;
  const out: Record<string, unknown> = {};
  if (Object.keys(b.colors).length) out.colors = b.colors;
  if (b.headingFont) out.heading_font = b.headingFont;
  if (b.bodyFont) out.body_font = b.bodyFont;
  if (b.scriptFont) out.script_font = b.scriptFont;
  if (b.plate) out.plate = b.plate;
  if (b.wordmark) out.wordmark = b.wordmark;
  return out;
}

/** The chosen families, in the order they are requested. */
export function brandFamilies(b: Brand | null): BrandFont[] {
  if (!b) return [];
  const names = [
    ...new Set([b.headingFont, b.bodyFont, b.scriptFont].filter((n): n is string => Boolean(n))),
  ];
  return names.map((n) => FONT.get(n)).filter((f): f is BrandFont => Boolean(f));
}

// Titles need the light and regular cuts, body text regular to bold.
const WANTED: Record<FontKind, readonly number[]> = {
  serif: [300, 400, 500],
  sans: [300, 400, 500, 600, 700],
  script: [400],
};

/**
 * One Google Fonts css2 request for exactly the chosen families, or null.
 * Only weights the family has are asked for (css2 refuses the whole request
 * otherwise); display=swap, so text shows at once in the fallback.
 */
export function googleFontsHref(b: Brand | null): string | null {
  const families = brandFamilies(b);
  if (!families.length) return null;
  const parts = families.map((f) => {
    const w = f.weights.filter((x) => WANTED[f.kind].includes(x));
    const name = f.family.replace(/ /g, "+");
    return w.length > 1 || (w.length === 1 && w[0] !== 400)
      ? `family=${name}:wght@${w.join(";")}`
      : `family=${name}`;
  });
  return `https://fonts.googleapis.com/css2?${parts.join("&")}&display=swap`;
}

const SERIF_STACK = "var(--font-noto-serif-armenian), var(--font-noto-serif), Georgia, serif";
const SANS_STACK = "var(--font-noto-sans-armenian), var(--font-google-sans), system-ui, sans-serif";
const stackFor = (f: BrandFont) => `"${f.family}", ${f.kind === "sans" ? SANS_STACK : SERIF_STACK}`;

/** Mixes two #rrggbb colours: `t` of `a`, the rest `b`. */
export function mix(a: string, b: string, t: number): string {
  const ch = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16);
  return (
    "#" +
    [1, 3, 5]
      .map((i) => Math.round(ch(a, i) * t + ch(b, i) * (1 - t)))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
}

const blackOrWhite = (bg: string) =>
  contrast("#ffffff", bg) >= contrast("#000000", bg) ? "#ffffff" : "#000000";

/** Text that reads on `bg`: the first candidate with 4.5:1, else black or white. */
function readableOn(bg: string, ...candidates: (string | undefined)[]): string {
  return candidates.find((c) => c && contrast(c, bg) >= 4.5) ?? blackOrWhite(bg);
}

export type BrandCheck = {
  /**
   * Roles the guest page ignores, wholly or in part, because they would not
   * keep contrast: a page or accent is dropped; a line still draws the
   * hairlines, but chips behind text get a lighter shade of it.
   */
  ignored: BrandColorRole[];
};

/**
 * The CSS variables for the café's theme plus its brand, set on the guest
 * root. Without a brand this is exactly brandStyle(theme, legacyColor).
 */
export function brandTokens(
  theme: GuestTheme,
  brand: Brand | null,
  legacyColor?: string | null,
): { style: CSSProperties | undefined; check: BrandCheck } {
  const base = (brandStyle(theme, brand?.colors.header ?? legacyColor) ?? {}) as Record<string, string>;
  const check: BrandCheck = { ignored: [] };
  if (!brand) return { style: Object.keys(base).length ? (base as CSSProperties) : undefined, check };

  const facts = THEME_FACTS[theme];
  const vars: Record<string, string> = { ...base };
  const { header, accent, highlight, line, page: pageColor } = brand.colors;

  // Page: the theme's ink must keep 4.5:1 on it; the muted grey is darkened
  // towards the ink until it does too.
  let page = facts.page;
  if (pageColor) {
    if (
      contrast(facts.ink, pageColor) >= 4.5 &&
      facts.dark === contrast("#ffffff", pageColor) > contrast("#000000", pageColor)
    ) {
      page = pageColor;
      vars["--guest-page"] = pageColor;
      vars["--guest-dock"] = `color-mix(in srgb, ${pageColor} 96%, transparent)`;
      vars["--brand-page"] = pageColor;
      const muted = [0.62, 0.7, 0.78, 0.86]
        .map((t) => mix(facts.ink, pageColor, t))
        .find((c) => contrast(c, pageColor) >= 4.5 && contrast(c, facts.surface) >= 4.5);
      if (muted) {
        vars["--guest-muted"] = muted;
        vars["--guest-soft"] = muted;
      }
    } else check.ignored.push("page");
  }
  const surface = facts.surface;
  // brandStyle checked the header as accent text against the theme's page;
  // on the brand's own page it must read too, else the theme's stays.
  const headerText = vars["--guest-accent-text"];
  if (headerText && contrast(headerText, page) < 4.5) delete vars["--guest-accent-text"];

  // Header: the band behind the café's name, and filled buttons (brandStyle
  // above already made it the accent). Its text is the page colour when that
  // reads, else white or black.
  if (header) {
    const onHeader = readableOn(header, page, "#ffffff", "#000000");
    vars["--brand-header"] = header;
    vars["--brand-on-header"] = onHeader;
    vars["--brand-on-header-muted"] =
      [0.8, 0.88].map((t) => mix(onHeader, header, t)).find((c) => contrast(c, header) >= 4.5) ?? onHeader;
    vars["--guest-on-accent"] = onHeader;
    // Large titles in the brand's dark colour when it keeps 3:1 (AA large).
    if (contrast(header, page) >= 3 && contrast(header, surface) >= 3) vars["--guest-title"] = header;
  }

  // Accent: prices, small accent text and the current category tab.
  if (accent) {
    if (contrast(accent, page) >= 4.5 && contrast(accent, surface) >= 4.5) {
      vars["--guest-accent-text"] = accent;
      vars["--guest-flourish"] = accent;
      vars["--guest-tab"] = accent;
      vars["--guest-on-tab"] = readableOn(accent, page, "#ffffff", "#000000");
      vars["--brand-plate-ink"] = accent;
    } else check.ignored.push("accent");
  }

  // Highlight: badges, the glow and the StarBorder star, the initial on an
  // empty porcelain plate (large text: 3:1 is enough there).
  if (highlight) {
    vars["--guest-badge"] = highlight;
    vars["--guest-on-badge"] = blackOrWhite(highlight);
    vars["--guest-glow"] = highlight;
    vars["--guest-star"] = mix(highlight, "#ffffff", 0.7);
    vars["--brand-highlight"] = highlight;
    if (contrast(highlight, "#ffffff") >= 3) vars["--brand-plate-ink"] = highlight;
  }

  // Line: hairlines and the outline of the inactive tabs are decoration, so
  // they take the colour as it is (field borders keep the theme's
  // line-strong). Chips are a fill behind ink text (tags, the "popular"
  // badge, the "calm" status, pressed buttons, the soft portion chip): the
  // ink must keep 4.5:1 on them, and without a plate style the dish's large
  // initial (accent text) 3:1. A line colour that is too dark (too light on
  // Wine) is lightened towards the page until both hold, and the editor
  // says so.
  if (line) {
    vars["--guest-line"] = line;
    vars["--guest-tab-border"] = line;
    vars["--brand-line"] = line;
    const accentText = vars["--guest-accent-text"] ?? facts.accentText;
    const chip = [1, 0.6, 0.4, 0.25, 0.12]
      .map((t) => mix(line, page, t))
      .find((c) => contrast(facts.ink, c) >= 4.5 && contrast(accentText, c) >= 3);
    // None reads: the theme's own chip stays.
    if (chip) vars["--guest-chip"] = chip;
    // The porcelain plate's empty well is a paler cut of the chip, not of a dark line.
    vars["--brand-well-line"] = chip ?? "#ffffff";
    if (chip !== line) check.ignored.push("line");
  }

  // Fonts: the brand's family first, then the Armenian and Cyrillic fallbacks.
  const heading = brand.headingFont ? FONT.get(brand.headingFont) : undefined;
  const body = brand.bodyFont ? FONT.get(brand.bodyFont) : undefined;
  const script = brand.scriptFont ? FONT.get(brand.scriptFont) : undefined;
  if (heading) vars["--font-display"] = stackFor(heading);
  if (body) vars["--font-ui"] = stackFor(body);
  if (script) vars["--brand-font-script"] = stackFor(script);

  return { style: vars as CSSProperties, check };
}

/** What the editor warns about for a colour role, before saving. */
export function ignoredRoles(theme: GuestTheme, brand: Brand): BrandColorRole[] {
  return brandTokens(theme, brand).check.ignored;
}

/** The body overscroll colour for the brand's page (null: the theme's). */
export const brandPage = (b: Brand | null, theme: GuestTheme) =>
  b?.colors.page && !ignoredRoles(theme, b).includes("page") ? b.colors.page : null;
