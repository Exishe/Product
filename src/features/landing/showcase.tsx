"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type ShowcasePanel = {
  id: string;
  tab: string;
  title: string;
  text: string;
  alt: string;
  // One screenshot for phones (portrait) and one for wider screens.
  phone: { src: string; width: number; height: number };
  wide: { src: string; width: number; height: number };
};

// The landing page's product showcase (benchmark 2.1): one row of tabs and one
// large screenshot straight on the band, instead of a grid of boxed cards.
// Tabs follow the WAI-ARIA tabs pattern: arrows, Home and End move between
// them and select at once. A new panel fades in over 200 ms (off under
// reduced motion). Hidden panels keep their lazy images unloaded.
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
      <div className="border-sand-line border-b">
        <div
          role="tablist"
          aria-labelledby={labelledBy}
          onKeyDown={onKeyDown}
          className="-mx-1 flex justify-between sm:-mx-3 sm:justify-start sm:gap-2"
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
              className="text-slate hover:text-ink aria-selected:text-ink after:bg-ink text-label md:text-name relative -mb-px flex h-12 min-w-11 items-center justify-center px-1 font-semibold whitespace-nowrap after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:rounded-full after:opacity-0 aria-selected:after:opacity-100 sm:px-3 sm:after:inset-x-3"
            >
              {p.tab}
            </button>
          ))}
        </div>
      </div>

      {panels.map((p, i) => (
        <div
          key={p.id}
          role="tabpanel"
          id={`${base}-panel-${p.id}`}
          aria-labelledby={`${base}-tab-${p.id}`}
          hidden={i !== active}
          className="motion-safe:animate-in motion-safe:fade-in mt-8 grid gap-6 motion-safe:duration-200 md:mt-10 lg:grid-cols-12 lg:items-center lg:gap-8"
        >
          <picture className="block lg:order-2 lg:col-span-8">
            <source
              media="(min-width: 48rem)"
              srcSet={p.wide.src}
              width={p.wide.width}
              height={p.wide.height}
            />
            {/* A static webp at 2x; no image runtime on the landing. */}
            <img
              src={p.phone.src}
              width={p.phone.width}
              height={p.phone.height}
              alt={p.alt}
              loading={i === 0 ? "eager" : "lazy"}
              decoding="async"
              className="block h-auto w-full rounded-[20px]"
            />
          </picture>
          <div className="flex flex-col items-start gap-3 lg:order-1 lg:col-span-4">
            <h3 className="text-subtitle m-0 font-semibold text-balance">{p.title}</h3>
            <p className="text-slate text-name m-0 max-w-[34ch] leading-normal text-pretty">{p.text}</p>
            <div className="mt-3">{action}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
