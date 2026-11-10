import "server-only";
import { z } from "zod";
import type { PushMessage, PushSubscriptionKeys, VapidKeys } from "./web-push";

// /api/push: pg_net posts {id, attempt, sig} for one web_push outbox row. The
// signature is checked in the database (api.push_claim), which hands back the
// text and the devices; we send and report each push service's answer.

const body = z.object({
  id: z.number().int().positive(),
  attempt: z.number().int().min(1).max(20),
  sig: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

const claimSchema = z.object({
  title: z.string(),
  body: z.string(),
  tag: z.string(),
  url: z.string(),
  // A repeat under the same tag buzzes again (a call, a bill, a ready dish).
  renotify: z.boolean().optional(),
  subscriptions: z.array(z.object({ endpoint: z.url(), p256dh: z.string(), auth: z.string() })),
});

type RpcResult = { data: unknown; error: { message: string } | null };

export type PushDeps = {
  vapid: VapidKeys | null;
  claim: (id: number, attempt: number, sig: string) => PromiseLike<RpcResult>;
  report: (
    id: number,
    attempt: number,
    sig: string,
    results: { endpoint: string; status: number }[],
  ) => PromiseLike<RpcResult>;
  send: (sub: PushSubscriptionKeys, message: PushMessage, vapid: VapidKeys) => Promise<number>;
};

export type PushOutcome = { status: number; body: Record<string, unknown> };

export async function handlePush(raw: unknown, deps: PushDeps): Promise<PushOutcome> {
  const parsed = body.safeParse(raw);
  if (!parsed.success) return { status: 401, body: { error: "unsigned" } };
  // Without VAPID keys nothing can be sent; the database retries later.
  if (!deps.vapid) return { status: 503, body: { error: "push_not_configured" } };

  const { id, attempt, sig } = parsed.data;
  const claimed = await deps.claim(id, attempt, sig);
  if (claimed.error) {
    if (claimed.error.message === "forbidden") return { status: 401, body: { error: "bad_signature" } };
    if (claimed.error.message === "not_in_flight") return { status: 409, body: { error: "not_in_flight" } };
    return { status: 502, body: { error: "claim_failed" } };
  }
  const claim = claimSchema.safeParse(claimed.data);
  if (!claim.success) return { status: 502, body: { error: "claim_failed" } };

  const { subscriptions, ...message } = claim.data;
  const vapid = deps.vapid;
  const results = await Promise.all(
    subscriptions.map(async (s) => ({ endpoint: s.endpoint, status: await deps.send(s, message, vapid) })),
  );
  const reported = await deps.report(id, attempt, sig, results);
  if (reported.error) return { status: 502, body: { error: "report_failed" } };
  return {
    status: 200,
    body: { delivered: results.filter((r) => r.status >= 200 && r.status < 300).length },
  };
}
