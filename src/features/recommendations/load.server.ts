import "server-only";
import { isMissing, untypedClient } from "./db.server";
import { isItemType, type Category, type Dish, type MatrixCell, type Names } from "./model";

export type PairingsData =
  | { supported: false }
  | {
      supported: true;
      locationId: string;
      categories: Category[];
      dishes: Dish[];
      pairings: { itemId: string; suggestId: string }[];
      matrix: MatrixCell[];
    };

type Tr = { locale: "hy" | "ru" | "en"; name: string };
const names = (rows: Tr[] | null | undefined): Names => {
  const out: Names = { hy: "", ru: "", en: "" };
  for (const r of rows ?? []) out[r.locale] = r.name;
  return out;
};

// What the "Goes well with" page shows, read with the owner's session (RLS
// applies). A database without the ADR-077 migration answers `supported: false`.
export async function loadPairings(restaurantId: string): Promise<PairingsData> {
  const db = await untypedClient();
  const loc = await db.from("locations").select("id").eq("restaurant_id", restaurantId);
  const locationId = ((loc.data as { id: string }[] | null) ?? [])[0]?.id;
  if (!locationId) return { supported: false };

  const [cats, items, pairs, matrix] = await Promise.all([
    db.from("categories").select("id, sort, is_active, category_translations(locale, name)").eq("restaurant_id", restaurantId),
    db
      .from("items")
      .select("id, category_id, sort, is_active, item_type, item_translations(locale, name)")
      .eq("restaurant_id", restaurantId),
    db.from("item_pairings").select("item_id, suggest_item_id, sort").eq("restaurant_id", restaurantId),
    db.schema("api").rpc("compat_matrix", { p_location_id: locationId }),
  ]);
  if (isMissing(items.error) || isMissing(pairs.error) || isMissing(matrix.error)) return { supported: false };

  type CatRow = { id: string; sort: number; is_active: boolean; category_translations: Tr[] };
  type ItemRow = {
    id: string;
    category_id: string;
    sort: number;
    is_active: boolean;
    item_type: string | null;
    item_translations: Tr[];
  };
  const catRows = ((cats.data as CatRow[] | null) ?? []).filter((c) => c.is_active).sort((a, b) => a.sort - b.sort);
  const itemRows = ((items.data as ItemRow[] | null) ?? []).filter((i) => i.is_active).sort((a, b) => a.sort - b.sort);
  return {
    supported: true,
    locationId,
    categories: catRows.map((c) => ({ id: c.id, names: names(c.category_translations) })),
    dishes: itemRows.map((i) => ({
      id: i.id,
      categoryId: i.category_id,
      names: names(i.item_translations),
      type: isItemType(i.item_type) ? i.item_type : null,
    })),
    pairings: (
      ((pairs.data as { item_id: string; suggest_item_id: string; sort: number }[] | null) ?? []).sort(
        (a, b) => a.sort - b.sort,
      )
    ).map((p) => ({ itemId: p.item_id, suggestId: p.suggest_item_id })),
    matrix: (matrix.data as MatrixCell[] | null) ?? [],
  };
}
