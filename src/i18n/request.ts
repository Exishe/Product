import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { routing } from "./routing";

// Staff and admin pages have no locale in the URL; the member's language is
// kept in this cookie after sign-in or pairing.
export const STAFF_LOCALE_COOKIE = "pativ-locale";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = (await requestLocale) ?? (await cookies()).get(STAFF_LOCALE_COOKIE)?.value;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
