import { describe, expect, it } from "vitest";
import { ANSWERED_MS, nextExpiry, serviceLines, type ServiceRequest } from "./service-status";

const NOW = Date.parse("2026-11-25T12:00:00Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const req = (
  kind: ServiceRequest["kind"],
  status: string,
  resolved_at: string | null = null,
): ServiceRequest => ({
  id: `${kind}-${status}`,
  kind,
  status,
  resolved_at,
});
const none = new Set<"call_waiter" | "bring_bill">();

describe("serviceLines", () => {
  it("shows an open call as told", () => {
    expect(serviceLines([req("call_waiter", "open")], NOW, none)).toEqual(["callOpen"]);
  });

  it("shows a call the waiter answered as on the way", () => {
    expect(serviceLines([req("call_waiter", "resolved", ago(5_000))], NOW, none)).toEqual(["callAnswered"]);
    expect(serviceLines([req("call_waiter", "acknowledged")], NOW, none)).toEqual(["callAnswered"]);
  });

  it("drops the answer after the window", () => {
    expect(serviceLines([req("call_waiter", "resolved", ago(ANSWERED_MS + 1))], NOW, none)).toEqual([]);
    expect(serviceLines([req("call_waiter", "resolved", null)], NOW, none)).toEqual([]);
  });

  it("keeps the bill and the call both visible", () => {
    const rows = [req("bring_bill", "open"), req("call_waiter", "open")];
    expect(serviceLines(rows, NOW, none)).toEqual(["billOpen", "callOpen"]);
  });

  it("a new call wins over an older answer", () => {
    const rows = [req("call_waiter", "resolved", ago(1_000)), req("call_waiter", "open")];
    expect(serviceLines(rows, NOW, none)).toEqual(["callOpen"]);
  });

  it("does not announce an answered bill", () => {
    expect(serviceLines([req("bring_bill", "resolved", ago(1_000))], NOW, none)).toEqual([]);
  });

  it("covers a request just sent and not yet read", () => {
    expect(serviceLines([], NOW, new Set(["bring_bill"]))).toEqual(["billOpen"]);
  });
});

describe("nextExpiry", () => {
  it("is when the answer leaves, or null", () => {
    expect(nextExpiry([req("call_waiter", "resolved", ago(60_000))], NOW)).toBe(NOW - 60_000 + ANSWERED_MS);
    expect(nextExpiry([req("call_waiter", "open")], NOW)).toBeNull();
  });
});
