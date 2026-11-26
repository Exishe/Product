import { describe, expect, it, vi } from "vitest";
import { samplePayload } from "../fixtures";
import {
  buildIncomingOrder,
  buildPosterProducts,
  parseIncomingOrderReply,
  parseProducts,
  parseSpots,
  posterComment,
  sendPoster,
} from "./poster";
import type { SendJob } from "./types";

const job = (over: Partial<SendJob> = {}): SendJob => ({
  id: 3,
  vendor: "poster",
  settings: { spot_id: "1" },
  secret: "687409:4164553abf6a",
  payload: samplePayload(),
  isTest: false,
  sessionOrderId: null,
  ...over,
});

describe("Poster request building", () => {
  it("sends products with counts, a modificator or dish modifications", () => {
    const p = samplePayload();
    p.order.items[1]!.modifiers = [{ pativ_id: "m2", external_id: "147", external_group_id: null, name: "Մեծ", price_delta: 0 }];
    expect(buildPosterProducts(p)).toEqual([
      { product_id: 101, count: 2, modification: '[{"m":7,"a":1}]' },
      { product_id: 102, count: 1, modificator_id: 147 },
    ]);
  });

  it("marks the order with the table, the number and the round", () => {
    const c = posterComment(samplePayload());
    expect(c.split("\n")[0]).toBe("Table 4 · Pativ #12 [55556666]");
    expect(c).toContain("Արագ, խնդրում եմ");
    expect(c).toContain("Հավի խորոված: առանց սոխի");
    expect(c).toContain("Տոլմա: → Բլղուր");
  });

  it("builds the incoming order for the chosen spot", () => {
    const body = buildIncomingOrder(samplePayload(), "1");
    expect(body).toMatchObject({ spot_id: 1, service_mode: 1 });
    expect(body).not.toHaveProperty("phone");
    expect(buildIncomingOrder(samplePayload(), "1", "+37410000000")).toMatchObject({ phone: "+37410000000", skip_phone_validation: true });
  });
});

describe("Poster response parsing", () => {
  it("takes incoming_order_id", () => {
    expect(parseIncomingOrderReply({ status: 200, json: { response: { incoming_order_id: 2, spot_id: 1 } }, text: "" })).toEqual({
      ok: true,
      externalId: "2",
    });
  });

  it("reads Poster's error envelope (HTTP 200)", () => {
    expect(parseIncomingOrderReply({ status: 200, json: { error: { code: 11, message: "Bad access token" } }, text: "" })).toEqual({
      ok: false,
      error: "poster 11: Bad access token",
      retry: false,
    });
    expect(parseIncomingOrderReply({ status: 200, json: { error: { code: 700, message: "Rate" } }, text: "" })).toMatchObject({ retry: true });
    expect(parseIncomingOrderReply({ status: 502, json: null, text: "" })).toMatchObject({ ok: false, retry: true });
  });

  it("reads spots and the menu", () => {
    expect(parseSpots({ response: [{ spot_id: "1", spot_name: "Կենտրոն" }] })).toEqual([{ id: "1", name: "Կենտրոն" }]);
    expect(
      parseProducts({
        response: [
          {
            product_id: "139",
            product_name: "Borjomi",
            modifications: [{ modificator_id: "147", modificator_name: "0.5 l " }],
          },
          {
            product_id: "200",
            product_name: "Khorovats",
            group_modifications: [
              { dish_modification_group_id: 5, is_deleted: 0, modifications: [{ dish_modification_id: 6, name: "Big" }] },
              { dish_modification_group_id: 9, is_deleted: 1, modifications: [{ dish_modification_id: 10, name: "Old" }] },
            ],
          },
        ],
      }),
    ).toEqual([
      { id: "139", name: "Borjomi", modifiers: [{ id: "147", groupId: null, name: "0.5 l" }] },
      { id: "200", name: "Khorovats", modifiers: [{ id: "6", groupId: "5", name: "Big" }] },
    ]);
  });
});

describe("Poster sending", () => {
  it("posts JSON with the token in the query", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ response: { incoming_order_id: 44 } })));
    expect(await sendPoster(job(), fetcher)).toEqual({ ok: true, externalId: "44" });
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://joinposter.com/api/incomingOrders.createIncomingOrder?token=687409%3A4164553abf6a");
    expect(JSON.parse(init.body as string)).toMatchObject({ spot_id: 1, products: [{ product_id: 101 }, { product_id: 102 }] });
  });

  it("fails with the unmatched dishes, without calling Poster", async () => {
    const fetcher = vi.fn();
    const p = samplePayload();
    p.order.items[0]!.external_id = null;
    expect(await sendPoster(job({ payload: p }), fetcher)).toEqual({
      ok: false,
      error: "not matched in the POS: Հավի խորոված",
      retry: false,
    });
    expect(await sendPoster(job({ settings: {} }), fetcher)).toMatchObject({ ok: false, error: "spot not chosen" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
