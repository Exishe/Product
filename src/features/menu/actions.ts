"use server";

import { revalidatePath } from "next/cache";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";
import { categoryInput, dishInput, optionGroupInput, type CategoryInput, type DishInput, type OptionGroupInput } from "./schema";

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
  const { error } = await supabase.schema("api").rpc("reorder", { p_restaurant_id: me.restaurantId, p_kind: kind, p_ids: ids });
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
      options: g.options.map((o) => ({ id: o.id ?? null, names: o.names, price_delta: o.priceDelta, is_default: o.isDefault })),
    } as Json,
  });
  if (error || !data) return { ok: false, error: "failed" };
  revalidatePath("/admin/menu");
  revalidatePath("/admin/menu/options");
  return { ok: true, id: data };
}
