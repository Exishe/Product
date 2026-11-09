import { describe, expect, it } from "vitest";
import { classifyOrderError } from "./order-errors";

const pg = (message: string, details = "", status = 400) => ({ status, error: { message, details, code: "RS422" } });

describe("classifyOrderError", () => {
  it("treats a lost connection, a timeout or a gateway error as 'maybe sent': keep the key and retry", () => {
    expect(classifyOrderError({ status: 0, error: { message: "TypeError: Failed to fetch", details: "", code: "" } })).toEqual({ kind: "offline" });
    expect(classifyOrderError({ status: 0, error: { message: "AbortError: signal timed out", details: "", code: "" } })).toEqual({ kind: "offline" });
    expect(classifyOrderError({ status: 502, error: { message: "Bad gateway", details: "", code: "" } })).toEqual({ kind: "offline" });
    expect(classifyOrderError({ status: 504, error: null })).toEqual({ kind: "offline" });
  });

  it("names the dish that sold out meanwhile", () => {
    expect(classifyOrderError(pg("item_sold_out", "8f26cbbf-a727-4e03-bc64-6793da95e70c"))).toEqual({
      kind: "sold_out",
      itemId: "8f26cbbf-a727-4e03-bc64-6793da95e70c",
    });
  });

  it("asks for a new guest session when the old one expired", () => {
    expect(classifyOrderError({ status: 403, error: { message: "guest_session_invalid", details: "", code: "RS403" } })).toEqual({
      kind: "rejoin",
    });
  });

  it("recognizes the database's refusals", () => {
    expect(classifyOrderError(pg("rate_limited", "", 429))).toEqual({ kind: "rate_limited" });
    for (const m of ["item_unavailable", "invalid_modifiers", "unknown_modifier", "invalid_lines", "invalid_quantity", "menu_not_published"]) {
      expect(classifyOrderError(pg(m))).toEqual({ kind: "menu_changed" });
    }
    for (const m of ["ordering_disabled", "table_unavailable", "invalid_table_token", "plan_required"]) {
      expect(classifyOrderError(pg(m, "", 403))).toEqual({ kind: "ordering_off" });
    }
    expect(classifyOrderError(pg("idempotency_key_reused", "", 409))).toEqual({ kind: "already_sent" });
  });

  it("refreshes the session for an expired sign-in", () => {
    expect(classifyOrderError({ status: 401, error: { message: "JWT expired", details: "", code: "PGRST301" } })).toEqual({ kind: "auth" });
  });

  it("calls anything else a definite failure", () => {
    expect(classifyOrderError(pg("something_new"))).toEqual({ kind: "failed" });
  });
});
