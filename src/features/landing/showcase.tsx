"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type ShowcasePanel = {
  id: string;
  tab: string;
  title: string;
  text: string;
  alt: string;
  // An optional muted line under the text (the kitchen's language note).
  note?: string;
  // Every surface has a portrait screenshot (420x630 CSS px at 2x). The
  // kitchen and the admin also have a wide one (720x630 at 2x) from md up;
  // the guest menu and the waiter app stay one phone screen at every width.
  phone: { src: string; width: number; height: number };
  wide?: { src: string; width: number; height: number };
};

// The landing page's product showcase (benchmark 2.1): one row of tabs and one
// screenshot straight on the band, instead of a grid of boxed cards. One
// subject per tab, shown close to 1:1 from md up so the text in it reads at
// 14 px or more: a phone screen, or a 720 px crop of the kitchen or admin.
// Every picture sits in a stage of one height, so switching tabs never moves
// the page. Tabs follow the WAI-ARIA tabs pattern: arrows, Home and End move
// between them and select at once. On narrow phones the row scrolls sideways
// (snapping, no scrollbar) rather than squeezing the labels together. A new
// panel fades in over 200 ms (off under reduced motion). Hidden panels keep
// their lazy images unloaded.
export function Showcase({
  labelledBy,
  panels,
  action,
}: {
  labelledBy: string;
  panels: ShowcasePanel[];
  action: ReactNode;
}) {
  const base = useId();
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const last = panels.length - 1;
    const next =
      event.key === "ArrowRight"
        ? active === last
          ? 0
          : active + 1
        : event.key === "ArrowLeft"
          ? active === 0
            ? last
            : active - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <div className="mt-6 md:mt-8">
      {/* The hairline is the row's own inset shadow, so the selected tab's
          underline can sit on it inside a scrolling row. On phones the row
          runs to the screen edges and its labels start on the 16 px gutter. */}
      <div
        role="tablist"
        aria-labelledby={labelledBy}
        onKeyDown={onKeyDown}
        className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-6 overflow-x-auto px-4 shadow-[inset_0_-1px_0_var(--color-sand-line)] [scrollbar-width:none] md:mx-0 md:gap-8 md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {panels.map((p, i) => (
          <button
            key={p.id}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${base}-tab-${p.id}`}
            aria-controls={`${base}-panel-${p.id}`}
            aria-selected={i === active}
            tabIndex={i === active ? 0 : -1}
            onClick={() => setActive(i)}
            className="text-slate hover:text-ink aria-selected:text-ink after:bg-ink text-label md:text-name relative flex h-12 min-w-11 shrink-0 snap-start items-center justify-center px-0 font-semibold tracking-normal whitespace-nowrap after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:opacity-0 aria-selected:after:opacity-100"
          >
            {p.tab}
          </button>
        ))}
      </div>

      {panels.map((p, i) => (
        <div
          key={p.id}
          role="tabpanel"
          id={`${base}-panel-${p.id}`}
          aria-labelledby={`${base}-tab-${p.id}`}
          hidden={i !== active}
          className="motion-safe:animate-in motion-safe:fade-in mt-8 grid gap-6 motion-safe:duration-200 md:mt-10 lg:grid-cols-[minmax(0,1fr)_40rem] lg:items-start lg:gap-12 xl:grid-cols-[minmax(0,1fr)_45rem]"
        >
          {/* The stage: 8:7 from md, the picture filling its height. */}
          <div className="md:flex md:aspect-[8/7] md:justify-center lg:order-2">
            <picture className="contents">
              {p.wide && (
                <source
                  media="(min-width: 48rem)"
                  srcSet={p.wide.src}
                  width={p.wide.width}
                  height={p.wide.height}
                />
              )}
              {/* A static webp at 2x; no image runtime on the landing. */}
              <img
                src={p.phone.src}
                width={p.phone.width}
                height={p.phone.height}
                alt={p.alt}
                loading={i === 0 ? "eager" : "lazy"}
                decoding="async"
                className="block h-auto w-full rounded-[20px] md:h-full md:w-auto md:max-w-full"
              />
            </picture>
          </div>
          <div className="flex flex-col items-start gap-3 lg:order-1">
            <h3 className="text-subtitle m-0 font-semibold text-balance lg:-mt-1">{p.title}</h3>
            <p className="text-slate text-name m-0 max-w-[34ch] leading-normal text-pretty">{p.text}</p>
            {p.note && (
              <p className="text-slate text-label m-0 max-w-[34ch] leading-normal text-pretty">{p.note}</p>
            )}
            <div className="mt-3">{action}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
