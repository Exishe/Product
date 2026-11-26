import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";
import { STAFF_LOCALE_COOKIE } from "./locale-cookie";
import { routing } from "./routing";

export { STAFF_LOCALE_COOKIE };

export default getRequestConfig(async ({ requestLocale }) => {
  // Pages without a locale in the URL: the remembered choice, then the
  // language the guest pages last used (next-intl's own cookie), then Armenian.
  const jar = await cookies();
  const requested =
    (await requestLocale) ?? jar.get(STAFF_LOCALE_COOKIE)?.value ?? jar.get("NEXT_LOCALE")?.value;
  const locale = hasLocale(routing.locales, requested) ? requested : routing.defaultLocale;
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
