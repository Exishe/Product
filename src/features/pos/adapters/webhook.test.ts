import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { samplePayload } from "../fixtures";
import type { SendJob } from "./types";
import { buildWebhookRequest, parseWebhookReply, sendWebhook, signBody } from "./webhook";

const job = (over: Partial<SendJob> = {}): SendJob => ({
  id: 5,
  vendor: "webhook",
  settings: { url: "https://pos.example.am/pativ" },
  secret: "whsec_0123456789",
  payload: samplePayload(),
  isTest: false,
  sessionOrderId: null,
  ...over,
});
const publicDns = async () => [{ address: "93.184.216.34", family: 4 }];

describe("webhook adapter", () => {
  it("signs the raw body with HMAC-SHA256", () => {
    const body = '{"a":1}';
    expect(signBody(body, "k")).toBe(`sha256=${createHmac("sha256", "k").update(body).digest("hex")}`);
    expect(signBody(body, "k")).toMatch(/^sha256=[0-9a-f]{64}$/);
  });

  it("sends the event, its id and the signature of exactly the bytes sent", () => {
    const req = buildWebhookRequest(samplePayload(), "whsec_0123456789");
    expect(req.headers["X-Pativ-Event"]).toBe("order.accepted");
    expect(req.headers["X-Pativ-Event-Id"]).toBe("pativ-order-0b6c3f2e-1111-4222-8333-444455556666");
    expect(req.headers["X-Pativ-Signature"]).toBe(signBody(req.body, "whsec_0123456789"));
    const sent = JSON.parse(req.body);
    expect(sent.order.items[0]).toMatchObject({ external_id: "101", name: "Հավի խորոված", quantity: 2, unit_price: 3300 });
    expect(sent).not.toHaveProperty("table_session_id");
  });

  it("reads the answer", () => {
    expect(parseWebhookReply({ status: 200, json: { external_id: "R-77" }, text: "" })).toEqual({ ok: true, externalId: "R-77" });
    expect(parseWebhookReply({ status: 204, json: null, text: "" })).toEqual({ ok: true, externalId: null });
    expect(parseWebhookReply({ status: 503, json: null, text: "busy" })).toMatchObject({ ok: false, retry: true });
    expect(parseWebhookReply({ status: 400, json: null, text: "bad" })).toMatchObject({ ok: false, retry: false, error: "http 400: bad" });
  });

  it("posts to the URL after checking where it points", async () => {
    const fetcher = vi.fn(async () => new Response('{"external_id": 9}', { status: 201 }));
    const res = await sendWebhook(job(), fetcher, publicDns);
    expect(res).toEqual({ ok: true, externalId: "9" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://pos.example.am/pativ");
    expect(init.method).toBe("POST");
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("never calls a private address, even behind a public name", async () => {
    const fetcher = vi.fn();
    const res = await sendWebhook(job(), fetcher, async () => [{ address: "192.168.1.5", family: 4 }]);
    expect(res).toMatchObject({ ok: false, retry: false });
    expect(fetcher).not.toHaveBeenCalled();
    expect(await sendWebhook(job({ settings: { url: "http://pos.example.am/" } }), fetcher, publicDns)).toMatchObject({ ok: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("retries network trouble", async () => {
    const fetcher = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    expect(await sendWebhook(job(), fetcher, publicDns)).toEqual({ ok: false, error: "network error", retry: true });
  });
});
