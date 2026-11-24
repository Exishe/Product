"use client";

import type { ReactNode } from "react";
import { SplitText } from "@/features/guest-theme/motion/split-text";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { routing, type Locale } from "@/i18n/routing";
import styles from "./guest.module.css";
import { scriptLang } from "./ui";

export type LanguageLink = { locale: Locale; href: string };

/** The menu page, and what to do instead of a page load when the guest is already on it. */
export type HomeLink = { href: string; onGo?: () => void };

// The café's name or wordmark leads back to the menu. On the menu itself it
// only closes the order view and returns to the top; the cart lives in the
// browser, so nothing in it is lost either way.
function Home({ home, label, children }: { home?: HomeLink; label: string; children: ReactNode }) {
  if (!home) return <>{children}</>;
  return (
    <a
      href={home.href}
      aria-label={label}
      data-testid="home-link"
      className="inline-flex max-w-full items-center rounded-lg transition-opacity hover:opacity-80 active:opacity-60"
      onClick={(e) => {
        if (!home.onGo || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        home.onGo();
      }}
    >
      {children}
    </a>
  );
}

// The café in a bar: its wordmark at the bar's height, or its mark and the
// full name set small (wrapping to a second line, never cut with an
// ellipsis). Used by the short header and by the slim bar that follows the
// scroll.
export function BrandMark({
  cafeName,
  logoUrl,
  wordmarkUrl,
  wordmarkTestId,
  as: Tag = "span",
  home,
}: {
  cafeName: string;
  logoUrl: string | null;
  wordmarkUrl: string | null;
  wordmarkTestId?: string;
  as?: "h1" | "span";
  /** Where the café's name leads: the menu, from any screen. */
  home?: HomeLink;
}) {
  const { locale } = useGuestI18n();
  const nameLang = scriptLang(cafeName);
  if (wordmarkUrl)
    return (
      <Tag className="m-0 flex min-w-0 flex-1 items-center">
        <Home home={home} label={cafeName}>
          {/* eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp */}
          <img src={wordmarkUrl} alt={cafeName} height={40} className={styles.barWordmark} data-testid={wordmarkTestId} />
        </Home>
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
        <Home home={home} label={cafeName}>
          {cafeName}
        </Home>
      </Tag>
    </span>
  );
}

/** Հայ · Рус · Eng, keeping the table token; a line draws under a language on hover. */
// A label that turns over on hover (front and back are the same text; the back
// is for the eye only) with a glow behind it. See .flip in guest.module.css.
function Flip({ children }: { children: ReactNode }) {
  return (
    <>
      <span className={styles.flipFront}>{children}</span>
      <span className={styles.flipBack} aria-hidden="true">
        {children}
      </span>
    </>
  );
}

/** The table label in the menu bar: plain text that turns over like the languages. */
export function TableChip({ label }: { label: string }) {
  const { t } = useGuestI18n();
  return (
    <span
      className={`text-ink grid min-h-11 flex-none place-items-center px-2 text-sm font-semibold whitespace-nowrap ${styles.flip}`}
      data-testid="table-chip"
    >
      <Flip>{t("table", { label })}</Flip>
    </span>
  );
}

export function LanguageNav({ languages }: { languages: readonly LanguageLink[] }) {
  const { t, locale } = useGuestI18n();
  const offered = routing.locales.flatMap((l) => languages.filter((x) => x.locale === l));
  if (offered.length <= 1) return null;
  return (
    <nav aria-label={t("language.label")} className="flex flex-none items-center">
      {offered.map(({ locale: l, href }) => (
        <a
          key={l}
          href={href}
          lang={l}
          hrefLang={l}
          aria-current={l === locale ? "true" : undefined}
          className={`text-muted hover:text-ink aria-[current=true]:text-ink grid min-h-11 min-w-11 place-items-center px-1.5 text-sm font-semibold ${styles.navlink} ${styles.flip}`}
        >
          <Flip>{t(`language.${l}`)}</Flip>
        </a>
      ))}
    </nav>
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
  home,
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
  /** The café's name and wordmark lead to the menu. */
  home?: HomeLink;
}) {
  const { locale } = useGuestI18n();
  const nameLang = scriptLang(cafeName);
  const tableChip = tableLabel && <TableChip label={tableLabel} />;
  const languageNav = <LanguageNav languages={languages} />;

  if (compact)
    return (
      <header className={`guest-head text-ink ${styles.bar}`} data-compact="">
        <div className="mx-auto flex min-h-16 w-full max-w-[1120px] min-w-0 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 md:px-8">
          <BrandMark as="h1" cafeName={cafeName} logoUrl={logoUrl} wordmarkUrl={wordmarkUrl} home={home} />
          {tableChip}
          {languageNav}
          {tools}
        </div>
      </header>
    );

  return (
    // guest-head: the brand's header band hooks here (globals.css).
    <header className="guest-head text-ink">
      <div className="mx-auto grid w-full max-w-[1120px] min-w-0 gap-5 px-4 pt-4 pb-2 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:gap-x-8 md:pt-6">
        {/* Two groups that wrap: the logo and table on the left; languages and
            the round buttons on the right, dropping to their own line when a
            narrow phone can't hold both (a logo, «Սեղան 12», three languages).
            Beside the name from 768 px. */}
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2 md:col-start-2 md:row-start-1 md:justify-end">
          {(logoUrl || tableLabel) && (
            <div className="flex min-w-0 items-center gap-3">
              {logoUrl && (
                <Home home={home} label={cafeName}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- public Storage URL, already sized webp */}
                  <img
                    src={logoUrl}
                    alt=""
                    width={44}
                    height={44}
                    decoding="async"
                    // Beside the wordmark (768 px and up) the mark would say the name twice.
                    className={`bg-surface shadow-plate size-11 flex-none rounded-full object-cover ${wordmarkUrl ? "md:hidden" : ""}`}
                  />
                </Home>
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
              <Home home={home} label={cafeName}>
                {/* eslint-disable-next-line @next/next/no-img-element -- public Storage URL, resized webp */}
                <img
                  src={wordmarkUrl}
                  alt={cafeName}
                  height={96}
                  className={`guest-wordmark ${styles.wordmark}`}
                />
              </Home>
            </h1>
          ) : (
            <SplitText
              as="h1"
              reveal="load"
              text={cafeName}
              lang={nameLang && nameLang !== locale ? nameLang : undefined}
              className="display-face text-title block text-[clamp(1.75rem,6vw,2.5rem)] leading-[1.1] text-balance [overflow-wrap:anywhere]"
            />
          )}
        </div>
      </div>
    </header>
  );
}
