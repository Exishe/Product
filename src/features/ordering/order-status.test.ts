import { describe, expect, it } from "vitest";
import { displayStatus, isActive, STEPS, stepIndex, type OrderState } from "./order-status";

const order = (over: Partial<OrderState> = {}): OrderState => ({
  status: "accepted",
  kitchen_status: "pending",
  paid_at: null,
  possible_duplicate_of: null,
  ...over,
});

describe("displayStatus", () => {
  it("follows public.order_display_status", () => {
    expect(displayStatus(order({ status: "placed" }))).toBe("received");
    expect(displayStatus(order())).toBe("accepted");
    expect(displayStatus(order({ kitchen_status: "cooking" }))).toBe("cooking");
    expect(displayStatus(order({ kitchen_status: "ready" }))).toBe("ready");
    expect(displayStatus(order({ kitchen_status: "served" }))).toBe("served");
    expect(displayStatus(order({ kitchen_status: "served", paid_at: "2026-11-09T20:00:00Z" }))).toBe("paid");
    expect(displayStatus(order({ status: "rejected", paid_at: "2026-11-09T20:00:00Z" }))).toBe("rejected");
    expect(displayStatus(order({ status: "cancelled", kitchen_status: "cooking" }))).toBe("cancelled");
  });
});

describe("stepIndex", () => {
  it("places each status on the five-step tracker, paid after served", () => {
    expect(STEPS).toEqual(["received", "accepted", "cooking", "ready", "served"]);
    expect(stepIndex("received")).toBe(0);
    expect(stepIndex("cooking")).toBe(2);
    expect(stepIndex("served")).toBe(4);
    expect(stepIndex("paid")).toBe(5);
    expect(stepIndex("rejected")).toBe(-1);
  });
});

describe("isActive", () => {
  it("is true while the guest still waits for something", () => {
    expect(isActive(order({ status: "placed" }))).toBe(true);
    expect(isActive(order({ kitchen_status: "ready" }))).toBe(true);
    expect(isActive(order({ kitchen_status: "served" }))).toBe(true);
    expect(isActive(order({ kitchen_status: "served", paid_at: "x" }))).toBe(false);
    expect(isActive(order({ status: "rejected" }))).toBe(false);
  });
});
