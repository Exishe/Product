import { sendJob } from "@/features/pos/adapters";
import { realNet } from "@/features/pos/net";
import { handlePos } from "@/features/pos/pos-handler";
import { createPublicClient } from "@/lib/supabase/public";

// Sends one pos_outbox row to the café's POS (ADR-093). Called by pg_net with
// the row id signed by a key in Vault; the signature is checked in the
// database (api.pos_claim), which also hands over the vendor's key.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const raw: unknown = await request.json().catch(() => null);
  const api = createPublicClient().schema("api");
  const outcome = await handlePos(raw, {
    claim: (id, attempt, sig) => api.rpc("pos_claim", { p_id: id, p_attempt: attempt, p_sig: sig }),
    report: (id, attempt, sig, r) =>
      api.rpc("pos_report", {
        p_id: id,
        p_attempt: attempt,
        p_sig: sig,
        p_ok: r.ok,
        p_external_order_id: r.externalId ?? undefined,
        p_error: r.error ?? undefined,
        p_retry: r.retry,
      }),
    send: (job) => sendJob(job, realNet),
  });
  return Response.json(outcome.body, { status: outcome.status, headers: { "Cache-Control": "no-store" } });
}
