"use client";

import { Gift } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useGuestI18n } from "@/features/ordering/guest-i18n-context";
import { claimReward, fetchOffer, type RewardCtx } from "./reward-client";
import { levelFor, rewardLine, shouldClaim, type RewardClaim, type RewardOffer } from "./rewards";

// Game rewards inside the game layer (ADR-075), loaded only when a guest opens
// a game on an order. It shows the goal in one quiet line, and when the guest
// reaches the level it claims the reward and shows a calm card with what they
// won. The game keeps running underneath; nothing about the art changes.
export default function RewardOverlay({
  ctx,
  game,
  score,
  active,
  hidden,
}: {
  ctx: RewardCtx;
  game: string;
  score: number;
  /** A round is on screen (playing or over): the score means something. */
  active: boolean;
  /** The "your order is ready" banner is up: stay out of its way. */
  hidden: boolean;
}) {
  const { t, locale } = useGuestI18n();
  const [offer, setOffer] = useState<RewardOffer | null>(null);
  const [claim, setClaim] = useState<RewardClaim | null>(null);
  const [seen, setSeen] = useState(false);
  const tried = useRef(0);
  const busy = useRef(false);
  const stopped = useRef(false);

  useEffect(() => {
    let live = true;
    void fetchOffer(ctx).then((o) => {
      if (!live) return;
      setOffer(o);
      if (o?.claim) setClaim(o.claim);
    });
    return () => {
      live = false;
    };
  }, [ctx]);

  const level = levelFor(game, score);
  useEffect(() => {
    if (!active || !offer || claim || busy.current || stopped.current) return;
    // One try per level step, so a failing network is not hammered.
    if (!shouldClaim(offer, game, score) || level <= tried.current) return;
    tried.current = level;
    busy.current = true;
    void claimReward(ctx, game, level).then((res) => {
      busy.current = false;
      if (res.ok) setClaim(res.claim);
      else if (!res.retry) stopped.current = true;
    });
  }, [ctx, active, offer, claim, game, score, level]);

  const eligible = !!offer?.on && (!offer.game || offer.game === game);
  const reward = (r: { kind: "percent" | "text"; percent: number | null; text: RewardOffer["text"] }) =>
    rewardLine(r, locale, (percent) => t("games.reward.percent", { percent }));

  if (hidden || !active) return null;

  if (claim && claim.status !== "dismissed" && !seen) {
    return (
      <div className="pointer-events-none absolute inset-x-3 top-3 z-10 flex justify-center" data-testid="reward-earned">
        <div
          role="status"
          className="rounded-sheet bg-tarragon shadow-float pointer-events-auto flex max-w-sm items-center gap-3 p-3 pe-4 text-white"
        >
          <Gift size={28} strokeWidth={1.75} aria-hidden className="flex-none" />
          <p className="m-0 min-w-0 flex-1 leading-snug">
            <span className="block font-semibold">{t("games.reward.earned")}</span>
            <span className="block text-body">{t("games.reward.show", { reward: reward(claim) })}</span>
          </p>
          <button
            type="button"
            onClick={() => setSeen(true)}
            className="min-h-11 flex-none rounded-full border border-white/70 px-4 text-body font-semibold hover:bg-white/10"
          >
            {t("games.reward.ok")}
          </button>
        </div>
      </div>
    );
  }

  if (!claim && eligible && offer) {
    return (
      <p
        className="bg-basalt/80 text-slip-dim rounded-pill pointer-events-none absolute top-2 left-1/2 z-10 max-w-[92%] -translate-x-1/2 px-3 py-1 text-center text-meta"
        data-testid="reward-goal"
      >
        {t("games.reward.goal", { level, goal: offer.level })}
      </p>
    );
  }
  return null;
}
