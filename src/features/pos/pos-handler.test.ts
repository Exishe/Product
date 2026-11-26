import { describe, expect, it, vi } from "vitest";
import { sendJob } from "./adapters";
import { samplePayload } from "./fixtures";
import { handlePos, type PosDeps } from "./pos-handler";

const sig = "a".repeat(43);
const claimData = {
  id: 7,
  vendor: "test",
  settings: {},
  secret: null,
  payload: samplePayload(),
  is_test: false,
  session_order_id: null,
};
const noNet = { fetcher: vi.fn(), lookup: vi.fn() };

function deps(over: Partial<PosDeps> = {}): PosDeps {
  return {
    claim: vi.fn(async () => ({ data: claimData, error: null })),
    report: vi.fn(async () => ({ data: null, error: null })),
    send: (job) => sendJob(job, noNet),
    ...over,
  };
}

describe("handlePos", () => {
  it.each([null, {}, { id: 7, attempt: 1 }, { id: 7, attempt: 1, sig: "short" }, { id: "7", attempt: 1, sig }])(
    "refuses an unsigned call without touching the database (%j)",
    async (body) => {
      const d = deps();
      expect((await handlePos(body, d)).status).toBe(401);
      expect(d.claim).not.toHaveBeenCalled();
    },
  );

  it("refuses what the database calls forged or not in flight", async () => {
    expect(
      (await handlePos({ id: 7, attempt: 1, sig }, deps({ claim: async () => ({ data: null, error: { message: "forbidden" } }) }))).status,
    ).toBe(401);
    const d = deps({ claim: async () => ({ data: null, error: { message: "not_in_flight" } }) });
    expect((await handlePos({ id: 7, attempt: 1, sig }, d)).status).toBe(409);
    expect(d.report).not.toHaveBeenCalled();
  });

  it("sends through the Test POS and reports TEST-<id>, with no network", async () => {
    const d = deps();
    const out = await handlePos({ id: 7, attempt: 1, sig }, d);
    expect(out).toEqual({ status: 200, body: { sent: true } });
    expect(d.report).toHaveBeenCalledWith(7, 1, sig, { ok: true, externalId: "TEST-7", error: null, retry: true });
    expect(noNet.fetcher).not.toHaveBeenCalled();
  });

  it("reports a vendor failure with its retry flag", async () => {
    const d = deps({ send: async () => ({ ok: false, error: "not matched in the POS: Տոլմա", retry: false }) });
    await handlePos({ id: 7, attempt: 2, sig }, d);
    expect(d.report).toHaveBeenCalledWith(7, 2, sig, { ok: false, externalId: null, error: "not matched in the POS: Տոլմա", retry: false });
  });

  it("reports an unreadable payload as final, and an adapter crash as retryable", async () => {
    const bad = deps({ claim: async () => ({ data: { ...claimData, payload: { nope: true } }, error: null }) });
    await handlePos({ id: 7, attempt: 1, sig }, bad);
    expect(bad.report).toHaveBeenCalledWith(7, 1, sig, expect.objectContaining({ ok: false, retry: false }));
    const crash = deps({
      send: async () => {
        throw new Error("boom");
      },
    });
    await handlePos({ id: 7, attempt: 1, sig }, crash);
    expect(crash.report).toHaveBeenCalledWith(7, 1, sig, expect.objectContaining({ ok: false, error: "adapter error", retry: true }));
  });
});
