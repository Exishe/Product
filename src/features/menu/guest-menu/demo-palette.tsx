"use client";

import { useEffect, useRef, useState } from "react";
import { DEMO_PALETTE_KEY } from "@/features/guest-theme/demo";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";

type Palette = "mono" | "blue";

// The demo cafés' colour switch (owner, Nov 2026): black and white, or blue and
// white. Two round swatches at the top of the menu; the current one is ringed.
// The choice is kept on this phone and set on the café's .guest-lux before the
// first paint (guest-theme-scope.tsx). Hidden outside the demo cafés (globals.css).
export function DemoPalette() {
  const { t } = useGuestI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [palette, setPalette] = useState<Palette>("mono");

  useEffect(() => {
    const root = ref.current?.closest(".guest-lux[data-demo]");
    // The page may have opened in blue (the inline script or DemoPaletteSync); show that.
    let saved: string | null = null;
    try {
      saved = window.localStorage.getItem(DEMO_PALETTE_KEY);
    } catch {
      // storage blocked: fall back to what the page shows
    }
    if (saved === "blue" || root?.getAttribute("data-demo-palette") === "blue") setPalette("blue");
  }, []);

  const pick = (next: Palette) => {
    setPalette(next);
    const root = ref.current?.closest(".guest-lux[data-demo]");
    if (next === "blue") root?.setAttribute("data-demo-palette", "blue");
    else root?.removeAttribute("data-demo-palette");
    try {
      window.localStorage.setItem(DEMO_PALETTE_KEY, next);
    } catch {
      // Private mode: the switch still works for this visit.
    }
  };

  // One small segmented control: a 40 px track holding two 20 px dots, the
  // current one ringed. Each button is a full 44x44 target, 4 px from the
  // other, so a shaky finger doesn't land on the wrong colour.
  return (
    <div
      ref={ref}
      role="group"
      aria-label={t("palette.label")}
      className="demo-palette flex h-11 flex-none items-center"
    >
      <span className="flex h-10 items-center gap-1 rounded-full bg-[var(--guest-chip)]">
        {(["mono", "blue"] as const).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={palette === p}
            aria-label={t(`palette.${p}`)}
            title={t(`palette.${p}`)}
            onClick={() => pick(p)}
            className="group -my-0.5 grid size-11 place-items-center rounded-full"
          >
            <span
              aria-hidden="true"
              className={`block size-5 rounded-full group-aria-pressed:shadow-[0_0_0_2px_var(--guest-chip),0_0_0_4px_var(--guest-ink)] ${
                p === "mono" ? "bg-[#111111]" : "bg-[#1d4ed8]"
              }`}
            />
          </button>
        ))}
      </span>
    </div>
  );
}
