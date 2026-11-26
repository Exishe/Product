"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BrandMark, GuestBar, type HomeLink, type LanguageLink } from "./guest-header";

/**
 * The menu's three desktop columns (ADR-096): the section list, the dishes and
 * the order rail. The band uses it too, so the search sits over the dishes and
 * all three columns start on one line under it.
 */
export const MENU_GRID =
  "lg:grid lg:grid-cols-[12rem_minmax(0,1fr)_19rem] lg:gap-x-8 xl:grid-cols-[13rem_minmax(0,1fr)_21rem] xl:gap-x-10";

// The menu's top (ADR-094 area pass, benchmark §2.1). The guest bar (the café,
// the languages, then the table or why there is none) sits on the page and
// scrolls away; only the band under it stays: the search pill and one row of
// section tabs, about 104 px on a phone, a sixth of the screen instead of a
// third. A hairline shows under the band once the page has scrolled under it.
// The band publishes its height as --guest-sticky on <html> (section headings
// and focused controls land just under it) and is what the section tabs
// measure for the scroll-spy (data-menubar).
export function MenuBar({
  cafeName,
  logoUrl,
  wordmarkUrl,
  home,
  tableLabel,
  note,
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
  /** Under the café's name when there is no table (scan the QR code). */
  note?: ReactNode;
  languages: readonly LanguageLink[];
  /** The section tabs. */
  nav: ReactNode;
  /** The order button (from 1024 px). */
  tools: ReactNode;
  /** The search pill (and the filter inside it). */
  search: ReactNode;
}) {
  const [stuck, setStuck] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(!e!.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const observer = useRef<ResizeObserver | null>(null);
  const band = useCallback((el: HTMLDivElement | null) => {
    const root = document.documentElement;
    observer.current?.disconnect();
    if (!el) {
      root.style.removeProperty("--guest-sticky");
      return;
    }
    const publish = () => root.style.setProperty("--guest-sticky", `${Math.round(el.offsetHeight)}px`);
    publish();
    observer.current = new ResizeObserver(publish);
    observer.current.observe(el);
  }, []);
  return (
    <>
      <header data-testid="menubar" className="guest-head bg-surface text-ink">
        <GuestBar
          brand={<BrandMark cafeName={cafeName} logoUrl={logoUrl} wordmarkUrl={wordmarkUrl} home={home} as="h1" />}
          tableLabel={tableLabel}
          note={note}
          languages={languages}
          tools={tools}
          width="max-w-[1440px]"
          oneRow
        />
      </header>
      <div ref={sentinel} aria-hidden="true" className="h-px" />
      <div
        ref={band}
        data-menubar=""
        data-testid="menuband"
        data-stuck={stuck || undefined}
        className="sticky top-0 z-20 -mt-px border-b border-transparent bg-[var(--guest-band)] transition-[border-color] duration-200 data-[stuck]:border-[var(--guest-line)]"
      >
        <div className={`mx-auto w-full max-w-[1440px] px-4 pt-1 md:px-8 lg:py-3 ${MENU_GRID}`}>
          <div className="w-full lg:col-start-2">{search}</div>
          <div className="w-full min-w-0 lg:hidden">{nav}</div>
        </div>
      </div>
    </>
  );
}
