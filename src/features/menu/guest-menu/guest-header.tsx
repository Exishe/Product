"use client";

import type { ReactNode } from "react";
import { SplitText } from "@/features/guest-theme/motion/split-text";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { routing, type Locale } from "@/i18n/routing";
import styles from "./guest.module.css";
import { scriptLang } from "./ui";

export type LanguageLink = { locale: Locale; href: string };

// The café in a bar: its wordmark at the bar's height, or its mark and the
// full name set small (wrapping to a second line, never cut with an
// ellipsis). Used by the short header and by the slim bar that follows the
// scroll.
export function BrandMark({
  cafeName,
  logoUrl,
  wordmarkUrl,
  as: Tag = "span",
}: {
  cafeName: string;
  logoUrl: string | null;
  wordmarkUrl: string | null;
  as?: "h1" | "span";
}) {
  const { locale } = useGuestI18n();
  const nameLang = scriptLang(cafeName);
  if (wordmarkUrl)
    return (
      <Tag className="m-0 flex min-w-0 flex-1 items-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp */}
        <img src={wordmarkUrl} alt={cafeName} height={40} className={styles.barWordmark} />
      </Tag>
    );
  return (
    <span className="flex min-w-0 flex-1 items-center gap-2.5">
      {logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- public Storage URL, already sized webp
        <img
          src={logoUrl}
          alt=""
          width={40}
          height={40}
          decoding="async"
          className="bg-surface shadow-plate size-10 flex-none rounded-full object-cover"
        />
      )}
      <Tag
        lang={nameLang && nameLang !== locale ? nameLang : undefined}
        data-long={cafeName.length > 28 || undefined}
        className={`display-face text-title m-0 min-w-0 ${styles.barName}`}
      >
        {cafeName}
      </Tag>
    </span>
  );
}

// The top of every guest page: the café's logo, table chip and language
// switch (Հայ, Рус, Eng, keeping the table token, so the guest stays at
// their table) above the café name, set very large in the theme's display
// face and rising in letter by letter at first paint (Split Text, in CSS).
// From 768 px the name and the controls share one row, so the band stays
// low. `compact` is the short header of the order and status views: one bar
// with the wordmark (or the full name, small), the table and the languages,
// so the order itself starts near the top of the screen.
// Switching language is a full page load: <html lang> lives in the root
// layout, which a client-side navigation would keep.
export function GuestHeader({
  cafeName,
  logoUrl,
  wordmarkUrl = null,
  tableLabel,
  languages,
  tools,
  compact = false,
}: {
  cafeName: string;
  logoUrl: string | null;
  /** The café's name as a picture (brand profile, ADR-058); replaces the set name. */
  wordmarkUrl?: string | null;
  tableLabel: string | null;
  languages: readonly LanguageLink[];
  /** Small round buttons on the right of the top row (search, order). */
  tools?: ReactNode;
  /** One short bar instead of the large name (order and status views). */
  compact?: boolean;
}) {
  const { t, locale } = useGuestI18n();
  const offered = routing.locales.flatMap((l) => languages.filter((x) => x.locale === l));
  const nameLang = scriptLang(cafeName);
  const tableChip = tableLabel && (
    <span
      className="border-line-strong/60 text-ink rounded-pill flex-none border px-3 py-1 text-sm font-semibold whitespace-nowrap"
      data-testid="table-chip"
    >
      {t("table", { label: tableLabel })}
    </span>
  );
  const languageNav = offered.length > 1 && (
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
  );

  if (compact)
    return (
      <header className={`guest-head text-ink ${styles.bar}`} data-compact="">
        <div className="mx-auto flex min-h-16 w-full max-w-[1360px] min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 md:px-8">
          <BrandMark as="h1" cafeName={cafeName} logoUrl={logoUrl} wordmarkUrl={wordmarkUrl} />
          {tableChip}
          {languageNav}
          {tools}
        </div>
      </header>
    );

  return (
    // guest-head: the brand's header band hooks here (globals.css).
    <header className="guest-head text-ink">
      <div className="mx-auto grid w-full max-w-[1360px] min-w-0 gap-5 px-4 pt-4 pb-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-x-8 md:pt-6">
        {/* Two groups that wrap: the logo and table on the left; languages and
            the round buttons on the right, dropping to their own line when a
            narrow phone can't hold both (a logo, «Սեղան 12», three languages).
            Beside the name from 768 px. */}
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2 md:col-start-2 md:row-start-1 md:justify-end">
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
                  // Beside the wordmark (768 px and up) the mark would say the name twice.
                  className={`bg-surface shadow-plate size-11 flex-none rounded-full object-cover ${wordmarkUrl ? "md:hidden" : ""}`}
                />
              )}
              {tableChip}
            </div>
          )}
          <div className="ml-auto flex flex-none items-center gap-2 md:ml-0">
            {languageNav}
            {tools}
          </div>
        </div>
        <div className="min-w-0 md:col-start-1 md:row-start-1">
          {wordmarkUrl ? (
            <h1 className="m-0">
              {/* eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp */}
              <img
                src={wordmarkUrl}
                alt={cafeName}
                height={96}
                className={`guest-wordmark ${styles.wordmark}`}
              />
            </h1>
          ) : (
            <SplitText
              as="h1"
              reveal="load"
              text={cafeName}
              lang={nameLang && nameLang !== locale ? nameLang : undefined}
              className="display-face text-title block text-[clamp(2.75rem,12.5vw,5rem)] leading-[0.98] tracking-[-0.01em] text-balance [overflow-wrap:anywhere]"
            />
          )}
          <p className="text-muted mt-2 text-sm">{t("payHint")}</p>
        </div>
      </div>
    </header>
  );
}
