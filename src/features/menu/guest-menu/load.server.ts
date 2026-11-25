import "server-only";
import { cache } from "react";
import { retryTransient } from "@/lib/async/retry";
import { createPublicClient } from "@/lib/supabase/public";
import { NO_HINTS, parseHints, type MenuHints } from "./hints";
import type { PublicMenu } from "./view-model";

const SLUG = /^[a-z0-9][a-z0-9-]{1,47}$/;

// The published snapshot plus today's stop list (api.public_menu), read
// without a session. Cached per request so metadata and page share one call.
// A busy database is retried twice (ADR-089) before the call throws.
export const getPublicMenu = cache(
  async (restaurant: string, location: string): Promise<PublicMenu | null> => {
    if (!SLUG.test(restaurant) || !SLUG.test(location)) return null;
    let last = "";
    const result = await retryTransient<PublicMenu | null>(async () => {
      const { data, error } = await createPublicClient()
        .schema("api")
        .rpc("public_menu", { p_restaurant_slug: restaurant, p_location_slug: location });
      if (!error) return { ok: true, value: (data as PublicMenu | null) ?? null };
      last = `${error.code} ${error.message}`;
      return { ok: false, transient: true };
    });
    if (!result.ok) throw new Error(`public_menu failed: ${last}`);
    return result.value;
  },
);

// Hints from the café's own orders (ADR-060). Optional: any failure (the
// function not deployed yet, a slow database) means no hints, never an error
// page, and never holds the menu up for long.
export const getMenuHints = cache(async (restaurant: string, location: string): Promise<MenuHints> => {
  if (!SLUG.test(restaurant) || !SLUG.test(location)) return NO_HINTS;
  try {
    const { data, error } = await createPublicClient()
      .schema("api")
      .rpc("public_menu_hints", { p_restaurant_slug: restaurant, p_location_slug: location })
      .abortSignal(AbortSignal.timeout(2_000));
    return error ? NO_HINTS : parseHints(data);
  } catch {
    return NO_HINTS;
  }
});
