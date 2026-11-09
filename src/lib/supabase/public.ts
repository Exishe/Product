import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import type { Database } from "./database";

let client: SupabaseClient<Database> | undefined;

// No session, no cookies: the anonymous role reads only what everyone may read
// (api.public_menu, api.resolve_table_token). Used by guest pages, which must
// not refresh or touch a guest's session on the server.
export function createPublicClient(): SupabaseClient<Database> {
  if (!client) {
    const env = publicEnv();
    client = createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return client;
}
