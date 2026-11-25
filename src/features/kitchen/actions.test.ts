import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database";
import { setLineStruck } from "./actions";

// A client whose api.rpc answers with the given reply.
const client = (reply: { status: number; data?: unknown; error: { code: string; message: string; details?: string | null } | null }) =>
  ({
    schema: () => ({
      rpc: async () => ({ data: null, ...reply, error: reply.error && { details: null, hint: null, ...reply.error } }),
    }),
  }) as unknown as SupabaseClient<Database>;

const strike = (reply: Parameters<typeof client>[0]) => setLineStruck(client(reply), "t", "l", true);

describe("setLineStruck", () => {
  it("passes the server's answer on: is every wanted line struck", async () => {
    expect(await strike({ status: 200, data: true, error: null })).toEqual({ kind: "ok", complete: true });
    expect(await strike({ status: 200, data: false, error: null })).toEqual({ kind: "ok", complete: false });
  });

  it("keeps the tap when the network or the server fails", async () => {
    expect(await strike({ status: 0, error: { code: "", message: "Failed to fetch" } })).toEqual({ kind: "retry" });
    expect(await strike({ status: 503, error: { code: "PGRST000", message: "down" } })).toEqual({ kind: "retry" });
  });

  it("gives the server's word back when the ticket moved on or the line is gone", async () => {
    expect(await strike({ status: 409, error: { code: "RS409", message: "stale_status", details: "ready" } })).toEqual({ kind: "gone" });
    expect(await strike({ status: 404, error: { code: "P0002", message: "ticket_not_found" } })).toEqual({ kind: "gone" });
    expect(await strike({ status: 404, error: { code: "P0002", message: "line_not_found" } })).toEqual({ kind: "gone" });
  });

  it("knows a database that has no such function yet", async () => {
    expect(await strike({ status: 404, error: { code: "PGRST202", message: "Could not find the function api.set_line_struck" } })).toEqual({
      kind: "unsupported",
    });
    expect(await strike({ status: 404, error: { code: "42883", message: "function does not exist" } })).toEqual({ kind: "unsupported" });
  });

  it("calls anything else a refusal", async () => {
    expect(await strike({ status: 403, error: { code: "42501", message: "forbidden" } })).toEqual({ kind: "failed" });
    expect(await strike({ status: 422, error: { code: "RS422", message: "invalid_argument" } })).toEqual({ kind: "failed" });
  });
});
