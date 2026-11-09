import { describe, expect, it } from "vitest";
import { classifyRpcResult } from "./send-result";

const err = (code: string, message: string, details: string | null = null) => ({ code, message, details, hint: null });

describe("classifyRpcResult", () => {
  it("is done when the database accepted the move, including the same move twice", () => {
    expect(classifyRpcResult({ status: 200, error: null })).toEqual({ kind: "ok" });
    expect(classifyRpcResult({ status: 204, error: null })).toEqual({ kind: "ok" });
  });

  it("reports a conflict with the status the ticket really has", () => {
    expect(classifyRpcResult({ status: 400, error: err("RS409", "stale_status", "served") })).toEqual({
      kind: "stale",
      current: "served",
    });
    expect(classifyRpcResult({ status: 400, error: err("RS409", "stale_status", "nonsense") })).toEqual({
      kind: "stale",
      current: null,
    });
  });

  it("treats a ticket that no longer exists as a conflict too", () => {
    expect(classifyRpcResult({ status: 404, error: err("P0002", "ticket_not_found") })).toEqual({ kind: "stale", current: null });
  });

  it("stops when the device has been disconnected", () => {
    expect(classifyRpcResult({ status: 403, error: err("42501", "forbidden") })).toEqual({ kind: "forbidden" });
  });

  it("retries when the network or the server failed", () => {
    expect(classifyRpcResult({ status: 0, error: err("", "TypeError: Failed to fetch") })).toMatchObject({ kind: "retry" });
    expect(classifyRpcResult({ status: 503, error: err("", "Service Unavailable") })).toMatchObject({ kind: "retry" });
    expect(classifyRpcResult({ status: 401, error: err("PGRST301", "JWT expired") })).toMatchObject({ kind: "retry" });
    expect(classifyRpcResult({ status: 429, error: err("", "Too Many Requests") })).toMatchObject({ kind: "retry" });
  });

  it("gives up on a move the database will never accept", () => {
    expect(classifyRpcResult({ status: 400, error: err("RS422", "transition_not_allowed") })).toEqual({
      kind: "failed",
      reason: "transition_not_allowed",
    });
  });
});
