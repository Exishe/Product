import { describe, expect, it } from "vitest";
import { classifyWaiterResult, sameWaiterAction, waiterActionKey } from "./actions";

const err = (code: string, message: string, details: string | null = null) => ({ code, message, details, hint: null });

describe("waiter outbox rules", () => {
  it("a party waiting for the old bill is a conflict to show, not a retry", () => {
    expect(classifyWaiterResult({ status: 400, error: err("RS409", "table_needs_closing") })).toEqual({
      kind: "stale",
      current: "table_needs_closing",
    });
  });

  it("someone else served the plate first: stale with the real status", () => {
    expect(classifyWaiterResult({ status: 400, error: err("RS409", "stale_status", "served") })).toEqual({ kind: "stale", current: "served" });
  });

  it("network trouble is retried, a disconnected device stops", () => {
    expect(classifyWaiterResult({ status: 0, error: err("", "Failed to fetch") }).kind).toBe("retry");
    expect(classifyWaiterResult({ status: 403, error: err("42501", "forbidden") }).kind).toBe("forbidden");
  });

  it("the same tap twice is queued once; accept and reject of one order are one group", () => {
    expect(sameWaiterAction({ kind: "serve", ticketId: "k" }, { kind: "serve", ticketId: "k" })).toBe(true);
    expect(sameWaiterAction({ kind: "accept", orderId: "o" }, { kind: "reject", orderId: "o", reason: "x" })).toBe(false);
    expect(waiterActionKey({ kind: "accept", orderId: "o" })).toBe(waiterActionKey({ kind: "reject", orderId: "o", reason: "x" }));
  });
});
