import createIntlMiddleware from "next-intl/middleware";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";
import { updateSession } from "./lib/supabase/proxy";

const intl = createIntlMiddleware(routing);
const GUEST_PATH = /^\/$|^\/(?:hy|ru|en)(?:\/|$)/;

// Guest pages: language routing. Staff, admin and sign-in pages: session refresh.
export default async function proxy(request: NextRequest) {
  if (GUEST_PATH.test(request.nextUrl.pathname)) return intl(request);
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
    "/invite/:path*",
  ],
};
