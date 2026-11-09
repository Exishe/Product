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
}: {
  locale: Locale;
  cafeName: string;
  tableLabel: string | null;
  locales: readonly string[];
  hrefFor: (locale: Locale) => string;
}) {
  const t = await getTranslations({ locale, namespace: "guest" });
  const offered = routing.locales.filter((l) => locales.includes(l));
  const nameLang = scriptLang(cafeName);
  return (
    <header className="grid min-w-0 grid-cols-1 gap-2 px-4 pt-6 pb-3">
      <div className="flex items-start justify-between gap-3">
        <h1
          className="display-face min-w-0 text-display-38 leading-[1.05] text-balance [overflow-wrap:anywhere]"
          lang={nameLang && nameLang !== locale ? nameLang : undefined}
        >
          {cafeName}
        </h1>
        {offered.length > 1 && (
          <nav aria-label={t("language.label")} className="flex flex-none overflow-hidden rounded-chip border border-line-strong">
            {offered.map((l) => (
              <a
                key={l}
                href={hrefFor(l)}
                lang={l}
                hrefLang={l}
                aria-current={l === locale ? "true" : undefined}
                className="grid min-h-12 min-w-12 place-items-center px-2.5 text-sm font-semibold text-muted aria-[current=true]:bg-ink aria-[current=true]:text-matsoni"
              >
                {t(`language.${l}`)}
              </a>
            ))}
          </nav>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
        {tableLabel && (
          <span className="rounded-full bg-tarragon-tint px-2.5 py-0.5 font-semibold text-tarragon" data-testid="table-chip">
            {t("table", { label: tableLabel })}
          </span>
        )}
        <span>{t("payHint")}</span>
      </div>
    </header>
  );
}
