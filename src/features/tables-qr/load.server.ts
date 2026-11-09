import "server-only";
import { createClient } from "@/lib/supabase/server";
import { sortTables } from "./schema";

export type FloorTable = { id: string; label: string; seats: number; areaId: string | null; qrVersion: number };
export type FloorArea = { id: string; name: string };
export type Floor = {
  locationId: string;
  menuPublished: boolean;
  tables: FloorTable[];
  areas: FloorArea[];
};

// The café's first location: Stage 1 cafés have one (as in staff pairing).
// Read with the owner's or manager's session, so RLS decides what comes back.
export async function loadFloor(restaurantId: string): Promise<Floor | null> {
  const supabase = await createClient();
  const { data: location } = await supabase
    .from("locations")
    .select("id, published_menu_version_id")
    .eq("restaurant_id", restaurantId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!location) return null;

  const [tables, areas] = await Promise.all([
    supabase
      .from("tables")
      .select("id, label, seats, area_id, qr_version")
      .eq("location_id", location.id)
      .eq("is_active", true),
    supabase.from("areas").select("id, name").eq("location_id", location.id).order("sort"),
  ]);

  return {
    locationId: location.id,
    menuPublished: location.published_menu_version_id !== null,
    tables: sortTables(
      (tables.data ?? []).map((t) => ({ id: t.id, label: t.label, seats: t.seats, areaId: t.area_id, qrVersion: t.qr_version })),
    ),
    areas: areas.data ?? [],
  };
}
