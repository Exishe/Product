"use client";

import type { ReactNode } from "react";
import { BrandMark, LanguageNav, TableChip, type HomeLink, type LanguageLink } from "./guest-header";

// The menu's bar (design battle entry B): a white strip with the café's mark on
// the left and the table and languages on the right, then one beige band holding
// the section groups and the search with the allergy filter. On a phone the
// search comes first and the groups sit under it as tabs; from 1024 px the groups
// take the left of the band and the search the right. The whole header stays at
// the top while the menu scrolls; the section dropdown opens under it
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
  return (
    <header data-menubar="" data-testid="menubar" className="bg-surface sticky top-0 z-20">
      <div className="mx-auto flex w-full max-w-[1240px] items-center gap-3 px-4 py-1.5 md:px-8">
        <div className="min-w-0 flex-1">
          <BrandMark cafeName={cafeName} logoUrl={logoUrl} wordmarkUrl={wordmarkUrl} home={home} as="h1" />
        </div>
        <div className="flex flex-none items-center gap-1.5">
          {tableLabel && <TableChip label={tableLabel} />}
          <LanguageNav languages={languages} />
          {tools}
        </div>
      </div>
      <div className="bg-[var(--guest-band)] border-line border-b">
        <div className="mx-auto flex w-full max-w-[1240px] flex-wrap items-end gap-x-6 px-4 pt-3 md:px-8 lg:pt-2">
          <div className="w-full lg:order-2 lg:w-[26rem] lg:flex-none lg:pb-2">{search}</div>
          <div className="w-full min-w-0 lg:order-1 lg:w-auto lg:flex-1">{nav}</div>
        </div>
      </div>
    </header>
  );
}
