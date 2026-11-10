"use client";

import { clsx } from "clsx";
import { useLocale, useTranslations } from "next-intl";
import { useId, useState } from "react";
import type { Locale } from "@/i18n/routing";
import { formatAmd } from "@/lib/format/money";
import type { DirectResult } from "./actions";
import { settlement, type PayInput, type PayMode, type Payment } from "./floor-model";
import { button, Sheet } from "./ui";

const MODES: readonly PayMode[] = ["cash", "card", "split"];

// Closing the table (screens.md §6): cash, card or both; the amounts must add
// up to the bill. Online only: money never waits in a queue (realtime.md).
export function SettleSheet({
  label,
  total,
  oldBill,
  online,
  onClose,
  onConfirm,
}: {
  label: string;
  total: number;
  oldBill: boolean;
  online: boolean;
  onClose: () => void;
  onConfirm: (payments: Payment[]) => Promise<DirectResult>;
}) {
  const t = useTranslations("waiter");
  const locale = useLocale() as Locale;
  const id = useId();
  const [input, setInput] = useState<PayInput>({ mode: null, cash: "", card: "" });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const result = settlement(input, total);

  const pick = (mode: PayMode) => {
    if (mode === "split") {
      const half = Math.round(total / 2);
      setInput({ mode, cash: String(half), card: String(total - half) });
    } else {
      setInput((x) => ({ ...x, mode }));
    }
  };

  const confirm = async () => {
    setBusy(true);
    setFailed(false);
    const res = await onConfirm(result.payments);
    setBusy(false);
    if (!res.ok && res.reason === "network") setFailed(true);
  };

  return (
    <Sheet labelledBy={id} onClose={onClose}>
      <div className="grid gap-4 p-6">
        <h2 id={id} className="display-face m-0 text-[2.375rem] leading-none">
          {t("panel.table", { label })}
        </h2>
        {oldBill && <p className="m-0 font-semibold text-muted">{t("settle.oldBill")}</p>}
        <h3 className="m-0 text-2xl">{t("settle.title")}</h3>
        <div role="group" aria-label={t("settle.modes")} className="grid grid-cols-3 gap-2">
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={input.mode === m}
              onClick={() => pick(m)}
              className={clsx(button("quiet"), "aria-pressed:border-tarragon aria-pressed:bg-tarragon aria-pressed:text-white")}
            >
              {t(`settle.${m}`)}
            </button>
          ))}
        </div>
        {input.mode === "split" && (
          <div className="grid grid-cols-2 gap-3">
            {(["cash", "card"] as const).map((k) => (
              <label key={k} className="grid gap-1 text-sm font-semibold">
                {t(`settle.${k}`)}
                <input
                  inputMode="numeric"
                  value={input[k]}
                  onChange={(e) => setInput((x) => ({ ...x, [k]: e.target.value.replace(/\D/g, "") }))}
                  className="num min-h-[52px] w-full min-w-0 rounded-input border border-line-strong px-3 text-xl"
                />
              </label>
            ))}
          </div>
        )}
        {input.mode === "split" && !result.ok && (
          <p role="alert" data-testid="mismatch" className="m-0 font-semibold text-pomegranate">
            {t("settle.mismatch", { total: formatAmd(total, locale), paid: formatAmd(result.paid, locale) })}
          </p>
        )}
        {!online && <p className="m-0 font-semibold text-pomegranate">{t("settle.offline")}</p>}
        {failed && online && <p className="m-0 font-semibold text-pomegranate">{t("settle.failed")}</p>}
        <div className="flex justify-between border-t border-line pt-4 text-2xl font-bold">
          <span>{t("panel.total")}</span>
          <span className="num">{formatAmd(total, locale)}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button type="button" className={button("quiet")} onClick={onClose}>
            {t("settle.back")}
          </button>
          <button type="button" className={button("ink")} disabled={!result.ok || !online || busy} onClick={() => void confirm()}>
            {t("settle.confirm")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
