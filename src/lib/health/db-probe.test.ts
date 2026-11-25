import { describe, expect, it } from "vitest";
import { apiIsUp } from "./db-probe";

describe("apiIsUp", () => {
  it("counts a refusal from Postgres as up", () => {
    expect(apiIsUp({ status: 403, error: { code: "RS403", message: "invalid_table_token" } })).toBe(true);
    expect(apiIsUp({ status: 400, error: { code: "P0001", message: "invalid_table_token" } })).toBe(true);
  });
  it("counts a PostgREST schema-cache failure as down", () => {
    expect(apiIsUp({ status: 503, error: { code: "PGRST002", message: "Could not query the database for the schema cache" } })).toBe(false);
    expect(apiIsUp({ status: 200, error: { code: "PGRST000" } })).toBe(false);
  });
  it("counts no answer or a 5xx as down", () => {
    expect(apiIsUp({ status: 0, error: { message: "fetch failed" } })).toBe(false);
    expect(apiIsUp({ status: 504, error: null })).toBe(false);
  });
});
