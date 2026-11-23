import type { SupabaseClient } from "@supabase/supabase-js";
import { parseStatus } from "@/features/availability/status";
import { localized } from "@/features/menu/guest-menu/view-model";
import type { Locale } from "@/i18n/routing";

// The titles of the promos guests see right now (ADR-070), for the waiter's
// header line. It reads the same public call the guest menu polls; any
// failure (offline, migration not applied yet) is null: keep what is shown.
export async function fetchLivePromoTitles(
  supabase: SupabaseClient,
  locationId: string,
  locale: Locale,
): Promise<string[] | null> {
  try {
    const { data, error } = await supabase.schema("api").rpc("public_menu_status", { p_location_id: locationId });
    if (error) return null;
    const status = parseStatus(data);
    if (!status) return null;
    return status.promos.flatMap((p) => {
      const title = localized(p.title, locale)?.text;
      return title ? [title] : [];
    });
  } catch {
    return null;
  }
}
