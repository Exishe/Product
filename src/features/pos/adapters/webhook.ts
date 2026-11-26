import { createHmac } from "node:crypto";
import { webhookBody, type PosPayload } from "../payload";
import { assertPublicUrl, BlockedUrlError, type LookupAll } from "../ssrf";
import { PosNetworkError, requestJson, retryableStatus, short } from "./http";
import type { Fetcher, HttpReply, SendJob, SendResult } from "./types";

// Generic webhook (Mersoft, Norksys, 1C-based systems, anything else): the
// neutral JSON, signed with the connection's secret.
//   X-Pativ-Event: order.accepted
//   X-Pativ-Event-Id: <idempotency key>  (the receiver drops repeats)
//   X-Pativ-Signature: sha256=<hex HMAC-SHA256 of the raw body>
// Any 2xx is sent; {"external_id": "..."} in the answer is kept.

export function signBody(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body, "utf8").digest("hex")}`;
}

export function buildWebhookRequest(payload: PosPayload, secret: string): { headers: Record<string, string>; body: string } {
  const body = JSON.stringify(webhookBody(payload));
  return {
    body,
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Pativ-POS-Webhook/1",
      "X-Pativ-Event": payload.event,
      "X-Pativ-Event-Id": payload.idempotency_key,
      "X-Pativ-Signature": signBody(body, secret),
    },
  };
}

export function parseWebhookReply(reply: HttpReply): SendResult {
  if (reply.status >= 200 && reply.status < 300) {
    const id =
      reply.json && typeof reply.json === "object" && "external_id" in reply.json
        ? (reply.json as { external_id: unknown }).external_id
        : null;
    return {
      ok: true,
      externalId: typeof id === "string" || typeof id === "number" ? String(id).slice(0, 120) : null,
    };
  }
  return { ok: false, error: short(`http ${reply.status}: ${reply.text}`), retry: retryableStatus(reply.status) };
}

export async function sendWebhook(job: SendJob, fetcher: Fetcher, lookup: LookupAll): Promise<SendResult> {
  const target = job.settings.url;
  if (!target) return { ok: false, error: "no webhook URL", retry: false };
  if (!job.secret) return { ok: false, error: "no signing secret", retry: false };
  try {
    await assertPublicUrl(target, lookup);
  } catch (e) {
    if (e instanceof BlockedUrlError) return { ok: false, error: e.message, retry: false };
    throw e;
  }
  const req = buildWebhookRequest(job.payload, job.secret);
  try {
    return parseWebhookReply(await requestJson(fetcher, target, { method: "POST", ...req }));
  } catch (e) {
    if (e instanceof PosNetworkError) return { ok: false, error: e.message, retry: true };
    throw e;
  }
}
