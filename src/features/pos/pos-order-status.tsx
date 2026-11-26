"use client";

import { clsx } from "clsx";
import { Check, CircleAlert, Loader, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { WaiterPosSend } from "./waiter-pos";

// A small POS line on a waiter's order card (ADR-093): sent ✓, sending, or
// failed with the reason and «Կրկին ուղարկել». Changes after sending are not
// pushed to the POS, so a cancelled line asks the waiter to change it there too.
export function PosOrderStatus({
  send,
  changed,
  onRetry,
}: {
  send: WaiterPosSend;
  changed: boolean;
  onRetry: (id: number) => Promise<{ ok: boolean }>;
}) {
  const t = useTranslations("waiter.pos");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const bad = send.status === "failed" || send.status === "dead";
  const base =
    "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.8125rem] leading-5 font-semibold [&_svg]:size-3.5 [&_svg]:shrink-0";

  return (
    <div className="grid gap-1.5" data-testid="pos-status" data-status={send.status}>
      <span
        className={clsx(
          base,
          "self-start",
          send.status === "sent"
            ? "bg-tarragon-tint text-tarragon"
            : bad
              ? "bg-pom-tint text-pomegranate"
              : "bg-staff-fill text-staff-label2",
        )}
      >
        {send.status === "sent" && <Check aria-hidden="true" />}
        {(send.status === "pending" || send.status === "sending") && <Loader aria-hidden="true" />}
        {bad && <CircleAlert aria-hidden="true" />}
        {send.status === "sent"
          ? t("sent")
          : send.status === "skipped"
            ? t("skipped")
            : bad
              ? t("failed")
              : t("sending")}
      </span>
      {bad && send.error && <p className="text-pomegranate m-0 text-[0.875rem] break-words">{send.error}</p>}
      {bad && (
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setFailed(false);
            const res = await onRetry(send.id);
            setBusy(false);
            if (!res.ok) setFailed(true);
          }}
          className="border-staff-sep text-ink inline-flex min-h-11 items-center gap-2 self-start rounded-xl border px-4 text-[0.9375rem] font-semibold disabled:opacity-50"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          {t("retry")}
        </button>
      )}
      {failed && (
        <p role="alert" className="text-pomegranate m-0 text-[0.875rem]">
          {t("retryFailed")}
        </p>
      )}
      {changed && send.status === "sent" && <p className="text-amber-text m-0 text-[0.875rem]">{t("changeInPos")}</p>}
    </div>
  );
}
