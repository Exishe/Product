"use client";

import { Ban } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { DirectResult } from "./actions";
import { button } from "./ui";

// "Table 4: Lamb ribs can't be made. The guest was told." (ADR-081) stays on the
// table panel until the waiter has spoken to the guest and taps "Told the guest".
// Staff screens stay neutral: the same amber the other alerts use.
export function CantMakeCards({
  items,
  onAck,
}: {
  items: { id: string; name: string }[];
  onAck: (lineId: string) => Promise<DirectResult>;
}) {
  const t = useTranslations("waiter.cantMake");
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  if (items.length === 0) return null;

  const answer = async (id: string) => {
    setBusy(id);
    setFailed(false);
    const res = await onAck(id);
    setBusy(null);
    if (!res.ok && res.reason !== "stale") setFailed(true);
  };

  return (
    <div className="grid gap-3" data-testid="cant-make-alerts">
      {items.map((i) => (
        <div
          key={i.id}
          data-testid="cant-make-alert"
          className="bg-amber-tint -mx-4 grid gap-3 px-4 py-3 lg:-mx-6 lg:px-6"
        >
          <p className="text-ink m-0 flex items-start gap-2 font-semibold">
            <Ban aria-hidden="true" className="text-amber-text mt-0.5 size-5 shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{t("text", { dish: i.name })}</span>
          </p>
          <p className="text-staff-label2 m-0 text-[0.9375rem]">{t("hint")}</p>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void answer(i.id)}
            className={button("primary", "min-h-12 justify-self-start")}
            data-testid="cant-make-ack"
          >
            {t("told")}
          </button>
        </div>
      ))}
      {failed && (
        <p role="alert" className="text-pomegranate m-0 text-[0.9375rem] font-semibold">
          {t("failed")}
        </p>
      )}
    </div>
  );
}
