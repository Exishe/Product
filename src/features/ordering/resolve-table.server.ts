import "server-only";
import { createPublicClient } from "@/lib/supabase/public";
import { isWellFormedToken } from "@/lib/security/table-token";
import type { ResolvedTable } from "./table-entry";

// api.resolve_table_token checks the signature, key and qr_version in Postgres.
// null for every refusal; an outage is logged and also shows the friendly
// "ask your waiter" page, never an error page (Review focus 2).
export async function resolveTable(token: string | undefined | null): Promise<ResolvedTable | null> {
  if (!isWellFormedToken(token)) return null;
  const { data, error } = await createPublicClient().schema("api").rpc("resolve_table_token", { p_token: token });
  if (error) {
    if (error.message !== "invalid_table_token") console.error("resolve_table_token failed", error.code, error.message);
    return null;
  }
  return data as ResolvedTable;
}
