"use client";

import { Gift } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { rewardLine } from "@/features/games/rewards";
import type { DirectResult } from "./actions";
import type { WaiterReward } from "./rewards";
import { button } from "./ui";

// "Reward earned: 10% off (level 5)" with Applied and Dismiss (ADR-072). It
// stays on the table panel and on the bill until the waiter answers. "Applied"
// records that the waiter gave it (and who, in the audit log); the discount
// itself is given by hand, there is no bill-discount function yet.
export function RewardCards({
  rewards,
  onResolve,
}: {
  rewards: WaiterReward[];
  onResolve: (id: string, action: "applied" | "dismissed") => Promise<DirectResult>;
}) {
  const t = useTranslations("waiter.reward");
  const locale = useLocale();
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  if (rewards.length === 0) return null;

  const answer = async (id: string, action: "applied" | "dismissed") => {
    setBusy(id);
    setFailed(false);
    const res = await onResolve(id, action);
    setBusy(null);
    if (!res.ok && res.reason !== "stale") setFailed(true);
  };

  return (
    <div className="grid gap-3" data-testid="rewards">
      {rewards.map((r) => (
        <div
          key={r.id}
          data-testid="reward-card"
          className="border-tarragon bg-tarragon-tint grid gap-3 rounded-2xl border-2 px-4 py-3"
        >
          <p className="text-ink m-0 flex items-start gap-2 font-semibold">
            <Gift aria-hidden="true" className="text-tarragon mt-0.5 size-5 shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              {t("earned", {
                reward: rewardLine(r, locale, (percent) => t("percent", { percent })),
                level: r.level,
              })}
            </span>
          </p>
          <p className="text-staff-label2 m-0 text-[0.9375rem]">{t("hint")}</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void answer(r.id, "applied")}
              className={button("primary", "min-h-12 flex-1 sm:flex-none")}
              data-testid="reward-applied"
            >
              {t("applied")}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void answer(r.id, "dismissed")}
              className={button("secondary", "min-h-12 flex-1 sm:flex-none")}
              data-testid="reward-dismiss"
            >
              {t("dismiss")}
            </button>
          </div>
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
