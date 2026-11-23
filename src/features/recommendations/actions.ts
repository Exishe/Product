"use server";

import { z } from "zod";
import { requireMember } from "@/lib/auth/require-member";
import { untypedClient } from "./db.server";
import { ITEM_TYPES, MAX_PAIRINGS, isItemType, type ItemType } from "./model";

// Each action checks the session and makes database calls; who may do it is
// enforced in Postgres (api.set_item_type, api.set_item_pairing, ...).
export type Result = { ok: true } | { ok: false; error: "limit" | "failed" };

const id = z.uuid();
const kind = z.enum(ITEM_TYPES);

async function firstLocationId(restaurantId: string): Promise<string | null> {
  const db = await untypedClient();
  const { data } = await db.from("locations").select("id").eq("restaurant_id", restaurantId);
  return ((data as { id: string }[] | null) ?? [])[0]?.id ?? null;
}

export async function setItemType(itemId: string, type: ItemType | null): Promise<Result> {
  await requireMember(["owner", "manager"]);
  const parsed = z.object({ itemId: id, type: kind.nullable() }).safeParse({ itemId, type });
  if (!parsed.success) return { ok: false, error: "failed" };
  const db = await untypedClient();
  const { error } = await db
    .schema("api")
    .rpc("set_item_type", { p_item_id: parsed.data.itemId, p_type: parsed.data.type });
  return error ? { ok: false, error: "failed" } : { ok: true };
}

export type Proposal = { itemId: string; type: ItemType };

/** Proposals only: nothing is saved until the owner applies them. */
export async function proposeItemTypes(): Promise<{ ok: true; proposals: Proposal[] } | { ok: false }> {
  const me = await requireMember(["owner", "manager"]);
  const location = await firstLocationId(me.restaurantId);
  if (!location) return { ok: false };
  const db = await untypedClient();
  const { data, error } = await db.schema("api").rpc("suggest_item_types", { p_location_id: location });
  if (error) return { ok: false };
  const rows = (data as { item_id: string; suggested_type: string }[] | null) ?? [];
  return {
    ok: true,
    proposals: rows.flatMap((r) => (isItemType(r.suggested_type) ? [{ itemId: r.item_id, type: r.suggested_type }] : [])),
  };
}

export async function applyItemTypes(proposals: Proposal[]): Promise<{ ok: true; saved: number } | { ok: false }> {
  await requireMember(["owner", "manager"]);
  const parsed = z.array(z.object({ itemId: id, type: kind })).max(500).safeParse(proposals);
  if (!parsed.success) return { ok: false };
  const db = await untypedClient();
  let saved = 0;
  for (const p of parsed.data) {
    const { error } = await db.schema("api").rpc("set_item_type", { p_item_id: p.itemId, p_type: p.type });
    if (!error) saved += 1;
  }
  return saved === parsed.data.length ? { ok: true, saved } : { ok: false };
}

export async function addPairing(itemId: string, suggestId: string, sort: number): Promise<Result> {
  await requireMember(["owner", "manager"]);
  const parsed = z
    .object({ itemId: id, suggestId: id, sort: z.number().int().min(0).max(MAX_PAIRINGS) })
    .safeParse({ itemId, suggestId, sort });
  if (!parsed.success) return { ok: false, error: "failed" };
  const db = await untypedClient();
  const { error } = await db.schema("api").rpc("set_item_pairing", {
    p_item_id: parsed.data.itemId,
    p_suggest_item_id: parsed.data.suggestId,
    p_sort: parsed.data.sort,
  });
  if (error) return { ok: false, error: error.message?.includes("too_many_pairings") ? "limit" : "failed" };
  return { ok: true };
}

export async function removePairing(itemId: string, suggestId: string): Promise<Result> {
  await requireMember(["owner", "manager"]);
  const parsed = z.object({ itemId: id, suggestId: id }).safeParse({ itemId, suggestId });
  if (!parsed.success) return { ok: false, error: "failed" };
  const db = await untypedClient();
  const { error } = await db
    .schema("api")
    .rpc("remove_item_pairing", { p_item_id: parsed.data.itemId, p_suggest_item_id: parsed.data.suggestId });
  return error ? { ok: false, error: "failed" } : { ok: true };
}

export async function setCompat(from: ItemType, to: ItemType, allowed: boolean): Promise<Result> {
  const me = await requireMember(["owner", "manager"]);
  const parsed = z.object({ from: kind, to: kind, allowed: z.boolean() }).safeParse({ from, to, allowed });
  const location = await firstLocationId(me.restaurantId);
  if (!parsed.success || !location) return { ok: false, error: "failed" };
  const db = await untypedClient();
  const { error } = await db.schema("api").rpc("set_compat_rule", {
    p_location_id: location,
    p_from_type: parsed.data.from,
    p_to_type: parsed.data.to,
    p_allowed: parsed.data.allowed,
  });
  return error ? { ok: false, error: "failed" } : { ok: true };
}

export async function resetCompat(): Promise<Result> {
  const me = await requireMember(["owner", "manager"]);
  const location = await firstLocationId(me.restaurantId);
  if (!location) return { ok: false, error: "failed" };
  const db = await untypedClient();
  const { error } = await db.schema("api").rpc("reset_compat_rules", { p_location_id: location });
  return error ? { ok: false, error: "failed" } : { ok: true };
}
