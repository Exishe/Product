import { describe, expect, it, vi } from "vitest";
import { handlePush, type PushDeps } from "./push-handler";

const sig = "a".repeat(43);
const vapid = { publicKey: "p", privateKey: "k", subject: "mailto:x@pativ.test" };
const claimData = {
  title: "Պատիվ",
  body: "Նոր պատվեր՝ սեղան 5, 6 500 ֏",
  tag: "order.placed:7",
  url: "/admin/telegram",
  subscriptions: [
    { endpoint: "https://fcm.googleapis.com/fcm/send/a", p256dh: "x", auth: "y" },
    { endpoint: "https://web.push.apple.com/b", p256dh: "x", auth: "y" },
  ],
};

function deps(over: Partial<PushDeps> = {}): PushDeps {
  return {
    vapid,
    claim: vi.fn(async () => ({ data: claimData, error: null })),
    report: vi.fn(async () => ({ data: null, error: null })),
    send: vi.fn(async (s) => (s.endpoint.includes("apple") ? 410 : 201)),
    ...over,
  };
}

describe("handlePush", () => {
  it.each([
    null,
    {},
    { id: 7, attempt: 1 },
    { id: 7, attempt: 1, sig: "short" },
    { id: "7", attempt: 1, sig },
  ])("refuses an unsigned call without touching the database (%j)", async (body) => {
    const d = deps();
    expect((await handlePush(body, d)).status).toBe(401);
    expect(d.claim).not.toHaveBeenCalled();
  });

  it("refuses a call the database says is forged", async () => {
    const d = deps({ claim: vi.fn(async () => ({ data: null, error: { message: "forbidden" } })) });
    expect(await handlePush({ id: 7, attempt: 1, sig }, d)).toEqual({
      status: 401,
      body: { error: "bad_signature" },
    });
    expect(d.send).not.toHaveBeenCalled();
  });

  it("answers 409 for a row that is no longer in flight", async () => {
    const d = deps({ claim: vi.fn(async () => ({ data: null, error: { message: "not_in_flight" } })) });
    expect((await handlePush({ id: 7, attempt: 1, sig }, d)).status).toBe(409);
  });

  it("answers 503 without VAPID keys, so the database retries", async () => {
    const d = deps({ vapid: null });
    expect((await handlePush({ id: 7, attempt: 1, sig }, d)).status).toBe(503);
    expect(d.claim).not.toHaveBeenCalled();
  });

  it("sends to every device and reports each answer", async () => {
    const d = deps();
    const out = await handlePush({ id: 7, attempt: 2, sig }, d);
    expect(out).toEqual({ status: 200, body: { delivered: 1 } });
    expect(d.send).toHaveBeenCalledWith(
      claimData.subscriptions[0],
      {
        title: claimData.title,
        body: claimData.body,
        tag: claimData.tag,
        url: claimData.url,
      },
      vapid,
    );
    expect(d.report).toHaveBeenCalledWith(7, 2, sig, [
      { endpoint: "https://fcm.googleapis.com/fcm/send/a", status: 201 },
      { endpoint: "https://web.push.apple.com/b", status: 410 },
    ]);
  });

  it("passes the tag, the tap target and renotify of a table call on to the device", async () => {
    const call = {
      ...claimData,
      body: "Սեղան 5․ կանչում են",
      tag: "table:t5:service.call",
      url: "/waiter",
      renotify: true,
    };
    const d = deps({ claim: vi.fn(async () => ({ data: call, error: null })) });
    await handlePush({ id: 8, attempt: 1, sig }, d);
    expect(d.send).toHaveBeenCalledWith(
      claimData.subscriptions[0],
      { title: call.title, body: call.body, tag: call.tag, url: "/waiter", renotify: true },
      vapid,
    );
  });
});
