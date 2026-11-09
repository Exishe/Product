// What the owner should know about their plan (ADR-036). The database decides
// whether orders go through (private.location_can_order); this mirrors it so
// the admin can say so before a guest finds out.

export type Subscription = {
  plan: string;
  status: "trialing" | "active" | "past_due" | "canceled";
  trial_ends_at: string | null;
  current_period_end: string | null;
};

export type PlanState =
  | { kind: "trial"; daysLeft: number; canOrder: true }
  | { kind: "trial_ended"; canOrder: false }
  | { kind: "active"; canOrder: true }
  | { kind: "past_due"; daysLeft: number; canOrder: true }
  | { kind: "ordering_off"; canOrder: false }
  | { kind: "menu"; canOrder: false };

const DAY = 86_400_000;
export const GRACE_DAYS = 7;
export const SERVICE_PRICE_AMD = 15_000;

export function planState(sub: Subscription, now: Date): PlanState {
  if (sub.plan !== "service") return { kind: "menu", canOrder: false };
  const t = now.getTime();
  switch (sub.status) {
    case "trialing": {
      if (!sub.trial_ends_at) return { kind: "active", canOrder: true };
      const left = Date.parse(sub.trial_ends_at) - t;
      return left > 0
        ? { kind: "trial", daysLeft: Math.ceil(left / DAY), canOrder: true }
        : { kind: "trial_ended", canOrder: false };
    }
    case "active":
      return { kind: "active", canOrder: true };
    case "past_due": {
      const until = sub.current_period_end ? Date.parse(sub.current_period_end) + GRACE_DAYS * DAY : 0;
      return until > t
        ? { kind: "past_due", daysLeft: Math.ceil((until - t) / DAY), canOrder: true }
        : { kind: "ordering_off", canOrder: false };
    }
    default:
      return { kind: "ordering_off", canOrder: false };
  }
}
