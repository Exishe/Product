import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

export default createMiddleware(routing);

// Only the root and locale-prefixed guest paths; staff, admin, api and the
// QR entry (/t/...) are left alone.
export const config = {
  matcher: ["/", "/(hy|ru|en)/:path*"],
};
