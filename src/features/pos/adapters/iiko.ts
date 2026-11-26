import { createHash } from "node:crypto";
import { lineComment, unmappedNames, type PosPayload } from "../payload";
import { assertPublicUrl, BlockedUrlError, type LookupAll } from "../ssrf";
import { PosNetworkError, requestJson, retryableStatus, short } from "./http";
import type { Fetcher, HttpReply, PosCatalog, PosProduct, PosTable, SendJob, SendResult } from "./types";

// iiko Cloud API (iikoTransport) and Syrve, its international edition: the
// same API on another host. Confirmed against the live OpenAPI documents
// (api-ru.iiko.services/api-docs/docs, api-eu.syrve.live/api-docs/docs) on
// 26 Nov 2026, see ADR-093.
export const IIKO_BASE_URL = "https://api-ru.iiko.services";
export const SYRVE_BASE_URL = "https://api-eu.syrve.live";
/** iiko keeps a token for an hour; we reuse it for 50 minutes. */
export const IIKO_TOKEN_TTL_MS = 50 * 60_000;
/**
 * Not confirmed by the documentation: whether a modifier's `amount` is per
 * unit of the dish or for the whole line. We send it per unit (1 for each
 * chosen option), as iikoFront shows modifiers.
 */
export const IIKO_MODIFIER_AMOUNT_PER_UNIT = 1;

export function iikoBaseUrl(vendor: "iiko" | "syrve", override?: string): string {
  return (override || (vendor === "syrve" ? SYRVE_BASE_URL : IIKO_BASE_URL)).replace(/\/+$/, "");
}

/**
 * A stable UUID from the idempotency key: the same order round always gets the
 * same iiko order id and positionIds, so a repeat is refused by iiko instead of
 * being added twice (positionId "MUST be unique for the whole system").
 */
export function stableUuid(...parts: (string | number)[]): string {
  const h = createHash("sha256").update(parts.join(":")).digest("hex");
  const variant = ((parseInt(h[16] as string, 16) & 0x3) | 0x8).toString(16);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export type IikoItem = {
  type: "Product";
  productId: string;
  amount: number;
  price: number;
  positionId: string;
  comment?: string;
  modifiers?: { productId: string; amount: number; productGroupId?: string; price: number; positionId: string }[];
};

export function buildIikoItems(payload: PosPayload): IikoItem[] {
  const key = payload.idempotency_key;
  return payload.order.items.map((it, i) => {
    const notes = [i === 0 ? orderTag(payload) : null, lineComment(it)].filter(Boolean).join(" · ");
    const mods = it.modifiers
      .filter((m) => m.external_id)
      .map((m, j) => ({
        productId: m.external_id as string,
        amount: IIKO_MODIFIER_AMOUNT_PER_UNIT,
        ...(m.external_group_id ? { productGroupId: m.external_group_id } : {}),
        price: m.price_delta,
        positionId: stableUuid(key, i, "m", j),
      }));
    return {
      type: "Product" as const,
      productId: it.external_id as string,
      amount: it.quantity,
      price: it.unit_price,
      positionId: stableUuid(key, i),
      ...(notes ? { comment: notes.slice(0, 255) } : {}),
      ...(mods.length ? { modifiers: mods } : {}),
    };
  });
}

/** "Pativ #12" (and the guest's note), on the first line: a table order has no order comment. */
function orderTag(payload: PosPayload): string {
  const tag = `Pativ #${payload.order.number}${payload.test ? " (test)" : ""}`;
  return payload.order.note ? `${tag}: ${payload.order.note}` : tag;
}

/** POST /api/1/order/create: a new table order. */
export function buildCreateOrder(payload: PosPayload, organizationId: string, terminalGroupId: string) {
  const tableId = payload.table?.external_id;
  return {
    organizationId,
    terminalGroupId,
    order: {
      id: stableUuid(payload.idempotency_key, "order"),
      ...(tableId ? { tableIds: [tableId] } : {}),
      items: buildIikoItems(payload),
    },
  };
}

/** POST /api/1/order/add_items: a later round of the same table session. */
export function buildAddItems(payload: PosPayload, organizationId: string, orderId: string) {
  return { organizationId, orderId, items: buildIikoItems(payload) };
}

function errorText(reply: HttpReply): string {
  const j = reply.json as { errorDescription?: unknown } | null;
  return short(`http ${reply.status}: ${typeof j?.errorDescription === "string" ? j.errorDescription : reply.text}`);
}

/** order/create answers {correlationId, orderInfo: {id, creationStatus, errorInfo}}. */
export function parseCreateReply(reply: HttpReply): SendResult {
  if (reply.status !== 200) return { ok: false, error: errorText(reply), retry: retryableStatus(reply.status) };
  const info = (reply.json as { orderInfo?: { id?: unknown; creationStatus?: unknown; errorInfo?: { message?: unknown; description?: unknown } | null } } | null)
    ?.orderInfo;
  if (!info || typeof info.id !== "string") return { ok: false, error: "iiko: no orderInfo.id in the answer", retry: true };
  if (info.creationStatus === "Error" || info.creationStatus === "Cancelled") {
    const why = info.errorInfo?.message ?? info.errorInfo?.description ?? info.creationStatus;
    return { ok: false, error: short(`iiko: ${String(why)}`), retry: false };
  }
  // "Success" or "InProgress": iiko creates table orders asynchronously; the id is final.
  return { ok: true, externalId: info.id };
}

/** order/add_items answers {correlationId}; the POS order stays the same. */
export function parseAddItemsReply(reply: HttpReply, orderId: string): SendResult {
  if (reply.status !== 200) return { ok: false, error: errorText(reply), retry: retryableStatus(reply.status) };
  return { ok: true, externalId: orderId };
}

// --- Token (memory only, per base URL and key) ---------------------------------

const tokens = new Map<string, { token: string; until: number }>();

export function clearIikoTokens() {
  tokens.clear();
}

export async function iikoToken(fetcher: Fetcher, base: string, apiLogin: string, now = Date.now()): Promise<string> {
  const cacheKey = `${base}|${createHash("sha256").update(apiLogin).digest("hex")}`;
  const hit = tokens.get(cacheKey);
  if (hit && hit.until > now) return hit.token;
  const reply = await requestJson(fetcher, `${base}/api/1/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiLogin }),
  });
  const token = (reply.json as { token?: unknown } | null)?.token;
  if (reply.status !== 200 || typeof token !== "string") throw new IikoAuthError(errorText(reply), reply.status);
  tokens.set(cacheKey, { token, until: now + IIKO_TOKEN_TTL_MS });
  return token;
}

export class IikoAuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call(fetcher: Fetcher, base: string, token: string, path: string, body: unknown): Promise<HttpReply> {
  return requestJson(fetcher, `${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

async function resolveBase(vendor: "iiko" | "syrve", override: string | undefined, lookup: LookupAll): Promise<string> {
  const base = iikoBaseUrl(vendor, override);
  // Our own defaults are known; an override typed by the owner is checked like a webhook.
  if (override) await assertPublicUrl(base, lookup);
  return base;
}

/** A cached token iiko no longer takes: drop it and try again with a fresh one. */
function expired(reply: HttpReply): SendResult | null {
  if (reply.status !== 401) return null;
  clearIikoTokens();
  return { ok: false, error: errorText(reply), retry: true };
}

export async function sendIiko(job: SendJob, fetcher: Fetcher, lookup: LookupAll): Promise<SendResult> {
  const vendor = job.vendor === "syrve" ? "syrve" : "iiko";
  const { organization_id: org, terminal_group_id: group } = job.settings;
  if (!job.secret) return { ok: false, error: "no API key", retry: false };
  if (!org || !group) return { ok: false, error: "organization or terminal group not chosen", retry: false };
  const missing = unmappedNames(job.payload);
  if (missing.length) return { ok: false, error: `not matched in the POS: ${missing.join(", ")}`.slice(0, 600), retry: false };
  if (job.payload.order.items.length === 0) return { ok: false, error: "no dishes to send", retry: false };
  try {
    const base = await resolveBase(vendor, job.settings.base_url, lookup);
    const token = await iikoToken(fetcher, base, job.secret);
    if (job.sessionOrderId) {
      const reply = await call(fetcher, base, token, "/api/1/order/add_items", buildAddItems(job.payload, org, job.sessionOrderId));
      return expired(reply) ?? parseAddItemsReply(reply, job.sessionOrderId);
    }
    const reply = await call(fetcher, base, token, "/api/1/order/create", buildCreateOrder(job.payload, org, group));
    return expired(reply) ?? parseCreateReply(reply);
  } catch (e) {
    if (e instanceof BlockedUrlError) return { ok: false, error: e.message, retry: false };
    if (e instanceof IikoAuthError) return { ok: false, error: e.message, retry: retryableStatus(e.status) };
    if (e instanceof PosNetworkError) return { ok: false, error: e.message, retry: true };
    throw e;
  }
}

// --- Connect and match (owner admin) ------------------------------------------

export type IikoOrganization = { id: string; name: string };
export type IikoTerminalGroup = { id: string; name: string; organizationId: string };

export function parseOrganizations(json: unknown): IikoOrganization[] {
  const list = (json as { organizations?: unknown } | null)?.organizations;
  return Array.isArray(list)
    ? list.flatMap((o) =>
        o && typeof o.id === "string" ? [{ id: o.id as string, name: typeof o.name === "string" ? o.name : o.id }] : [],
      )
    : [];
}

/** terminalGroups is grouped by organization: [{organizationId, items: [TerminalGroup]}]. */
export function parseTerminalGroups(json: unknown): IikoTerminalGroup[] {
  const groups = (json as { terminalGroups?: unknown } | null)?.terminalGroups;
  if (!Array.isArray(groups)) return [];
  return groups.flatMap((g) => {
    const items = Array.isArray(g?.items) ? g.items : [g];
    return items.flatMap((t: { id?: unknown; name?: unknown; organizationId?: unknown }) =>
      t && typeof t.id === "string"
        ? [{ id: t.id, name: typeof t.name === "string" ? t.name : t.id, organizationId: String(t.organizationId ?? g?.organizationId ?? "") }]
        : [],
    );
  });
}

type NomenclatureProduct = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  isDeleted?: unknown;
  modifiers?: { id?: unknown }[] | null;
  groupModifiers?: { id?: unknown; childModifiers?: { id?: unknown }[] | null }[] | null;
};

/** /api/1/nomenclature: dishes and goods, with their simple and group modifiers named. */
export function parseNomenclature(json: unknown): PosProduct[] {
  const data = json as { products?: NomenclatureProduct[]; groups?: { id?: unknown; name?: unknown }[] } | null;
  const products = Array.isArray(data?.products) ? data.products : [];
  const names = new Map<string, string>();
  for (const p of products) if (typeof p.id === "string" && typeof p.name === "string") names.set(p.id, p.name);
  for (const g of Array.isArray(data?.groups) ? data.groups : [])
    if (typeof g.id === "string" && typeof g.name === "string" && !names.has(g.id)) names.set(g.id, g.name);
  return products
    .filter((p) => typeof p.id === "string" && p.isDeleted !== true && String(p.type ?? "").toLowerCase() !== "modifier")
    .map((p) => {
      const simple = (p.modifiers ?? []).flatMap((m) =>
        typeof m.id === "string" ? [{ id: m.id, groupId: null, name: names.get(m.id) ?? m.id }] : [],
      );
      const grouped = (p.groupModifiers ?? []).flatMap((g) =>
        (g.childModifiers ?? []).flatMap((c) =>
          typeof c.id === "string" && typeof g.id === "string"
            ? [{ id: c.id, groupId: g.id, name: names.get(c.id) ?? c.id }]
            : [],
        ),
      );
      return { id: p.id as string, name: typeof p.name === "string" ? p.name : String(p.id), modifiers: [...simple, ...grouped] };
    });
}

/** /api/1/reserve/available_restaurant_sections: restaurantSections[].tables[] {id, number, name, isDeleted}. */
export function parseSections(json: unknown): PosTable[] {
  const sections = (json as { restaurantSections?: unknown } | null)?.restaurantSections;
  if (!Array.isArray(sections)) return [];
  return sections.flatMap((s) =>
    (Array.isArray(s?.tables) ? s.tables : []).flatMap(
      (t: { id?: unknown; number?: unknown; name?: unknown; isDeleted?: unknown }) =>
        typeof t?.id === "string" && t.isDeleted !== true
          ? [
              {
                id: t.id,
                name: typeof t.name === "string" && t.name ? t.name : String(t.number ?? t.id),
                number: typeof t.number === "number" ? t.number : null,
                section: typeof s.name === "string" ? s.name : null,
              },
            ]
          : [],
    ),
  );
}

export type IikoAccount = { organizations: IikoOrganization[]; terminalGroups: IikoTerminalGroup[] };

async function ok(reply: HttpReply): Promise<unknown> {
  if (reply.status !== 200) throw new IikoAuthError(errorText(reply), reply.status);
  return reply.json;
}

/** "Check connection": the organizations and terminal groups this key can see. */
export async function iikoAccount(
  vendor: "iiko" | "syrve",
  apiLogin: string,
  override: string | undefined,
  fetcher: Fetcher,
  lookup: LookupAll,
): Promise<IikoAccount> {
  const base = await resolveBase(vendor, override, lookup);
  const token = await iikoToken(fetcher, base, apiLogin);
  const organizations = parseOrganizations(
    await ok(await call(fetcher, base, token, "/api/1/organizations", { returnAdditionalInfo: false, includeDisabled: false })),
  );
  const terminalGroups = organizations.length
    ? parseTerminalGroups(
        await ok(await call(fetcher, base, token, "/api/1/terminal_groups", { organizationIds: organizations.map((o) => o.id) })),
      )
    : [];
  return { organizations, terminalGroups };
}

/** "Load POS menu": products with modifiers, and the tables of the terminal group. */
export async function iikoCatalog(
  vendor: "iiko" | "syrve",
  apiLogin: string,
  settings: { organization_id?: string; terminal_group_id?: string; base_url?: string },
  fetcher: Fetcher,
  lookup: LookupAll,
): Promise<PosCatalog> {
  if (!settings.organization_id) throw new IikoAuthError("organization not chosen", 400);
  const base = await resolveBase(vendor, settings.base_url, lookup);
  const token = await iikoToken(fetcher, base, apiLogin);
  const products = parseNomenclature(
    await ok(await call(fetcher, base, token, "/api/1/nomenclature", { organizationId: settings.organization_id })),
  );
  const tables = settings.terminal_group_id
    ? parseSections(
        await ok(
          await call(fetcher, base, token, "/api/1/reserve/available_restaurant_sections", {
            terminalGroupIds: [settings.terminal_group_id],
          }),
        ),
      )
    : [];
  return { products, tables };
}
