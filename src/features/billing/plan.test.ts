import { describe, expect, it } from "vitest";
import { planState } from "./plan";

const now = new Date("2026-11-13T10:00:00Z");
const days = (n: number) => new Date(now.getTime() + n * 86_400_000).toISOString();

describe("planState (mirrors private.location_can_order)", () => {
  it("counts the days left in the free month", () => {
    expect(
      planState(
        { plan: "service", status: "trialing", trial_ends_at: days(25.2), current_period_end: null },
        now,
      ),
    ).toEqual({
      kind: "trial",
      daysLeft: 26,
      canOrder: true,
    });
  });

  it("turns ordering off when the free month is over", () => {
    expect(
      planState(
        { plan: "service", status: "trialing", trial_ends_at: days(-1), current_period_end: null },
        now,
      ),
    ).toEqual({
      kind: "trial_ended",
      canOrder: false,
    });
  });

  it("a paid plan needs no banner", () => {
    expect(
      planState(
        { plan: "service", status: "active", trial_ends_at: null, current_period_end: days(20) },
        now,
      ),
    ).toEqual({
      kind: "active",
      canOrder: true,
    });
  });

  it("gives 7 days of grace when a payment is late", () => {
    expect(
      planState(
        { plan: "service", status: "past_due", trial_ends_at: null, current_period_end: days(-3) },
        now,
      ),
    ).toEqual({
      kind: "past_due",
      daysLeft: 4,
      canOrder: true,
    });
    expect(
      planState(
        { plan: "service", status: "past_due", trial_ends_at: null, current_period_end: days(-8) },
        now,
      ),
    ).toEqual({
      kind: "ordering_off",
      canOrder: false,
    });
  });

  it("the Menu plan is the free menu without ordering", () => {
    expect(
      planState({ plan: "menu", status: "active", trial_ends_at: null, current_period_end: null }, now),
    ).toEqual({
      kind: "menu",
      canOrder: false,
    });
  });

  it("a cancelled plan takes no orders", () => {
    expect(
      planState({ plan: "service", status: "canceled", trial_ends_at: null, current_period_end: null }, now),
    ).toEqual({
      kind: "ordering_off",
      canOrder: false,
    });
  });
});
