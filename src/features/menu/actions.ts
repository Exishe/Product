"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import {
  categoryInput,
  dishInput,
  optionGroupInput,
  type CategoryInput,
  type DishInput,
  type OptionGroupInput,
} from "./schema";
import { endOfBusinessDay } from "./stop-list";

export type SaveResult = { ok: true; id: string } | { ok: false; error: "invalid" | "failed" };

// Each action checks the session, validates, and makes exactly one database
// call; the rules (roles, prices, translations) are enforced in Postgres.
export async function saveDish(input: DishInput): Promise<SaveResult> {
  const me = await requireMember(["owner", "manager"]);
  const parsed = dishInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const d = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.schema("api").rpc("save_item", {
    p_restaurant_id: me.restaurantId,
    p_item: {
      id: d.id ?? null,
      category_id: d.categoryId,
      price: d.price,
      prep_area_id: d.prepAreaId,
      tags: d.tags,
      names: d.names,
      descriptions: d.descriptions,
      modifier_group_ids: d.modifierGroupIds,
      mark_reviewed: d.markReviewed,
    } as Json,
  });
  if (error || !data) return { ok: false, error: "failed" };
  revalidatePath("/admin/menu");
  return { ok: true, id: data };
}

export async function saveCategory(input: CategoryInput): Promise<SaveResult> {
  const me = await requireMember(["owner", "manager"]);
  const parsed = categoryInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.schema("api").rpc("save_category", {
    p_restaurant_id: me.restaurantId,
    p_category_id: parsed.data.id ?? (null as unknown as string),
    p_names: parsed.data.names,
    p_prep_area_id: parsed.data.prepAreaId ?? (null as unknown as string),
  });
  if (error || !data) return { ok: false, error: "failed" };
  revalidatePath("/admin/menu");
  return { ok: true, id: data };
}

export async function deleteDish(id: string): Promise<boolean> {
  await requireMember(["owner", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase.schema("api").rpc("delete_item", { p_item_id: id });
  revalidatePath("/admin/menu");
  return !error;
}

export async function reorder(kind: "categories" | "items", ids: string[]): Promise<boolean> {
  const me = await requireMember(["owner", "manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .schema("api")
    .rpc("reorder", { p_restaurant_id: me.restaurantId, p_kind: kind, p_ids: ids });
  revalidatePath("/admin/menu");
  return !error;
}

export async function saveOptionGroup(input: OptionGroupInput): Promise<SaveResult> {
  const me = await requireMember(["owner", "manager"]);
  const parsed = optionGroupInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const g = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase.schema("api").rpc("save_modifier_group", {
    p_restaurant_id: me.restaurantId,
    p_group: {
      id: g.id ?? null,
      min_select: g.required ? 1 : 0,
      max_select: 1,
      names: g.names,
      options: g.options.map((o) => ({
        id: o.id ?? null,
        names: o.names,
        price_delta: o.priceDelta,
        is_default: o.isDefault,
      })),
    } as Json,
  });
  if (error || !data) return { ok: false, error: "failed" };
  revalidatePath("/admin/menu");
  revalidatePath("/admin/menu/options");
  return { ok: true, id: data };
}

async function firstLocation(restaurantId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("locations")
    .select("id, business_day_starts, timezone")
    .eq("restaurant_id", restaurantId)
    .order("created_at")
    .limit(1)
    .single();
  return data;
}

// "Not today": until the business day rolls over (05:00 by default).
export async function setSoldOut(itemId: string, soldOut: boolean): Promise<boolean> {
  const me = await requireMember(["owner", "manager"]);
  const id = z.uuid().safeParse(itemId);
  const location = await firstLocation(me.restaurantId);
  if (!id.success || !location) return false;
  const supabase = await createClient();
  const { error } = soldOut
    ? await supabase.from("stop_list").upsert({
        restaurant_id: me.restaurantId,
        location_id: location.id,
        item_id: id.data,
        until: endOfBusinessDay(
          new Date(),
          location.business_day_starts.slice(0, 5),
          location.timezone,
        ).toISOString(),
      })
    : await supabase.from("stop_list").delete().eq("location_id", location.id).eq("item_id", id.data);
  revalidatePath("/admin/menu");
  return !error;
}

// The photo itself is uploaded from the browser to Storage (RLS checks the
// restaurant folder); this records which file the dish uses.
export async function setDishPhoto(itemId: string, path: string | null): Promise<boolean> {
  const me = await requireMember(["owner", "manager"]);
  const id = z.uuid().safeParse(itemId);
  const photoPath = new RegExp(`^${me.restaurantId}/items/${id.success ? id.data : "-"}/\\d+\\.webp$`);
  if (!id.success || (path !== null && !photoPath.test(path))) return false;
  const supabase = await createClient();
  const { error } = await supabase
    .from("items")
    .update({ image_path: path, updated_at: new Date().toISOString() })
    .eq("id", id.data)
    .eq("restaurant_id", me.restaurantId);
  revalidatePath("/admin/menu");
  return !error;
}

export type PublishResult = { ok: true } | { ok: false; error: "unreviewed" | "failed" };

export async function publishMenu(): Promise<PublishResult> {
  const me = await requireMember(["owner", "manager"]);
  const location = await firstLocation(me.restaurantId);
  if (!location) return { ok: false, error: "failed" };
  const supabase = await createClient();
  const { error } = await supabase.schema("api").rpc("publish_menu", { p_location_id: location.id });
  revalidatePath("/admin/menu");
  if (error)
    return { ok: false, error: error.message === "unreviewed_ai_translations" ? "unreviewed" : "failed" };
  return { ok: true };
}
