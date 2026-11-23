"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";

// Each action checks the session, validates the input and makes one database
// call. Who may change what, and the AMD rules, are enforced in Postgres
// (api.set_item_ingredient, api.add_catalog_ingredient, ADR-076).
export type IngredientResult = { ok: true; id?: string } | { ok: false; error: "invalid" | "failed" };

const uuid = z.string().uuid();
const quantity = z.number().positive().max(999999);
const priceDelta = z.number().int().min(-1000000).max(1000000).nullable();

const lineInput = z.object({
  itemId: uuid,
  ingredientId: uuid,
  quantity,
  isKey: z.boolean(),
  substituteId: uuid.nullable(),
  priceDelta,
});
export type IngredientLineInput = z.infer<typeof lineInput>;

// Adds an ingredient to a dish with a starting amount; the editor then changes it.
export async function addDishIngredient(
  itemId: string,
  ingredientId: string,
  amount: number,
): Promise<IngredientResult> {
  await requireMember(["owner", "manager"]);
  const parsed = z
    .object({ itemId: uuid, ingredientId: uuid, amount: quantity })
    .safeParse({ itemId, ingredientId, amount });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.schema("api").rpc("set_item_ingredient", {
    p_item_id: parsed.data.itemId,
    p_ingredient_id: parsed.data.ingredientId,
    p_quantity: parsed.data.amount,
    p_is_key: false,
  });
  return error || !data ? { ok: false, error: "failed" } : { ok: true, id: data };
}

// Copies a reference ingredient into the café and returns its id.
export async function addCatalogIngredient(key: string): Promise<IngredientResult> {
  const me = await requireMember(["owner", "manager"]);
  const parsed = z.string().min(1).max(60).safeParse(key);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.schema("api").rpc("add_catalog_ingredient", {
    p_restaurant_id: me.restaurantId,
    p_key: parsed.data,
  });
  return error || !data ? { ok: false, error: "failed" } : { ok: true, id: data };
}

// Saves one line of a dish: amount, key ingredient, replacement and price change.
export async function saveDishIngredient(input: IngredientLineInput): Promise<IngredientResult> {
  await requireMember(["owner", "manager"]);
  const parsed = lineInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const d = parsed.data;
  // A price change only makes sense with a replacement (the database agrees).
  if (d.substituteId === null && d.priceDelta !== null) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.schema("api").rpc("set_item_ingredient", {
    p_item_id: d.itemId,
    p_ingredient_id: d.ingredientId,
    p_quantity: d.quantity,
    p_is_key: d.isKey,
    p_substitute_ingredient_id: d.substituteId as string,
    p_price_delta: d.priceDelta as number,
  });
  return error ? { ok: false, error: "failed" } : { ok: true };
}

// Calories per 100 g (or ml) and the weight of one piece for one ingredient;
// null clears a value. The range checks are Postgres's (api.set_ingredient_kcal, ADR-082).
export async function setIngredientKcal(input: {
  ingredientId: string;
  kcalPer100: number | null;
  gramsPerPiece: number | null;
}): Promise<IngredientResult> {
  await requireMember(["owner", "manager"]);
  const parsed = z
    .object({
      ingredientId: uuid,
      kcalPer100: z.number().min(0).max(1000).nullable(),
      gramsPerPiece: z.number().min(0.1).max(10000).nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.schema("api").rpc("set_ingredient_kcal", {
    p_ingredient_id: parsed.data.ingredientId,
    p_kcal_per_100g: parsed.data.kcalPer100 as number,
    p_grams_per_piece: parsed.data.gramsPerPiece as number,
  });
  return error ? { ok: false, error: "failed" } : { ok: true };
}

export async function removeDishIngredient(itemId: string, ingredientId: string): Promise<IngredientResult> {
  await requireMember(["owner", "manager"]);
  const parsed = z.object({ itemId: uuid, ingredientId: uuid }).safeParse({ itemId, ingredientId });
  if (!parsed.success) return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.schema("api").rpc("remove_item_ingredient", {
    p_item_id: parsed.data.itemId,
    p_ingredient_id: parsed.data.ingredientId,
  });
  return error ? { ok: false, error: "failed" } : { ok: true };
}

// The owner's choice for dishes that need an out ingredient with no replacement.
export async function setOutIngredientDisplay(mode: "hide" | "sold_out"): Promise<IngredientResult> {
  const me = await requireMember(["owner", "manager"]);
  if (mode !== "hide" && mode !== "sold_out") return { ok: false, error: "invalid" };
  const supabase = await createClient();
  const { data: location } = await supabase
    .from("locations")
    .select("id")
    .eq("restaurant_id", me.restaurantId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!location) return { ok: false, error: "failed" };
  const { error } = await supabase
    .schema("api")
    .rpc("set_out_ingredient_display", { p_location_id: location.id, p_mode: mode });
  revalidatePath("/admin/menu");
  return error ? { ok: false, error: "failed" } : { ok: true };
}
