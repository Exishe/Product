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

  return (
    <div
      ref={ref}
      role="group"
      aria-label={t("palette.label")}
      className="demo-palette flex flex-none items-center"
    >
      {(["mono", "blue"] as const).map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={palette === p}
          aria-label={t(`palette.${p}`)}
          title={t(`palette.${p}`)}
          onClick={() => pick(p)}
          className="group grid size-11 place-items-center rounded-full"
        >
          <span
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-full ring-1 ring-black/15 ring-offset-2 ring-offset-[var(--guest-surface)] group-aria-pressed:ring-2 group-aria-pressed:ring-[var(--guest-ink)]"
          >
            <span
              className={`block size-6 overflow-hidden rounded-full ${p === "mono" ? "bg-[linear-gradient(90deg,#111_50%,#fff_50%)]" : "bg-[linear-gradient(90deg,#1d4ed8_50%,#fff_50%)]"}`}
            />
          </span>
        </button>
      ))}
    </div>
  );
}
