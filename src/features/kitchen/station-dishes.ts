import type { Locale } from "@/i18n/routing";
import type { Json } from "@/lib/supabase/types";
import { pickName } from "./board-model";

export type StationDish = { id: string; name: string; nameLocale: Locale };
export type DishSection = { category: string; dishes: StationDish[] };

type Snapshot = {
  menus?: { categories?: { name?: Json; item_ids?: string[] }[] }[];
  items?: Record<string, { name?: Json; prep_area_id?: string | null } | undefined>;
};

// The dishes a station cooks, from the published menu, grouped by menu section
// for the stop-list drawer. Same routing as private.place_order_core: a dish
// goes to the station of its prep area, otherwise to the default station.
export function stationDishes(
  snapshot: Json,
  links: readonly { prep_area_id: string; station_id: string }[],
  station: { id: string; isDefault: boolean },
  locale: Locale,
): DishSection[] {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return [];
  const menu = snapshot as unknown as Snapshot;
  const stationOf = new Map(links.map((l) => [l.prep_area_id, l.station_id]));
  const sections: DishSection[] = [];
  const seen = new Set<string>();
  for (const m of menu.menus ?? []) {
    for (const c of m.categories ?? []) {
      const dishes: StationDish[] = [];
      for (const id of c.item_ids ?? []) {
        const item = menu.items?.[id];
        if (!item || seen.has(id)) continue;
        const target = (item.prep_area_id && stationOf.get(item.prep_area_id)) || null;
        if (target ? target !== station.id : !station.isDefault) continue;
        seen.add(id);
        const name = pickName(item.name ?? null, locale);
        dishes.push({ id, name: name.text, nameLocale: name.locale });
      }
      if (dishes.length) sections.push({ category: pickName(c.name ?? null, locale).text, dishes });
    }
  }
  return sections;
}
