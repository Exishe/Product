"use client";

import type { ReactNode } from "react";
import { SplitText } from "@/features/guest-theme/motion/split-text";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { routing, type Locale } from "@/i18n/routing";
import { scriptLang } from "./ui";

export type LanguageLink = { locale: Locale; href: string };

// The top of every guest page: the café's logo, table chip and language
// switch (Հայ, Рус, Eng, keeping the table token, so the guest stays at
// their table) above the café name, set very large in the theme's display
// face and rising in letter by letter at first paint (Split Text, in CSS).
// Switching language is a full page load: <html lang> lives in the root
// layout, which a client-side navigation would keep.
export function GuestHeader({
  cafeName,
  logoUrl,
  wordmarkUrl = null,
  tableLabel,
  languages,
  tools,
  below,
}: {
  cafeName: string;
  logoUrl: string | null;
  /** The café's name as a picture (brand profile, ADR-057); replaces the set name. */
  wordmarkUrl?: string | null;
  tableLabel: string | null;
  languages: readonly LanguageLink[];
  /** Small round buttons on the right of the top row (search, order). */
  tools?: ReactNode;
  /** Under the name: the rotating line on the menu. */
  below?: ReactNode;
}) {
  const { t, locale } = useGuestI18n();
  const offered = routing.locales.flatMap((l) => languages.filter((x) => x.locale === l));
  const nameLang = scriptLang(cafeName);
  return (
    // guest-head: the brand's header band hooks here (globals.css).
    <header className="guest-head text-ink">
      <div className="mx-auto grid w-full max-w-[1360px] min-w-0 gap-5 px-4 pt-4 pb-2 md:px-8 md:pt-7">
        {/* Two groups that wrap: the logo and table on the left; languages and
            the round buttons on the right, dropping to their own line when a
            narrow phone can't hold both (a logo, «Սեղան 12», three languages). */}
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2">
          {(logoUrl || tableLabel) && (
            <div className="flex min-w-0 items-center gap-3">
              {logoUrl && (
                // eslint-disable-next-line @next/next/no-img-element -- public Storage URL, already sized webp
                <img
                  src={logoUrl}
                  alt=""
                  width={44}
                  height={44}
                  decoding="async"
                  className="bg-surface shadow-plate size-11 flex-none rounded-full object-cover"
                />
              )}
              {tableLabel && (
                <span
                  className="border-line-strong/60 text-ink rounded-pill flex-none border px-3 py-1 text-sm font-semibold whitespace-nowrap"
                  data-testid="table-chip"
                >
                  {t("table", { label: tableLabel })}
                </span>
              )}
            </div>
          )}
          <div className="ml-auto flex flex-none items-center gap-2">
            {offered.length > 1 && (
              <nav aria-label={t("language.label")} className="flex flex-none items-center">
                {offered.map(({ locale: l, href }) => (
                  <a
                    key={l}
                    href={href}
                    lang={l}
                    hrefLang={l}
                    aria-current={l === locale ? "true" : undefined}
                    className="text-muted hover:text-ink aria-[current=true]:text-ink grid min-h-11 min-w-11 place-items-center px-1.5 text-sm font-semibold aria-[current=true]:underline aria-[current=true]:decoration-[var(--guest-glow)] aria-[current=true]:decoration-2 aria-[current=true]:underline-offset-[6px]"
                  >
                    {t(`language.${l}`)}
                  </a>
                ))}
              </nav>
            )}
            {tools}
          </div>
        </div>
        <div className="min-w-0">
          {wordmarkUrl ? (
            <h1 className="m-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp */}
              <img
                src={wordmarkUrl}
                alt={cafeName}
                decoding="async"
                fetchPriority="high"
                height={96}
                className="block h-20 w-auto max-w-full object-contain object-left md:h-28"
              />
            </h1>
          ) : (
            <SplitText
              as="h1"
              reveal="load"
              text={cafeName}
              lang={nameLang && nameLang !== locale ? nameLang : undefined}
              className="display-face text-title block text-[clamp(2.75rem,12.5vw,6.5rem)] leading-[0.98] tracking-[-0.01em] text-balance [overflow-wrap:anywhere]"
            />
          )}
          {below}
          <p className="text-muted mt-2 text-sm">{t("payHint")}</p>
        </div>
      </div>
    </header>
  );
}
