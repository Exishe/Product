"use client";

import { useLocale, useTranslations } from "next-intl";
import { Banknote, Check, CircleAlert, CreditCard, Split, WifiOff } from "lucide-react";
import { useId, useState } from "react";
import type { Locale } from "@/i18n/routing";
import { formatAmd } from "@/lib/format/money";
import type { DirectResult } from "./actions";
import { settlement, type PayInput, type PayMode, type Payment } from "./floor-model";
import { RewardCards } from "./reward-card";
import type { WaiterReward } from "./rewards";
import { button, Sheet } from "./ui";

const MODE_ICON = { cash: Banknote, card: CreditCard, split: Split } as const;

const MODES: readonly PayMode[] = ["cash", "card", "split"];

// Closing the table (screens.md §6): cash, card or both; the amounts must add
// up to the bill. Online only: money never waits in a queue (realtime.md).
export function SettleSheet({
  label,
  total,
  oldBill,
  preferred,
  online,
  rewards = [],
  onReward,
  onClose,
  onConfirm,
}: {
  label: string;
  total: number;
  oldBill: boolean;
  // What the guest said they would use when asking for the bill; the waiter can change it.
  preferred?: "card" | "cash" | null;
  online: boolean;
  /** Open game rewards of this table stay on the bill until handled (ADR-075). */
  rewards?: WaiterReward[];
  onReward?: (id: string, action: "applied" | "dismissed") => Promise<DirectResult>;
  onClose: () => void;
  onConfirm: (payments: Payment[]) => Promise<DirectResult>;
}) {
  const t = useTranslations("waiter");
  const locale = useLocale() as Locale;
  const id = useId();
  const [input, setInput] = useState<PayInput>({ mode: preferred ?? null, cash: "", card: "" });
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
      <div className="grid gap-4 p-5 sm:p-6">
        <h2 id={id} className="m-0 text-[1.75rem] leading-tight font-bold">
          {t("panel.table", { label })}
        </h2>
        {oldBill && <p className="text-staff-label2 m-0 font-semibold">{t("settle.oldBill")}</p>}
        {onReward && <RewardCards rewards={rewards} onResolve={onReward} />}
        <h3 className="m-0 text-[1.25rem] font-bold">{t("settle.title")}</h3>
        <div role="group" aria-label={t("settle.modes")} className="grid grid-cols-3 gap-2">
          {MODES.map((m) => {
            const Icon = MODE_ICON[m];
            return (
              <button
                key={m}
                type="button"
                aria-pressed={input.mode === m}
                onClick={() => pick(m)}
                className="text-ink ring-staff-sep aria-pressed:bg-ink aria-pressed:ring-ink relative flex min-h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-xl bg-white px-1 text-[0.9375rem] font-semibold ring-1 aria-pressed:text-white aria-pressed:ring-2"
              >
                <Icon aria-hidden="true" className="size-6 shrink-0" />
                {input.mode === m && (
                  <Check
                    aria-hidden="true"
                    className="text-ink absolute top-1.5 right-1.5 size-5 rounded-full bg-white p-0.5"
                  />
                )}
                <span className="max-w-full [overflow-wrap:anywhere]">{t(`settle.${m}`)}</span>
              </button>
            );
          })}
        </div>
        {input.mode === "split" && (
          <div className="grid grid-cols-2 gap-3">
            {(["cash", "card"] as const).map((k) => (
              <label key={k} className="text-staff-label2 grid gap-1 text-[0.8125rem] font-semibold">
                {t(`settle.${k}`)}
                <input
                  inputMode="numeric"
                  value={input[k]}
                  onChange={(e) => setInput((x) => ({ ...x, [k]: e.target.value.replace(/\D/g, "") }))}
                  className="num text-ink ring-staff-sep min-h-12 w-full min-w-0 rounded-xl bg-white px-3 text-[1.25rem] ring-1"
                />
              </label>
            ))}
          </div>
        )}
        {input.mode === "split" && !result.ok && (
          <p role="alert" data-testid="mismatch" className="text-pomegranate m-0 font-semibold">
            <CircleAlert aria-hidden="true" className="mr-1.5 inline size-5 align-[-4px]" />
            {t("settle.mismatch", { total: formatAmd(total, locale), paid: formatAmd(result.paid, locale) })}
          </p>
        )}
        {!online && (
          <p className="text-pomegranate m-0 flex items-center gap-2 font-semibold">
            <WifiOff aria-hidden="true" className="size-5 shrink-0" />
            {t("settle.offline")}
          </p>
        )}
        {failed && online && (
          <p className="text-pomegranate m-0 flex items-center gap-2 font-semibold">
            <CircleAlert aria-hidden="true" className="size-5 shrink-0" />
            {t("settle.failed")}
          </p>
        )}
        <div className="border-staff-sep flex justify-between border-t pt-4 text-[1.375rem] font-bold">
          <span>{t("panel.total")}</span>
          <span className="num">{formatAmd(total, locale)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className={button("secondary", "min-h-14")} onClick={onClose}>
            {t("settle.back")}
          </button>
          <button
            type="button"
            className={button("primary", "min-h-14")}
            disabled={!result.ok || !online || busy}
            onClick={() => void confirm()}
          >
            {t("settle.confirm")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
