import { createPublicClient } from "@/lib/supabase/public";
import { apiIsUp } from "@/lib/health/db-probe";

// Deeper check than /api/health: one cheap call through the database API (a
// malformed table token that Postgres refuses at once). 503 when the API cannot
// answer, as on 24 Nov when PostgREST lost its schema cache (ADR-085).
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  let up = false;
  try {
    const res = await createPublicClient()
      .schema("api")
      .rpc("resolve_table_token", { p_token: "A".repeat(46) });
    up = apiIsUp({ status: res.status, error: res.error });
  } catch {
    up = false;
  }
  return Response.json(
    { status: up ? "ok" : "down", ms: Date.now() - started },
    { status: up ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
