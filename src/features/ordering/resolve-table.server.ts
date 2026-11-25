import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { retryTransient } from "@/lib/async/retry";
import { isWellFormedToken } from "@/lib/security/table-token";
import type { ResolvedTable, TableLookup } from "./table-entry";

// api.resolve_table_token checks the signature, key and qr_version in Postgres.
// A refused token is null. A busy or unreachable database is retried twice and
// then reported as "unavailable", so a good sticker never shows "this QR code
// no longer works" because the database was slow for a moment.
export async function lookupTable(token: string | undefined | null): Promise<TableLookup> {
  if (!isWellFormedToken(token)) return null;
  const result = await retryTransient<ResolvedTable | null>(async () => {
    const { data, error } = await createPublicClient().schema("api").rpc("resolve_table_token", { p_token: token });
    if (!error) return { ok: true, value: (data as ResolvedTable | null) ?? null };
    if (error.message === "invalid_table_token") return { ok: true, value: null };
    console.error("resolve_table_token failed", error.code, error.message);
    return { ok: false, transient: true };
  });
  return result.ok ? result.value : "unavailable";
}

// Pages that only need the table (or nothing) read a refusal and an outage alike.
export async function resolveTable(token: string | undefined | null): Promise<ResolvedTable | null> {
  const found = await lookupTable(token);
  return found === "unavailable" ? null : found;
}
