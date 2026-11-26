import { hasLocale } from "next-intl";
import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { STAFF_LOCALE_COOKIE } from "./i18n/locale-cookie";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/proxy";

const intl = createIntlMiddleware(routing);
const GUEST_PATH = /^\/$|^\/(?:hy|ru|en)(?:\/|$)/;
// Pages with no locale in the URL that a visitor reaches from the landing
// page or a shared link. `?lang=ru` there remembers the language (the same
// cookie the language switch sets) and redirects to the clean URL, so the page
// renders in that language, with the right <html lang>, even without script.
const LANG_PATHS = new Set(["/login", "/signup", "/pair", "/forgot-password"]);

// Guest pages: language routing. Staff, admin and sign-in pages: session refresh.
export default async function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;
  if (GUEST_PATH.test(pathname)) return intl(request);
  const lang = searchParams.get("lang");
  if (lang !== null && LANG_PATHS.has(pathname)) {
    const url = request.nextUrl.clone();
    url.searchParams.delete("lang");
    const response = NextResponse.redirect(url);
    if (hasLocale(routing.locales, lang)) {
      response.cookies.set(STAFF_LOCALE_COOKIE, lang, { path: "/", maxAge: 31536000, sameSite: "lax" });
    }
    return response;
  }
  return updateSession(request);
}

export const config = {
  matcher: [
    "/",
    "/(hy|ru|en)/:path*",
    "/admin/:path*",
    "/waiter/:path*",
    "/kitchen/:path*",
    "/platform/:path*",
    "/login",
    "/signup",
    "/pair",
    "/forgot-password",
    "/reset-password",
    "/invite/:path*",
  ],
};
