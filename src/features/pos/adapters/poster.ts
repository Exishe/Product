import { lineComment, unmappedNames, type PosPayload } from "../payload";
import { PosNetworkError, requestJson, retryableStatus, short } from "./http";
import type { Fetcher, HttpReply, PosCatalog, PosProduct, SendJob, SendResult } from "./types";

// Poster (joinposter.com), Web API v3 with the account's personal token in
// ?token=. Each accepted round becomes one online order
// (incomingOrders.createIncomingOrder) at the chosen spot; the cashier accepts
// it in Poster, which then prints as usual. Confirmed in dev.joinposter.com
// (v3) on 26 Nov 2026, see ADR-093.
export const POSTER_API = "https://joinposter.com/api";
/**
 * Poster asks for a phone when no client_id is given (createIncomingOrder);
 * whether an order without one is accepted is not confirmed. The owner can
 * set one in the connection's settings (e.g. the café's own number); we then
 * send skip_phone_validation as well.
 */
export const POSTER_PHONE_REQUIRED = false;

type PosterProduct = { product_id: number; count: number; modificator_id?: number; modification?: string };

const int = (s: string | null | undefined): number | null => (s && /^\d+$/.test(s) ? Number(s) : null);

/**
 * A Pativ option is a Poster product modificator (a variant of the product,
 * one per line: external_group_id null) or a dish modification of a set
 * (external_group_id = dish_modification_group_id), sent as
 * modification: '[{"m": <dish_modification_id>, "a": 1}]'.
 */
export function buildPosterProducts(payload: PosPayload): PosterProduct[] {
  return payload.order.items.map((it) => {
    const variant = it.modifiers.find((m) => m.external_id && !m.external_group_id);
    const dishMods = it.modifiers
      .filter((m) => m.external_id && m.external_group_id)
      .map((m) => ({ m: Number(m.external_id), a: 1 }));
    return {
      product_id: Number(it.external_id),
      count: it.quantity,
      ...(variant ? { modificator_id: Number(variant.external_id) } : {}),
      ...(dishMods.length ? { modification: JSON.stringify(dishMods) } : {}),
    };
  });
}

/** "Table 4 · Pativ #12 [ab12cd34]" and the notes; the bracket marks the round for people and searches. */
export function posterComment(payload: PosPayload): string {
  const marker = payload.idempotency_key.replace(/[^a-z0-9]/gi, "").slice(-8);
  const head = `${payload.table ? `Table ${payload.table.label} · ` : ""}Pativ #${payload.order.number}${payload.test ? " (test)" : ""} [${marker}]`;
  const notes = [
    payload.order.note,
    ...payload.order.items.map((it) => {
      const c = lineComment(it);
      return c ? `${it.name}: ${c}` : null;
    }),
  ].filter(Boolean);
  return [head, ...notes].join("\n").slice(0, 1000);
}

export function buildIncomingOrder(payload: PosPayload, spotId: string, phone?: string) {
  return {
    spot_id: Number(spotId),
    service_mode: 1, // dine-in
    ...(phone ? { phone, skip_phone_validation: true } : {}),
    comment: posterComment(payload),
    products: buildPosterProducts(payload),
  };
}

function posterError(reply: HttpReply): { code: number | null; message: string } | null {
  const err = (reply.json as { error?: unknown } | null)?.error;
  if (err && typeof err === "object") {
    const e = err as { code?: unknown; message?: unknown };
    return { code: typeof e.code === "number" ? e.code : Number(e.code) || null, message: String(e.message ?? "error") };
  }
  if (typeof err === "number" || typeof err === "string") return { code: Number(err) || null, message: String(err) };
  return null;
}

/** {"response": {"incoming_order_id": 2, ...}} or {"error": {"code": 11, "message": "..."}} (HTTP 200 for both). */
export function parseIncomingOrderReply(reply: HttpReply): SendResult {
  const err = posterError(reply);
  if (err) {
    // 700: rate limit; 1: could not save. Everything else (bad token, unknown product) needs a person.
    const retry = err.code === 700 || err.code === 1;
    return { ok: false, error: short(`poster ${err.code ?? ""}: ${err.message}`), retry };
  }
  if (reply.status !== 200) return { ok: false, error: short(`http ${reply.status}: ${reply.text}`), retry: retryableStatus(reply.status) };
  const id = (reply.json as { response?: { incoming_order_id?: unknown } } | null)?.response?.incoming_order_id;
  if (typeof id !== "number" && typeof id !== "string") return { ok: false, error: "poster: no incoming_order_id in the answer", retry: true };
  return { ok: true, externalId: String(id) };
}

const url = (method: string, token: string) => `${POSTER_API}/${method}?token=${encodeURIComponent(token)}`;

export async function sendPoster(job: SendJob, fetcher: Fetcher): Promise<SendResult> {
  if (!job.secret) return { ok: false, error: "no Poster token", retry: false };
  const spot = job.settings.spot_id;
  if (!int(spot)) return { ok: false, error: "spot not chosen", retry: false };
  const missing = unmappedNames(job.payload);
  if (missing.length) return { ok: false, error: `not matched in the POS: ${missing.join(", ")}`.slice(0, 600), retry: false };
  if (job.payload.order.items.some((it) => !int(it.external_id) || it.modifiers.some((m) => !int(m.external_id))))
    return { ok: false, error: "a Poster id is not a number; load the POS menu again", retry: false };
  if (job.payload.order.items.length === 0) return { ok: false, error: "no dishes to send", retry: false };
  if (POSTER_PHONE_REQUIRED && !job.settings.phone) return { ok: false, error: "Poster needs a phone", retry: false };
  try {
    const reply = await requestJson(fetcher, url("incomingOrders.createIncomingOrder", job.secret), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildIncomingOrder(job.payload, spot as string, job.settings.phone)),
    });
    return parseIncomingOrderReply(reply);
  } catch (e) {
    if (e instanceof PosNetworkError) return { ok: false, error: e.message, retry: true };
    throw e;
  }
}

// --- Connect and match ----------------------------------------------------------

export type PosterSpot = { id: string; name: string };

export function parseSpots(json: unknown): PosterSpot[] {
  const list = (json as { response?: unknown } | null)?.response;
  return Array.isArray(list)
    ? list.flatMap((s) =>
        s && (typeof s.spot_id === "string" || typeof s.spot_id === "number")
          ? [{ id: String(s.spot_id), name: typeof s.spot_name === "string" ? s.spot_name : String(s.spot_id) }]
          : [],
      )
    : [];
}

type RawProduct = {
  product_id?: unknown;
  product_name?: unknown;
  hidden?: unknown;
  modifications?: { modificator_id?: unknown; modificator_name?: unknown }[];
  group_modifications?: {
    dish_modification_group_id?: unknown;
    is_deleted?: unknown;
    modifications?: { dish_modification_id?: unknown; name?: unknown }[];
  }[];
};

/** menu.getProducts: products with their modificators and dish modification sets. */
export function parseProducts(json: unknown): PosProduct[] {
  const list = (json as { response?: unknown } | null)?.response;
  if (!Array.isArray(list)) return [];
  return (list as RawProduct[]).flatMap((p) => {
    if (p.product_id === undefined || p.product_id === null) return [];
    const variants = (p.modifications ?? []).flatMap((m) =>
      m.modificator_id != null ? [{ id: String(m.modificator_id), groupId: null, name: String(m.modificator_name ?? m.modificator_id).trim() }] : [],
    );
    const sets = (p.group_modifications ?? [])
      .filter((g) => String(g.is_deleted ?? "0") !== "1")
      .flatMap((g) =>
        (g.modifications ?? []).flatMap((m) =>
          m.dish_modification_id != null && g.dish_modification_group_id != null
            ? [{ id: String(m.dish_modification_id), groupId: String(g.dish_modification_group_id), name: String(m.name ?? m.dish_modification_id).trim() }]
            : [],
        ),
      );
    return [{ id: String(p.product_id), name: String(p.product_name ?? p.product_id).trim(), modifiers: [...variants, ...sets] }];
  });
}

async function get(fetcher: Fetcher, method: string, token: string): Promise<unknown> {
  const reply = await requestJson(fetcher, url(method, token), { method: "GET" });
  const err = posterError(reply);
  if (err || reply.status !== 200) throw new Error(err ? `poster ${err.code ?? ""}: ${err.message}` : `http ${reply.status}`);
  return reply.json;
}

export async function posterSpots(token: string, fetcher: Fetcher): Promise<PosterSpot[]> {
  return parseSpots(await get(fetcher, "access.getSpots", token));
}

export async function posterCatalog(token: string, fetcher: Fetcher): Promise<PosCatalog> {
  return { products: parseProducts(await get(fetcher, "menu.getProducts", token)), tables: [] };
}
