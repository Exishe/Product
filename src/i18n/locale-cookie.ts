// Staff and admin pages, sign-in, sign-up and pairing have no locale in the
// URL; the language is kept in this cookie. It is set after sign-in or pairing
// (the member's own language), by the landing page (the visitor's choice) and
// by the language switch on the sign-in pages. Safe to import on the client.
export const STAFF_LOCALE_COOKIE = "pativ-locale";

// Remember a language choice in the browser for a year.
export function writeLocaleCookie(locale: string) {
  document.cookie = `${STAFF_LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
}
