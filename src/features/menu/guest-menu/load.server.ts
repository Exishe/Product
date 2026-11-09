import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/public";
import type { PublicMenu } from "./view-model";

const SLUG = /^[a-z0-9][a-z0-9-]{1,47}$/;

// The published snapshot plus today's stop list (api.public_menu), read
// without a session. Cached per request so metadata and page share one call.
export const getPublicMenu = cache(async (restaurant: string, location: string): Promise<PublicMenu | null> => {
  if (!SLUG.test(restaurant) || !SLUG.test(location)) return null;
  const { data, error } = await createPublicClient()
    .schema("api")
    .rpc("public_menu", { p_restaurant_slug: restaurant, p_location_slug: location });
  if (error) throw new Error(`public_menu failed: ${error.code} ${error.message}`);
  return (data as PublicMenu | null) ?? null;
});
