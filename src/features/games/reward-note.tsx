"use client";

import { Gift } from "lucide-react";
import { useEffect, useState } from "react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { fetchOffer, REWARD_EVENT, type RewardCtx } from "./reward-client";
import { rewardLine, type RewardOffer } from "./rewards";

// The reward on the order status page (ADR-075): what the café offers, and
// once earned, what the guest won, kept while the order is open. Loaded lazily
// under the games; absent when rewards are off.
export default function RewardNote({ ctx }: { ctx: RewardCtx }) {
  const { t, locale } = useGuestI18n();
  const [offer, setOffer] = useState<RewardOffer | null>(null);

  useEffect(() => {
    let live = true;
    const look = () =>
      void fetchOffer(ctx).then((o) => {
        if (live) setOffer(o);
      });
    look();
    window.addEventListener(REWARD_EVENT, look);
    return () => {
      live = false;
      window.removeEventListener(REWARD_EVENT, look);
    };
  }, [ctx]);

  if (!offer) return null;
  const word = (percent: number) => t("games.reward.percent", { percent });
  const claim = offer.claim && offer.claim.status !== "dismissed" ? offer.claim : null;
  if (claim) {
    return (
      <p
        className="rounded-sheet bg-tarragon mt-4 flex items-center gap-3 p-3 text-white"
        role="status"
        data-testid="reward-note"
      >
        <Gift size={26} strokeWidth={1.75} aria-hidden className="flex-none" />
        <span className="min-w-0 leading-snug">
          <span className="block font-semibold">{t("games.reward.earned")}</span>
          <span className="block text-sm">
            {claim.status === "applied"
              ? t("games.reward.applied", { reward: rewardLine(claim, locale, word) })
              : t("games.reward.show", { reward: rewardLine(claim, locale, word) })}
          </span>
        </span>
      </p>
    );
  }
  if (!offer.on) return null;
  return (
    <p className="text-slip-dim mt-4 flex items-center gap-2 text-sm" data-testid="reward-offer">
      <Gift size={18} strokeWidth={1.75} aria-hidden className="text-apricot-on-dark flex-none" />
      <span>
        {t(offer.game ? "games.reward.offerGame" : "games.reward.offer", {
          level: offer.level,
          reward: rewardLine(offer, locale, word),
          game: offer.game ? t(`games.${offer.game}.name`) : "",
        })}
      </span>
    </p>
  );
}
