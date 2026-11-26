import { beforeEach, describe, expect, it, vi } from "vitest";
import { samplePayload } from "../fixtures";
import {
  buildAddItems,
  buildCreateOrder,
  clearIikoTokens,
  iikoBaseUrl,
  iikoToken,
  IIKO_TOKEN_TTL_MS,
  parseAddItemsReply,
  parseCreateReply,
  parseNomenclature,
  parseOrganizations,
  parseSections,
  parseTerminalGroups,
  sendIiko,
  stableUuid,
  SYRVE_BASE_URL,
} from "./iiko";
import type { SendJob } from "./types";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const publicDns = async () => [{ address: "93.184.216.34", family: 4 }];
const job = (over: Partial<SendJob> = {}): SendJob => ({
  id: 9,
  vendor: "iiko",
  settings: { organization_id: "org-1", terminal_group_id: "tg-1" },
  secret: "api-login-123",
  payload: samplePayload(),
  isTest: false,
  sessionOrderId: null,
  ...over,
});

beforeEach(() => clearIikoTokens());

describe("iiko request building", () => {
  it("makes stable UUIDs from the idempotency key", () => {
    const a = stableUuid("k", 0);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(stableUuid("k", 0)).toBe(a);
    expect(stableUuid("k", 1)).not.toBe(a);
  });

  it("builds a table order with products, modifiers, positionIds and comments", () => {
    const body = buildCreateOrder(samplePayload(), "org-1", "tg-1");
    expect(body.organizationId).toBe("org-1");
    expect(body.terminalGroupId).toBe("tg-1");
    expect(body.order.tableIds).toEqual(["iiko-table-4"]);
    expect(body.order.id).toBe(stableUuid("pativ-order-0b6c3f2e-1111-4222-8333-444455556666", "order"));
    const [first, second] = body.order.items;
    expect(first).toMatchObject({ type: "Product", productId: "101", amount: 2, price: 3300 });
    expect(first!.comment).toBe("Pativ #12: Արագ, խնդրում եմ · առանց սոխի");
    expect(first!.modifiers).toEqual([
      { productId: "7", amount: 1, productGroupId: "70", price: 500, positionId: expect.any(String) },
    ]);
    expect(second).toMatchObject({ productId: "102", amount: 1, comment: "→ Բլղուր" });
    expect(new Set(body.order.items.map((i) => i.positionId)).size).toBe(2);
  });

  it("leaves out the table when it is not matched", () => {
    const body = buildCreateOrder(samplePayload({ table: { id: "t", label: "9", external_id: null } }), "o", "g");
    expect(body.order).not.toHaveProperty("tableIds");
  });

  it("adds later rounds to the session's order", () => {
    const body = buildAddItems(samplePayload(), "org-1", "iiko-order-1");
    expect(body).toMatchObject({ organizationId: "org-1", orderId: "iiko-order-1" });
    expect(body.items).toHaveLength(2);
  });

  it("uses Syrve's host, or the owner's override", () => {
    expect(iikoBaseUrl("iiko")).toBe("https://api-ru.iiko.services");
    expect(iikoBaseUrl("syrve")).toBe(SYRVE_BASE_URL);
    expect(iikoBaseUrl("syrve", "https://api-us.syrve.live/")).toBe("https://api-us.syrve.live");
  });
});

describe("iiko response parsing", () => {
  it("takes orderInfo.id from order/create", () => {
    expect(parseCreateReply({ status: 200, json: { correlationId: "c", orderInfo: { id: "o-1", creationStatus: "InProgress" } }, text: "" })).toEqual({
      ok: true,
      externalId: "o-1",
    });
    expect(
      parseCreateReply({ status: 200, json: { orderInfo: { id: "o-1", creationStatus: "Error", errorInfo: { code: "X", message: "Product not found" } } }, text: "" }),
    ).toEqual({ ok: false, error: "iiko: Product not found", retry: false });
    expect(parseCreateReply({ status: 400, json: { errorDescription: "Bad organizationId" }, text: "" })).toEqual({
      ok: false,
      error: "http 400: Bad organizationId",
      retry: false,
    });
    expect(parseCreateReply({ status: 500, json: null, text: "oops" })).toMatchObject({ ok: false, retry: true });
  });

  it("keeps the session's order id after add_items", () => {
    expect(parseAddItemsReply({ status: 200, json: { correlationId: "c" }, text: "" }, "o-1")).toEqual({ ok: true, externalId: "o-1" });
  });

  it("reads organizations, terminal groups, the menu and the tables", () => {
    expect(parseOrganizations({ organizations: [{ id: "o", name: "Կենտրոն" }] })).toEqual([{ id: "o", name: "Կենտրոն" }]);
    expect(
      parseTerminalGroups({ terminalGroups: [{ organizationId: "o", items: [{ id: "tg", organizationId: "o", name: "Սրահ" }] }] }),
    ).toEqual([{ id: "tg", name: "Սրահ", organizationId: "o" }]);
    const menu = parseNomenclature({
      groups: [{ id: "g-size", name: "Size" }],
      products: [
        { id: "p1", name: "Chicken khorovats", type: "Dish", modifiers: [{ id: "m-sauce" }], groupModifiers: [{ id: "g-size", childModifiers: [{ id: "m-big" }] }] },
        { id: "m-big", name: "Big", type: "Modifier" },
        { id: "m-sauce", name: "Sauce", type: "Modifier" },
        { id: "p-old", name: "Old", type: "Dish", isDeleted: true },
      ],
    });
    expect(menu).toEqual([
      {
        id: "p1",
        name: "Chicken khorovats",
        modifiers: [
          { id: "m-sauce", groupId: null, name: "Sauce" },
          { id: "m-big", groupId: "g-size", name: "Big" },
        ],
      },
    ]);
    expect(
      parseSections({ restaurantSections: [{ id: "s", name: "Hall", tables: [{ id: "t5", number: 5, name: "Table 5" }, { id: "tx", number: 6, isDeleted: true }] }] }),
    ).toEqual([{ id: "t5", name: "Table 5", number: 5, section: "Hall" }]);
  });
});

describe("iiko sending", () => {
  it("gets a token once, then creates the order", async () => {
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith("/access_token") ? json({ token: "tok" }) : json({ orderInfo: { id: "o-9", creationStatus: "Success" } }),
    );
    expect(await sendIiko(job(), fetcher, publicDns)).toEqual({ ok: true, externalId: "o-9" });
    expect(await sendIiko(job(), fetcher, publicDns)).toEqual({ ok: true, externalId: "o-9" });
    const urls = fetcher.mock.calls.map((c) => c[0]);
    expect(urls.filter((u) => u.endsWith("/api/1/access_token"))).toHaveLength(1);
    expect(urls.filter((u) => u.endsWith("/api/1/order/create"))).toHaveLength(2);
    const init = (fetcher.mock.calls[1] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("adds items when the table session already has an iiko order", async () => {
    const fetcher = vi.fn(async (url: string) => (url.endsWith("/access_token") ? json({ token: "tok" }) : json({ correlationId: "c" })));
    expect(await sendIiko(job({ sessionOrderId: "o-1" }), fetcher, publicDns)).toEqual({ ok: true, externalId: "o-1" });
    expect(fetcher.mock.calls[1]![0]).toBe("https://api-ru.iiko.services/api/1/order/add_items");
  });

  it("fails without calling iiko when dishes are not matched", async () => {
    const fetcher = vi.fn();
    const p = samplePayload();
    p.order.items[1]!.external_id = null;
    expect(await sendIiko(job({ payload: p }), fetcher, publicDns)).toEqual({
      ok: false,
      error: "not matched in the POS: Տոլմա",
      retry: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not retry a refused key", async () => {
    const fetcher = vi.fn(async () => json({ errorDescription: "Login x is not authorized." }, 401));
    expect(await sendIiko(job(), fetcher, publicDns)).toEqual({ ok: false, error: "http 401: Login x is not authorized.", retry: false });
  });

  it("refuses a base URL override that points inside a network", async () => {
    const fetcher = vi.fn();
    const res = await sendIiko(job({ settings: { organization_id: "o", terminal_group_id: "g", base_url: "https://iiko.example.am" } }), fetcher, async () => [
      { address: "10.0.0.2", family: 4 },
    ]);
    expect(res).toMatchObject({ ok: false, retry: false });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("retries with a fresh token when iiko drops the cached one", async () => {
    let calls = 0;
    const fetcher = vi.fn(async (url: string) =>
      url.endsWith("/access_token") ? json({ token: `tok${++calls}` }) : json({ errorDescription: "Token expired" }, 401),
    );
    expect(await sendIiko(job(), fetcher, publicDns)).toEqual({ ok: false, error: "http 401: Token expired", retry: true });
    await sendIiko(job(), fetcher, publicDns);
    expect(calls).toBe(2);
  });

  it("caches the token for 50 minutes only", async () => {
    let n = 0;
    const fetcher = vi.fn(async () => json({ token: `t${++n}` }));
    expect(await iikoToken(fetcher, "https://x", "k", 0)).toBe("t1");
    expect(await iikoToken(fetcher, "https://x", "k", IIKO_TOKEN_TTL_MS - 1)).toBe("t1");
    expect(await iikoToken(fetcher, "https://x", "k", IIKO_TOKEN_TTL_MS + 1)).toBe("t2");
  });
});
