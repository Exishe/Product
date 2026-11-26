"use client";

import { DemoPalette } from "./demo-palette";
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
      className="inline-flex min-h-11 max-w-full items-center rounded-lg transition-opacity hover:opacity-80 active:opacity-60"
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

// The café in a bar: its wordmark at the bar's height (never narrower than
// 88 px), or its mark and the full name at 20 px. The name keeps whole words
// (it wraps between words only, never cut with an ellipsis); the bar gives it
// at least 9.5rem before anything sits beside it.
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
          <img
            src={wordmarkUrl}
            alt={cafeName}
            height={40}
            className={styles.barWordmark}
            data-testid={wordmarkTestId}
          />
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
          className="border-line size-9 flex-none rounded-full border object-cover"
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

/** The table under the café's name: one quiet 15 px line, «Սեղան 5», with a table mark. */
export function TableChip({ label }: { label: string }) {
  const { t } = useGuestI18n();
  return (
    <span className="text-muted flex min-h-11 min-w-0 items-center text-label" data-testid="table-chip">
      <span className="inline-flex items-center gap-1.5">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="flex-none"
        >
          <path d="M3 9h18M5 9v10M19 9v10M8 9V6h8v3" />
        </svg>
        {t("table", { label })}
      </span>
    </span>
  );
}

/** Հայ · Рус · Eng, keeping the table token: three 44 px tabs 4 px apart, the current one filled. */
export function LanguageNav({ languages }: { languages: readonly LanguageLink[] }) {
  const { t, locale, switchLocale } = useGuestI18n();
  const offered = routing.locales.flatMap((l) => languages.filter((x) => x.locale === l));
  if (offered.length <= 1) return null;
  return (
    <nav aria-label={t("language.label")} className="flex flex-none items-center gap-1">
      {offered.map(({ locale: l, href }) => (
        <a
          key={l}
          href={href}
          // In place, without a page load (ADR-092): the cart, an open dish or
          // order view and the scroll position stay. A new tab, or a language
          // whose texts aren't on the page, follows the link.
          onClick={(e) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            if (switchLocale(l)) e.preventDefault();
          }}
          lang={l}
          hrefLang={l}
          aria-current={l === locale ? "true" : undefined}
          className={`group text-muted hover:text-ink aria-[current=true]:text-ink grid min-h-11 min-w-11 place-items-center text-label aria-[current=true]:font-semibold ${styles.flip}`}
        >
          <Flip>
            <span className="group-aria-[current=true]:bg-chip rounded-guest-sm px-2 py-1">
              {t(`language.${l}`)}
            </span>
          </Flip>
        </a>
      ))}
    </nav>
  );
}

// The guest bar (ADR-094 area pass), the same on the menu, the order view and
// the status page: one row with the café (its wordmark or name, given room
// first) and the languages, then one quiet meta row: the table, or what the
// guest needs to know without one, with the demo's colour switch and the
// page's own tools on the right. Nothing in it squeezes the name; at large
// text sizes the languages and tools wrap under it instead of off the screen.
export function GuestBar({
  brand,
  tableLabel,
  note = null,
  languages,
  tools,
  width = "max-w-[1240px]",
  oneRow = false,
}: {
  brand: ReactNode;
  tableLabel: string | null;
  /** Shown in the meta row when there is no table (scan the QR code). */
  note?: ReactNode;
  languages: readonly LanguageLink[];
  /** Buttons on the right of the meta row (order more; the cart from 1024 px). */
  tools?: ReactNode;
  width?: string;
  /**
   * From 1024 px the two rows become one (the menu): the café and its table
   * on the left, the colour switch, the tools and the languages on the right.
   */
  oneRow?: boolean;
}) {
  const lg = (cls: string) => (oneRow ? cls : "");
  return (
    <div className={`mx-auto w-full ${width} min-w-0 px-4 md:px-8 ${lg("lg:flex lg:min-h-16 lg:items-center lg:gap-x-5 lg:pt-2")}`}>
      <div className={`flex min-h-14 flex-wrap items-center gap-x-3 pt-1 ${lg("lg:contents")}`}>
        <div className={`flex min-w-[min(9.5rem,45vw)] flex-1 items-center ${lg("lg:min-w-0 lg:flex-initial")}`}>
          {brand}
        </div>
        {/* ml-auto at every width: the languages stay at the right edge in
            one-row mode too, whatever the meta row holds (or when it is hidden). */}
        <div
          className={`ml-auto flex max-w-full flex-none flex-wrap items-center justify-end ${lg("lg:order-last")}`}
        >
          <LanguageNav languages={languages} />
        </div>
      </div>
      <div className={`guest-meta flex min-h-11 flex-wrap items-center gap-x-2 pb-1 ${lg("lg:contents")}`}>
        {tableLabel ? <TableChip label={tableLabel} /> : note}
        {/* The note takes the free room itself (it wraps beside the switch). */}
        {(tableLabel || !note) && <span aria-hidden="true" className="flex-1" />}
        <DemoPalette />
        {tools}
      </div>
    </div>
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
// Switching language happens in place (ADR-092): the page swaps its texts,
// <html lang> and the address, and nothing the guest has open is lost.
export function GuestHeader({
  cafeName,
  logoUrl,
  wordmarkUrl = null,
  tableLabel,
  languages,
  tools,
  compact = false,
  width = "max-w-[1120px]",
  oneRow = false,
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
  /** The compact bar's column (the order page's 48rem, so the bar and the page share one column). */
  width?: string;
  /** The compact bar in one row from 1024 px, as on the menu (GuestBar `oneRow`). */
  oneRow?: boolean;
  /** The café's name and wordmark lead to the menu. */
  home?: HomeLink;
}) {
  const { locale } = useGuestI18n();
  const nameLang = scriptLang(cafeName);
  const tableChip = tableLabel && <TableChip label={tableLabel} />;
  const languageNav = (
    <>
      <DemoPalette />
      <LanguageNav languages={languages} />
    </>
  );

  if (compact)
    return (
      <header className={`guest-head text-ink ${styles.bar}`} data-compact="">
        <GuestBar
          brand={<BrandMark as="h1" cafeName={cafeName} logoUrl={logoUrl} wordmarkUrl={wordmarkUrl} home={home} />}
          tableLabel={tableLabel}
          languages={languages}
          tools={tools}
          width={width}
          oneRow={oneRow}
        />
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
