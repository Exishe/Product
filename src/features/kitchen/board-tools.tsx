"use client";

import { clsx } from "clsx";
import { Power } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { HeaderMenu } from "@/features/staff/header-menu";

// The header's round tool (48 px, white, one edge), the same shape as the
// waiter app's header tools.
export const TOOL_ICON =
  "bg-basalt-3 text-slip inline-grid size-12 shrink-0 place-items-center rounded-full";

// A row in the «…» menu: 56 px, the icon and the words, no frame.
export const MENU_ROW =
  "text-slip hover:bg-basalt-2 flex min-h-14 w-full items-center gap-3 rounded-xl px-3 text-left text-[1.0625rem] font-semibold [&_svg]:size-5 [&_svg]:shrink-0";

// «…» on the board: Ingredient out, the password and the end of the shift, so
// the row a wet hand reaches for holds only Busy and Out today.
export function ToolsMenu({ badge, children }: { badge: number; children: ReactNode }) {
  const t = useTranslations("kitchen");
  return (
    <HeaderMenu
      label={t("more")}
      testId="kitchen-more"
      badge={badge}
      buttonClassName={TOOL_ICON}
      panelClassName="text-slip border-(--kds-frame) bg-white"
    >
      {children}
    </HeaderMenu>
  );
}

// Ending the shift silences the board, so it takes two taps: the first turns
// the row into «Ավարտե՞լ» for 4 seconds, the second ends it.
export function EndShiftRow({ onEnd }: { onEnd: () => void }) {
  const t = useTranslations("kitchen.shift");
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return;
    const timer = window.setTimeout(() => setAsking(false), 4_000);
    return () => window.clearTimeout(timer);
  }, [asking]);
  return (
    <div className="mt-1 border-t border-(--kds-frame) pt-2">
      {asking ? (
        <button
          type="button"
          data-testid="end-shift"
          data-state="confirm"
          aria-label={t("end")}
          onClick={onEnd}
          className={clsx(MENU_ROW, "bg-slip hover:bg-slip text-white")}
        >
          <Power aria-hidden="true" />
          {t("confirmEnd")}
        </button>
      ) : (
        <button type="button" data-testid="end-shift" onClick={() => setAsking(true)} className={MENU_ROW}>
          <Power aria-hidden="true" />
          {t("end")}
        </button>
      )}
    </div>
  );
}
