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

  const { data: location } = await supabase
    .from("locations")
    .select("id, published_menu_version_id")
    .eq("restaurant_id", restaurantId)
    .order("created_at")
    .limit(1)
    .single();
  const locationId = location?.id as string;

  const [cats, dishes, groups, areas, stops, version] = await Promise.all([
    supabase
      .from("categories")
      .select("id, sort, prep_area_id, updated_at, category_translations(locale, name)")
      .eq("restaurant_id", restaurantId)
      .order("sort"),
    supabase
      .from("items")
      .select(
        "id, category_id, price, sort, prep_area_id, tags, image_path, is_active, updated_at, item_translations(locale, name, description, source, reviewed_at, updated_at), item_modifier_groups(group_id, sort)",
      )
      .eq("restaurant_id", restaurantId)
      .order("sort"),
    supabase
      .from("modifier_groups")
      .select(
        "id, min_select, max_select, updated_at, modifier_group_translations(locale, name), modifiers(id, price_delta, is_default, is_active, sort, modifier_translations(locale, name))",
      )
      .eq("restaurant_id", restaurantId)
      .order("created_at"),
    supabase.from("prep_areas").select("id, name").eq("restaurant_id", restaurantId).order("created_at"),
    supabase.from("stop_list").select("item_id, until").eq("location_id", locationId),
    location?.published_menu_version_id
      ? supabase.from("menu_versions").select("published_at, item_count").eq("id", location.published_menu_version_id).single()
      : Promise.resolve({ data: null }),
  ]);

  // Unpublished: never published, something edited after publishing, or a dish
  // removed (the active count no longer matches the snapshot).
  const now = Date.now();
  const publishedAt = version.data?.published_at ?? null;
  const since = publishedAt ? Date.parse(publishedAt) : 0;
  const editedSince = (rows: { updated_at: string }[] | null) => (rows ?? []).some((r) => Date.parse(r.updated_at) > since);
  const activeCount = (dishes.data ?? []).filter((d) => d.is_active).length;
  const publish = {
    published: Boolean(publishedAt),
    publishedAt,
    hasChanges:
      !publishedAt ||
      editedSince(cats.data) ||
      editedSince(dishes.data) ||
      editedSince(groups.data) ||
      activeCount !== version.data?.item_count,
  };

  return {
    restaurantId,
    locationId,
    soldOut: (stops.data ?? []).filter((s) => !s.until || Date.parse(s.until) > now).map((s) => s.item_id),
    publish,
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
