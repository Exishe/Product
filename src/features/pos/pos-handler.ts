import "server-only";
import { z } from "zod";
import { POS_VENDORS, type SendJob, type SendResult } from "./adapters/types";
import { posPayloadSchema } from "./payload";

// /api/pos: pg_net posts {id, attempt, sig} for one pos_outbox row. The
// signature is checked in the database (api.pos_claim), which hands back the
// payload, the vendor, its settings and the key; we call the vendor and report
// (api.pos_report). Same shape as /api/push (ADR-035, ADR-038, ADR-093).

const body = z.object({
  id: z.number().int().positive(),
  attempt: z.number().int().min(1).max(20),
  sig: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

const claimSchema = z.object({
  id: z.number(),
  vendor: z.enum(POS_VENDORS),
  settings: z.record(z.string(), z.string()).catch({}),
  secret: z.string().nullable(),
  payload: posPayloadSchema,
  is_test: z.boolean(),
  session_order_id: z.string().nullable().optional(),
});

type RpcResult = { data: unknown; error: { message: string } | null };

export type PosDeps = {
  claim: (id: number, attempt: number, sig: string) => PromiseLike<RpcResult>;
  report: (
    id: number,
    attempt: number,
    sig: string,
    result: { ok: boolean; externalId: string | null; error: string | null; retry: boolean },
  ) => PromiseLike<RpcResult>;
  send: (job: SendJob) => Promise<SendResult>;
};

export type PosOutcome = { status: number; body: Record<string, unknown> };

export async function handlePos(raw: unknown, deps: PosDeps): Promise<PosOutcome> {
  const parsed = body.safeParse(raw);
  if (!parsed.success) return { status: 401, body: { error: "unsigned" } };
  const { id, attempt, sig } = parsed.data;

  const claimed = await deps.claim(id, attempt, sig);
  if (claimed.error) {
    if (claimed.error.message === "forbidden") return { status: 401, body: { error: "bad_signature" } };
    if (claimed.error.message === "not_in_flight") return { status: 409, body: { error: "not_in_flight" } };
    return { status: 502, body: { error: "claim_failed" } };
  }

  let result: SendResult;
  const claim = claimSchema.safeParse(claimed.data);
  if (!claim.success) {
    // A payload we cannot read will not get better by itself.
    result = { ok: false, error: "unreadable payload", retry: false };
  } else {
    const c = claim.data;
    try {
      result = await deps.send({
        id: c.id,
        vendor: c.vendor,
        settings: c.settings,
        secret: c.secret,
        payload: c.payload,
        isTest: c.is_test,
        sessionOrderId: c.session_order_id ?? null,
      });
    } catch {
      result = { ok: false, error: "adapter error", retry: true };
    }
  }

  const reported = await deps.report(id, attempt, sig, {
    ok: result.ok,
    externalId: result.ok ? result.externalId : null,
    error: result.ok ? null : result.error,
    retry: result.ok ? true : result.retry,
  });
  if (reported.error) return { status: 502, body: { error: "report_failed" } };
  return { status: 200, body: result.ok ? { sent: true } : { sent: false, retry: result.retry } };
}
