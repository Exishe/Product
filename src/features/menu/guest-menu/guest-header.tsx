import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { routing, type Locale } from "@/i18n/routing";
import { scriptLang } from "./ui";

// Server component: café name, table chip and the language switch (Հայ, Рус,
// Eng), which keeps the table token so the guest stays at their table.
// Switching is a full page load: <html lang> lives in the root layout, which
// a client-side navigation would keep.
export async function GuestHeader({
  locale,
  cafeName,
  tableLabel,
  locales,
  hrefFor,
  action,
}: {
  locale: Locale;
  cafeName: string;
  tableLabel: string | null;
  locales: readonly string[];
  hrefFor: (locale: Locale) => string;
  /** Shown next to the table chip: the "call the waiter" button. */
  action?: ReactNode;
}) {
  const t = await getTranslations({ locale, namespace: "guest" });
  const offered = routing.locales.filter((l) => locales.includes(l));
  const nameLang = scriptLang(cafeName);
  return (
    <header className="bg-noir text-ivory border-champagne/40 border-b">
      <div className="mx-auto grid w-full max-w-[1200px] min-w-0 grid-cols-1 gap-3 px-4 pt-5 pb-4 md:px-8 md:pt-9 md:pb-7">
        <div className="flex items-start justify-between gap-4">
          <h1
            className="display-face text-champagne-light min-w-0 text-[2rem] leading-[1.05] text-balance sm:text-[2.5rem] [overflow-wrap:anywhere] md:text-[3.25rem]"
            lang={nameLang && nameLang !== locale ? nameLang : undefined}
          >
            {cafeName}
          </h1>
          {offered.length > 1 && (
            <nav
              aria-label={t("language.label")}
              className="border-champagne/40 mt-1 flex flex-none overflow-hidden rounded-full border md:mt-3"
            >
              {offered.map((l) => (
                <a
                  key={l}
                  href={hrefFor(l)}
                  lang={l}
                  hrefLang={l}
                  aria-current={l === locale ? "true" : undefined}
                  className="text-ivory-dim hover:text-ivory aria-[current=true]:bg-champagne-light aria-[current=true]:text-noir grid min-h-11 min-w-11 place-items-center px-2.5 text-sm font-semibold md:min-w-12 md:px-3"
                >
                  {t(`language.${l}`)}
                </a>
              ))}
            </nav>
          )}
        </div>
        <div className="text-ivory-dim flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 text-sm">
          {tableLabel && (
            <span
              className="border-champagne/50 text-champagne-light rounded-full border px-3 py-0.5 font-semibold"
              data-testid="table-chip"
            >
              {t("table", { label: tableLabel })}
            </span>
          )}
          <span>{t("payHint")}</span>
          {action && <span className="flex basis-full flex-wrap items-center gap-2 sm:basis-auto">{action}</span>}
        </div>
      </div>
    </header>
  );
}
