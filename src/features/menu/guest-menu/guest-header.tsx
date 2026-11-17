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
    <header className="grid min-w-0 grid-cols-1 gap-2.5 px-4 pt-4 pb-3">
      <h1
        className="display-face min-w-0 text-[2rem] leading-[1.05] text-balance [overflow-wrap:anywhere]"
        lang={nameLang && nameLang !== locale ? nameLang : undefined}
      >
        {cafeName}
      </h1>
      <div className="flex items-center justify-between gap-3">
        <div className="text-muted flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {tableLabel && (
            <span
              className="bg-tarragon-tint text-tarragon rounded-full px-2.5 py-0.5 font-semibold"
              data-testid="table-chip"
            >
              {t("table", { label: tableLabel })}
            </span>
          )}
          <span>{t("payHint")}</span>
        </div>
        {offered.length > 1 && (
          <nav
            aria-label={t("language.label")}
            className="rounded-chip border-line-strong flex flex-none overflow-hidden border"
          >
            {offered.map((l) => (
              <a
                key={l}
                href={hrefFor(l)}
                lang={l}
                hrefLang={l}
                aria-current={l === locale ? "true" : undefined}
                className="text-muted hover:bg-mist aria-[current=true]:bg-ink aria-[current=true]:text-matsoni grid min-h-11 min-w-11 place-items-center px-2 text-sm font-semibold"
              >
                {t(`language.${l}`)}
              </a>
            ))}
          </nav>
        )}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}
