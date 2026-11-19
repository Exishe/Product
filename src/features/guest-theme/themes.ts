import type { CSSProperties } from "react";

// Guest theme presets (ADR-052). The palettes live in globals.css
// (.guest-lux[data-guest-theme=…]); this file knows only what code needs:
// the ids, the browser bar colour, and the page and accent colours that a
// café's brand colour is checked against.
export const GUEST_THEMES = ["evening", "wine", "soft"] as const;
export type GuestTheme = (typeof GUEST_THEMES)[number];
export const DEFAULT_THEME: GuestTheme = "evening";

/** The order the admin offers them in: Pure (stored as "soft", ADR-056) first, as recommended. */
export const THEME_CHOICES: readonly GuestTheme[] = ["soft", "evening", "wine"];
export const RECOMMENDED_THEME: GuestTheme = "soft";

export const isGuestTheme = (v: unknown): v is GuestTheme =>
  typeof v === "string" && (GUEST_THEMES as readonly string[]).includes(v);

/** The theme a café chose, or Evening while the database doesn't say (before the migration). */
export const guestTheme = (v: unknown): GuestTheme => (isGuestTheme(v) ? v : DEFAULT_THEME);

/** accentText: the preset's small accent text (prices), as in globals.css. */
type Facts = { page: string; surface: string; ink: string; accentText: string; dark: boolean };
export const THEME_FACTS: Record<GuestTheme, Facts> = {
  evening: { page: "#f6f1e7", surface: "#fffdf8", ink: "#1b1712", accentText: "#7f6135", dark: false },
  wine: { page: "#260212", surface: "#4f0423", ink: "#ffffff", accentText: "#ffc7c6", dark: true },
  soft: { page: "#eceef1", surface: "#ffffff", ink: "#1b1d21", accentText: "#8a5a00", dark: false },
};

/** The browser bar matches the page (the meta tag needs a literal colour). */
export const themeColor = (theme: GuestTheme) => THEME_FACTS[theme].page;

const HEX = /^#[0-9a-f]{6}$/i;

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/**
 * A café's brand colour replaces the theme's accent: filled buttons, the
 * active tab, badges and the glow (also where a preset splits those roles
 * off the accent, as Pure does). Text on it is white or black, whichever
 * reads better. It also colours small accent text, but only where it keeps
 * 4.5:1 on the page and on cards; otherwise the theme's own accent text stays.
 */
export function brandStyle(
  theme: GuestTheme,
  brandColor: string | null | undefined,
): CSSProperties | undefined {
  if (!brandColor || !HEX.test(brandColor)) return undefined;
  const { page, surface } = THEME_FACTS[theme];
  const onAccent = contrast("#ffffff", brandColor) >= contrast("#000000", brandColor) ? "#ffffff" : "#000000";
  const vars: Record<string, string> = {
    "--guest-accent": brandColor,
    "--guest-on-accent": onAccent,
    "--guest-glow": brandColor,
    "--guest-badge": brandColor,
    "--guest-on-badge": onAccent,
    "--guest-tab": brandColor,
    "--guest-on-tab": onAccent,
  };
  if (contrast(brandColor, page) >= 4.5 && contrast(brandColor, surface) >= 4.5)
    vars["--guest-accent-text"] = brandColor;
  return vars as CSSProperties;
}
