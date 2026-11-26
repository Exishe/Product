"use client";

import { clsx } from "clsx";
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type ShowcasePanel = {
  id: string;
  tab: string;
  title: string;
  text: string;
  alt: string;
  // Two or three short lines on what the picture shows, as a dash list.
  points: string[];
  // An optional muted line under the list (the kitchen's language note).
  note?: string;
  // Every surface has a portrait screenshot (420x688 CSS px at 2x, or a
  // little shorter when its content ends sooner). The
  // kitchen also has a wide one (720x688 at 2x) from md up; the other
  // surfaces stay one phone screen at every width.
  phone: { src: string; width: number; height: number };
  wide?: { src: string; width: number; height: number };
};

// The landing page's product showcase (benchmark 2.1): one row of tabs and one
// screenshot straight on the band, instead of a grid of boxed cards. One
// subject per tab, shown at 1:1 from lg up so the text in it reads at 14 px
// or more: a phone screen, or a 720 px crop of the kitchen board. On tablets
// every picture sits in a 45:43 stage; from lg every picture has one height
// (688 px at xl) and sits on the container's right edge, with the text taking
// the rest of the row: switching tabs never moves the page, the picture's
// right edge or the text's left edge. Tabs follow the WAI-ARIA tabs pattern: arrows, Home and End move
// between them and select at once. Below sm the tabs are a 2x2 grid of 48 px
// tabs, each on its own hairline (four Armenian labels need 313 of the 328 px
// at 360, which leaves no gap between them), so no label is cut or hidden
// off-screen; from sm they sit in one row with 24/32 px gaps. A new
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
      {/* The hairline is an inset shadow (each tab's below sm, the row's from
          sm), so the selected tab's underline sits on it. From sm each tab has an 8 px side pad under a
          -8 px margin, so the labels keep their 24/32 px gaps and the focus
          ring has room around the label. */}
      <div className="sm:shadow-[inset_0_-1px_0_var(--color-sand-line)]">
        <div
          role="tablist"
          aria-labelledby={labelledBy}
          onKeyDown={onKeyDown}
          className="grid grid-cols-2 gap-x-6 sm:-mx-2 sm:flex sm:gap-6 md:gap-8"
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
              className="text-slate hover:text-ink aria-selected:text-ink after:bg-ink text-name focus-visible:outline-ink relative flex h-12 min-w-11 shrink-0 items-center justify-start font-semibold tracking-normal whitespace-nowrap shadow-[inset_0_-1px_0_var(--color-sand-line)] after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:opacity-0 focus-visible:outline-2 focus-visible:-outline-offset-2 aria-selected:after:opacity-100 sm:justify-center sm:rounded-lg sm:px-2 sm:shadow-none sm:after:inset-x-2"
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
          className="motion-safe:animate-in motion-safe:fade-in mt-8 grid gap-6 motion-safe:duration-200 md:mt-10 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start lg:gap-12"
        >
          {/* Every picture is framed like the hero's: a 20 px radius and the
              same soft shadow, its own background running to the edge.
              The stage: 45:43 on tablets, the picture filling its height and
              centred. From lg the stage is exactly as wide as its picture (one
              height for all: 612 px at lg, 688 at xl), on the container's
              right edge, so a phone screen leaves its spare width to the
              text instead of to an empty gap between the two. */}
          <div
            className={clsx(
              "md:flex md:aspect-[45/43] md:justify-center lg:order-2 lg:aspect-auto",
              p.wide ? "lg:w-[40rem] xl:w-[45rem]" : "lg:w-[23.375rem] xl:w-[26.25rem]",
            )}
          >
            {/* A fixed 420:688 slot (720:688 for a wide picture from md), so a
                picture cut a little shorter than the screen (the admin list)
                sits at its top and switching tabs never changes the height. */}
            <div
              className={clsx(
                "aspect-[420/688] w-full md:h-full md:w-auto md:max-w-full lg:h-auto lg:w-full",
                p.wide && "md:aspect-[720/688]",
              )}
            >
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
                  className="shadow-soft-float block h-auto w-full rounded-[20px]"
                />
              </picture>
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 lg:order-1">
            <h3 className="text-subtitle m-0 font-semibold text-balance lg:-mt-1">{p.title}</h3>
            <p className="text-slate text-name m-0 max-w-[40ch] leading-normal text-pretty">{p.text}</p>
            <ul className="text-name [&>li]:before:text-slate m-0 mt-2 flex max-w-[40ch] list-none flex-col gap-2 p-0 leading-normal text-pretty [&>li]:relative [&>li]:pl-5 [&>li]:before:absolute [&>li]:before:left-0 [&>li]:before:content-['–']">
              {p.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            {p.note && (
              <p className="text-slate text-label m-0 mt-1 max-w-[40ch] leading-normal text-pretty">
                {p.note}
              </p>
            )}
            <div className="mt-4">{action}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
