"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { iikoAccount, iikoCatalog, type IikoAccount } from "./adapters/iiko";
import { posterCatalog, posterSpots, type PosterSpot } from "./adapters/poster";
import { POS_VENDORS, type PosCatalog, type PosSettings, type PosVendor } from "./adapters/types";
import { loadPosAdmin } from "./load.server";
import { autoMatch, matchTables, mergeMatches, type DishMatch } from "./match";
import { realNet } from "./net";
import { assertPublicUrl, BlockedUrlError, isPublicHttpsUrl } from "./ssrf";

// The owner's "POS connection" page (ADR-093). Everything runs on the server
// as the signed-in owner or manager; the key is read here (api.pos_connection_secret)
// only to call the vendor, and never goes back to the browser.

const PAGE = "/admin/pos";

export type PosError =
  | "failed"
  | "forbidden"
  | "invalid_url"
  | "invalid_secret"
  | "no_secret"
  | "not_configured"
  | "rate_limited"
  | "vendor"
  | "no_url";

export type ActionResult<T = null> = { ok: true; data: T } | { ok: false; error: PosError; detail?: string };

function fail(message: string | undefined): ActionResult<never> {
  switch (message) {
    case "forbidden":
      return { ok: false, error: "forbidden" };
    case "invalid_url":
      return { ok: false, error: "invalid_url" };
    case "invalid_secret":
      return { ok: false, error: "invalid_secret" };
    case "pos_no_secret":
      return { ok: false, error: "no_secret" };
    case "pos_no_url":
      return { ok: false, error: "no_url" };
    case "pos_not_configured":
      return { ok: false, error: "not_configured" };
    case "rate_limited":
      return { ok: false, error: "rate_limited" };
    default:
      return { ok: false, error: "failed" };
  }
}

async function context() {
  const me = await requireMember(["owner", "manager"]);
  const supabase = await createClient();
  return { me, supabase, api: supabase.schema("api") };
}

const settingsSchema = z.object({
  url: z.string().max(500).optional(),
  organization_id: z.string().max(100).optional(),
  organization_name: z.string().max(200).optional(),
  terminal_group_id: z.string().max(100).optional(),
  terminal_group_name: z.string().max(200).optional(),
  base_url: z.string().max(500).optional(),
  spot_id: z.string().regex(/^\d*$/).max(20).optional(),
  spot_name: z.string().max(200).optional(),
  phone: z.string().max(30).optional(),
});

/** Saves the vendor and its non-secret settings. */
export async function savePosConnection(vendor: PosVendor, settings: PosSettings): Promise<ActionResult<string>> {
  const { me, supabase, api } = await context();
  if (!POS_VENDORS.includes(vendor)) return { ok: false, error: "failed" };
  const parsed = settingsSchema.safeParse(settings);
  if (!parsed.success) return { ok: false, error: "failed" };
  const clean = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v && v.trim() !== ""));
  for (const key of ["url", "base_url"] as const) {
    const value = clean[key];
    if (value === undefined) continue;
    if (!isPublicHttpsUrl(value)) return { ok: false, error: "invalid_url" };
    try {
      await assertPublicUrl(value, realNet.lookup);
    } catch (e) {
      if (e instanceof BlockedUrlError) return { ok: false, error: "invalid_url", detail: e.message };
      throw e;
    }
  }
  const data = await loadPosAdmin(supabase, me.restaurantId);
  if (!data) return { ok: false, error: "failed" };
  const { data: id, error } = await api.rpc("pos_save_connection", {
    p_location_id: data.locationId,
    p_vendor: vendor,
    p_settings: clean as Json,
  });
  if (error || !id) return fail(error?.message);
  revalidatePath(PAGE);
  return { ok: true, data: id };
}

/** Write-only: the key goes to Vault; the page only ever learns "saved". */
export async function savePosSecret(connectionId: string, secret: string): Promise<ActionResult> {
  const { api } = await context();
  if (!z.uuid().safeParse(connectionId).success) return { ok: false, error: "failed" };
  const { error } = await api.rpc("pos_set_secret", { p_connection_id: connectionId, p_secret: secret.trim() });
  if (error) return fail(error.message);
  revalidatePath(PAGE);
  return { ok: true, data: null };
}

export async function setPosActive(connectionId: string, active: boolean): Promise<ActionResult> {
  const { api } = await context();
  const { error } = await api.rpc("pos_set_active", { p_connection_id: connectionId, p_active: active });
  if (error) return fail(error.message);
  revalidatePath(PAGE);
  return { ok: true, data: null };
}

export async function sendPosTest(connectionId: string): Promise<ActionResult> {
  const { api } = await context();
  const { error } = await api.rpc("pos_send_test", { p_connection_id: connectionId });
  if (error) return fail(error.message);
  revalidatePath(PAGE);
  return { ok: true, data: null };
}

export async function retryPosSend(outboxId: number): Promise<ActionResult> {
  const { api } = await context();
  const { error } = await api.rpc("pos_retry", { p_outbox_id: outboxId });
  if (error) return fail(error.message);
  revalidatePath(PAGE);
  return { ok: true, data: null };
}

async function connectionWithSecret(connectionId: string) {
  const { me, supabase, api } = await context();
  const data = await loadPosAdmin(supabase, me.restaurantId);
  const connection = data?.connection;
  if (!data || !connection || connection.id !== connectionId) return null;
  const { data: secret } = await api.rpc("pos_connection_secret", { p_connection_id: connectionId });
  return { data, connection, secret: typeof secret === "string" && secret ? secret : null };
}

export type CheckResult =
  | { vendor: "iiko" | "syrve"; account: IikoAccount }
  | { vendor: "poster"; spots: PosterSpot[] }
  | { vendor: "webhook" | "test" };

/** "Check connection": what this key can see at the vendor, to pick from. */
export async function checkPosConnection(connectionId: string): Promise<ActionResult<CheckResult>> {
  const ctx = await connectionWithSecret(connectionId);
  if (!ctx) return { ok: false, error: "failed" };
  const { connection, secret } = ctx;
  if (connection.vendor === "test") return { ok: true, data: { vendor: "test" } };
  if (!secret) return { ok: false, error: "no_secret" };
  try {
    if (connection.vendor === "webhook") {
      if (!connection.settings.url) return { ok: false, error: "no_url" };
      await assertPublicUrl(connection.settings.url, realNet.lookup);
      return { ok: true, data: { vendor: "webhook" } };
    }
    if (connection.vendor === "poster") return { ok: true, data: { vendor: "poster", spots: await posterSpots(secret, realNet.fetcher) } };
    const account = await iikoAccount(connection.vendor, secret, connection.settings.base_url, realNet.fetcher, realNet.lookup);
    return { ok: true, data: { vendor: connection.vendor, account } };
  } catch (e) {
    if (e instanceof BlockedUrlError) return { ok: false, error: "invalid_url", detail: e.message };
    return { ok: false, error: "vendor", detail: e instanceof Error ? e.message.slice(0, 300) : undefined };
  }
}

export type MenuResult = {
  catalog: PosCatalog;
  matches: DishMatch[];
  tableMatches: { tableId: string; externalId: string; externalName: string }[];
};

/** "Load POS menu": the vendor's products (and iiko tables) with automatic matches. */
export async function loadPosMenu(connectionId: string): Promise<ActionResult<MenuResult>> {
  const ctx = await connectionWithSecret(connectionId);
  if (!ctx) return { ok: false, error: "failed" };
  const { data, connection, secret } = ctx;
  if (connection.vendor === "test" || connection.vendor === "webhook") return { ok: false, error: "failed" };
  if (!secret) return { ok: false, error: "no_secret" };
  let catalog: PosCatalog;
  try {
    catalog =
      connection.vendor === "poster"
        ? await posterCatalog(secret, realNet.fetcher)
        : await iikoCatalog(connection.vendor, secret, connection.settings, realNet.fetcher, realNet.lookup);
  } catch (e) {
    if (e instanceof BlockedUrlError) return { ok: false, error: "invalid_url", detail: e.message };
    return { ok: false, error: "vendor", detail: e instanceof Error ? e.message.slice(0, 300) : undefined };
  }
  const matches = mergeMatches(data.matches, autoMatch(data.dishes, catalog.products), catalog.products);
  const knownTables = new Set(catalog.tables.map((t) => t.id));
  const savedTables = data.tableMatches.filter((m) => knownTables.has(m.externalId));
  const autoTables = matchTables(
    data.tables.filter((t) => !savedTables.some((s) => s.tableId === t.id)),
    catalog.tables,
  );
  return { ok: true, data: { catalog, matches, tableMatches: [...savedTables, ...autoTables] } };
}

const matchSchema = z.array(
  z.object({
    itemId: z.uuid(),
    externalId: z.string().min(1).max(64),
    externalName: z.string().max(200),
    auto: z.boolean(),
    modifiers: z.record(z.uuid(), z.object({ external_id: z.string().min(1).max(64), group_id: z.string().max(64).nullable() })),
  }),
);
const tableMatchSchema = z.array(
  z.object({ tableId: z.uuid(), externalId: z.string().min(1).max(64), externalName: z.string().max(120) }),
);

/** Saves the reviewed table of matches (dishes, their options, and tables). */
export async function savePosMatches(
  connectionId: string,
  matches: DishMatch[],
  tableMatches: { tableId: string; externalId: string; externalName: string }[],
): Promise<ActionResult> {
  const { api } = await context();
  const m = matchSchema.safeParse(matches);
  const t = tableMatchSchema.safeParse(tableMatches);
  if (!m.success || !t.success) return { ok: false, error: "failed" };
  const links = m.data.map((x) => ({
    item_id: x.itemId,
    external_id: x.externalId,
    external_name: x.externalName,
    auto_matched: x.auto,
    modifiers: x.modifiers,
  }));
  const tlinks = t.data.map((x) => ({ table_id: x.tableId, external_table_id: x.externalId, external_name: x.externalName }));
  const [a, b] = await Promise.all([
    api.rpc("pos_save_item_links", { p_connection_id: connectionId, p_links: links as Json }),
    api.rpc("pos_save_table_links", { p_connection_id: connectionId, p_links: tlinks as Json }),
  ]);
  if (a.error || b.error) return fail(a.error?.message ?? b.error?.message);
  revalidatePath(PAGE);
  return { ok: true, data: null };
}
