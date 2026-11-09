import { defineRouting } from "next-intl/routing";

// Guest pages carry the locale in the URL (/hy/m/...); staff and admin pages
// don't, and take it from the member's setting instead (i18n.md).
export const routing = defineRouting({
  locales: ["hy", "ru", "en"],
  defaultLocale: "hy",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
