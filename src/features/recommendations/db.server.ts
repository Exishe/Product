import "server-only";
import { createClient } from "@/lib/supabase/server";

// The generated database types do not know the ADR-077 tables and functions
// until scripts/gen-api-types.ts has run against a project that has the
// migration, so this feature reaches them through a small untyped view of the
// client. Everything it reads or calls is checked in Postgres.
type Reply = PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
export type UntypedClient = {
  from(table: string): {
    select(columns: string): { eq(column: string, value: string): Reply };
  };
  schema(name: string): { rpc(fn: string, args?: Record<string, unknown>): Reply };
};

export async function untypedClient(): Promise<UntypedClient> {
  return (await createClient()) as unknown as UntypedClient;
}

/** True when the database has no such function or column yet (the migration is not applied). */
export const isMissing = (error: { code?: string } | null): boolean =>
  error?.code === "PGRST202" || error?.code === "42703" || error?.code === "42P01" || error?.code === "PGRST205";
