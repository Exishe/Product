import { handlePush } from "@/features/notifications/push-handler";
import { sendPush, type VapidKeys } from "@/features/notifications/web-push";
import { parseServerEnv } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/public";

// Sends one web_push outbox row. Called by pg_net with the row id signed by a
// key in Vault; the signature is checked in the database (api.push_claim).
// The VAPID private key comes from Vercel's environment (ADR-035).
export const dynamic = "force-dynamic";

function vapidKeys(): VapidKeys | null {
  const env = parseServerEnv(process.env);
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return null;
  return {
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
    subject: env.VAPID_SUBJECT ?? env.APP_BASE_URL,
  };
}

export async function POST(request: Request) {
  const raw: unknown = await request.json().catch(() => null);
  const api = createPublicClient().schema("api");
  const outcome = await handlePush(raw, {
    vapid: vapidKeys(),
    claim: (id, attempt, sig) => api.rpc("push_claim", { p_id: id, p_attempt: attempt, p_sig: sig }),
    report: (id, attempt, sig, results) =>
      api.rpc("push_report", { p_id: id, p_attempt: attempt, p_sig: sig, p_results: results }),
    send: sendPush,
  });
  return Response.json(outcome.body, { status: outcome.status, headers: { "Cache-Control": "no-store" } });
}
