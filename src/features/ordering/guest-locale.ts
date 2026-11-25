import { routing, type Locale } from "@/i18n/routing";

// Switching the guest's language in place (ADR-092): the address keeps the
// language in its first segment (/hy/m/...), so a reload, a shared link and the
// table QR (NEXT_LOCALE) still land in the language the guest chose.

export const LOCALE_COOKIE = "NEXT_LOCALE";

export const isLocale = (value: unknown): value is Locale =>
  typeof value === "string" && (routing.locales as readonly string[]).includes(value);

/** The language in a guest path ("/ru/m/cafe/main" → "ru"), or null. */
export function localeOfPath(pathname: string): Locale | null {
  const first = pathname.split("/")[1];
  return isLocale(first) ? first : null;
}

/**
 * The same address in another language: only the first path segment changes;
 * the query (?t=) and the hash (#cart) stay. An address without a language
 * segment is returned unchanged.
 */
export function withLocale(href: string, locale: Locale): string {
  const cut = href.search(/[?#]/);
  const path = cut === -1 ? href : href.slice(0, cut);
  const rest = cut === -1 ? "" : href.slice(cut);
  if (!localeOfPath(path)) return href;
  const slash = path.indexOf("/", 1);
  return `/${locale}${slash === -1 ? "" : path.slice(slash)}${rest}`;
}

/** The language the guest last chose, from document.cookie. */
export function chosenLocale(cookie: string): Locale | null {
  for (const part of cookie.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1 || part.slice(0, eq).trim() !== LOCALE_COOKIE) continue;
    let value = part.slice(eq + 1).trim();
    try {
      value = decodeURIComponent(value);
    } catch {
      // a malformed value is simply not a language
    }
    return isLocale(value) ? value : null;
  }
  return null;
}

/** The cookie next-intl's middleware writes (session, path /, SameSite=Lax). */
export const localeCookie = (locale: Locale) => `${LOCALE_COOKIE}=${locale}; path=/; samesite=lax`;
