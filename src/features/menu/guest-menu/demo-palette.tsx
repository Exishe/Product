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
    // The page may have opened in blue (the inline script); show that.
    if (root?.getAttribute("data-demo-palette") === "blue") setPalette("blue");
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

  // One small segmented control: a 36 px track holding two solid dots, the
  // current one ringed. Each button keeps a 44 px hit area (it reaches past
  // the track's top and bottom), so the switch looks small but taps easily.
  return (
    <div
      ref={ref}
      role="group"
      aria-label={t("palette.label")}
      className="demo-palette mr-2 flex h-11 flex-none items-center"
    >
      <span className="rounded-guest-md flex h-9 items-center bg-[var(--guest-chip)] px-0.5">
        {(["mono", "blue"] as const).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={palette === p}
            aria-label={t(`palette.${p}`)}
            title={t(`palette.${p}`)}
            onClick={() => pick(p)}
            className="group -my-1 grid h-11 w-9 place-items-center"
          >
            <span
              aria-hidden="true"
              className={`block size-4 rounded-full group-aria-pressed:shadow-[0_0_0_2px_var(--guest-surface),0_0_0_3.5px_var(--guest-ink)] ${
                p === "mono" ? "bg-[#111111]" : "bg-[#1d4ed8]"
              }`}
            />
          </button>
        ))}
      </span>
    </div>
  );
}
