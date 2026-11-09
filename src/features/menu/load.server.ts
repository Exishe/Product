import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { EditorData, Names } from "./types";

type Tr = { locale: "hy" | "ru" | "en"; name: string; description?: string | null };

function names(rows: Tr[] | null | undefined, field: "name" | "description" = "name"): Names {
  const out: Names = { hy: "", ru: "", en: "" };
  for (const r of rows ?? []) out[r.locale] = (field === "name" ? r.name : r.description) ?? "";
  return out;
}

// Everything the editor shows, read with the owner's session (RLS applies).
export async function loadMenuEditor(restaurantId: string): Promise<EditorData> {
  const supabase = await createClient();
  await supabase.schema("api").rpc("ensure_menu", { p_restaurant_id: restaurantId });

  const [cats, dishes, groups, areas] = await Promise.all([
    supabase
      .from("categories")
      .select("id, sort, prep_area_id, category_translations(locale, name)")
      .eq("restaurant_id", restaurantId)
      .order("sort"),
    supabase
      .from("items")
      .select(
        "id, category_id, price, sort, prep_area_id, tags, image_path, item_translations(locale, name, description, source, reviewed_at), item_modifier_groups(group_id, sort)",
      )
      .eq("restaurant_id", restaurantId)
      .order("sort"),
    supabase
      .from("modifier_groups")
      .select(
        "id, min_select, max_select, modifier_group_translations(locale, name), modifiers(id, price_delta, is_default, is_active, sort, modifier_translations(locale, name))",
      )
      .eq("restaurant_id", restaurantId)
      .order("created_at"),
    supabase.from("prep_areas").select("id, name").eq("restaurant_id", restaurantId).order("created_at"),
  ]);

  return {
    restaurantId,
    categories: (cats.data ?? []).map((c) => ({
      id: c.id,
      sort: c.sort,
      prepAreaId: c.prep_area_id,
      names: names(c.category_translations),
    })),
    dishes: (dishes.data ?? []).map((d) => ({
      id: d.id,
      categoryId: d.category_id,
      price: d.price,
      sort: d.sort,
      prepAreaId: d.prep_area_id,
      tags: d.tags,
      imagePath: d.image_path,
      names: names(d.item_translations),
      descriptions: names(d.item_translations, "description"),
      needsReview: d.item_translations.some((t) => t.source === "ai" && !t.reviewed_at),
      modifierGroupIds: [...d.item_modifier_groups].sort((a, b) => a.sort - b.sort).map((g) => g.group_id),
    })),
    groups: (groups.data ?? []).map((g) => ({
      id: g.id,
      minSelect: g.min_select,
      maxSelect: g.max_select,
      names: names(g.modifier_group_translations),
      options: g.modifiers
        .filter((m) => m.is_active)
        .sort((a, b) => a.sort - b.sort)
        .map((m) => ({ id: m.id, names: names(m.modifier_translations), priceDelta: m.price_delta, isDefault: m.is_default })),
    })),
    prepAreas: areas.data ?? [],
  };
}
