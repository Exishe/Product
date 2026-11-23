"use client";

import type { ReactNode } from "react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { BrandMark, LanguageNav, type HomeLink, type LanguageLink } from "./guest-header";

// The menu's one bar, on the page's own colour (no brand band behind it): the
// café's wordmark, the section groups (they refer to the page's sections, so
// they live in the bar), the table, the languages and the order button, with
// the search field in a thin, wide row under them. It stays at the top while
// the menu scrolls. On a phone the groups drop to a row of their own between
// the wordmark and the search. The section dropdown opens under the whole bar
// (category-nav.tsx finds it by data-menubar).
export function MenuBar({
  cafeName,
  logoUrl,
  wordmarkUrl,
  home,
  tableLabel,
  languages,
  nav,
  tools,
  search,
}: {
  cafeName: string;
  logoUrl: string | null;
  wordmarkUrl: string | null;
  home: HomeLink;
  tableLabel: string | null;
  languages: readonly LanguageLink[];
  /** The section groups. */
  nav: ReactNode;
  /** The order button. */
  tools: ReactNode;
  /** The search field (and the allergy filter). */
  search: ReactNode;
}) {
  const { t } = useGuestI18n();
  return (
    <header data-menubar="" data-testid="menubar" className="bg-page sticky top-0 z-20">
      <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center gap-x-3 gap-y-0.5 px-4 pt-2 md:px-8">
        <div className="min-w-0 flex-none">
          <BrandMark cafeName={cafeName} logoUrl={logoUrl} wordmarkUrl={wordmarkUrl} home={home} as="h1" />
        </div>
        <div className="order-last w-full min-w-0 lg:order-none lg:w-auto lg:flex-1">{nav}</div>
        <div className="ml-auto flex flex-none items-center gap-2 lg:ml-0">
          {tableLabel && (
            <span
              className="border-line-strong/60 text-ink rounded-pill flex-none border px-3 py-1 text-sm font-semibold whitespace-nowrap"
              data-testid="table-chip"
            >
              {t("table", { label: tableLabel })}
            </span>
          )}
          <LanguageNav languages={languages} />
          {tools}
        </div>
      </div>
      <div className="mx-auto w-full max-w-[1120px] px-4 pt-1 pb-2 md:px-8">{search}</div>
    </header>
  );
}
