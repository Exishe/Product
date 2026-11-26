import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { STAFF_LOCALE_COOKIE } from "./locale-cookie";
import { routing } from "./routing";

export { STAFF_LOCALE_COOKIE };

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = (await requestLocale) ?? (await cookies()).get(STAFF_LOCALE_COOKIE)?.value;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
