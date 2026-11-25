import type { Locale } from "@/i18n/routing";

// An ingredient's name in the reader's language. Armenian is always stored, so
// it is the fallback when a translation is missing (ADR-076).
export function pickIngredientName(names: unknown, locale: Locale): string {
  const map = names && typeof names === "object" ? (names as Record<string, unknown>) : {};
  const value = typeof map[locale] === "string" ? (map[locale] as string).trim() : "";
  if (value) return value;
  return typeof map.hy === "string" ? map.hy : "";
}
