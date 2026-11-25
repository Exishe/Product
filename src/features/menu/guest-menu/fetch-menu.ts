import type { PublicMenu } from "./view-model";

// The published menu read in the browser (api.public_menu, the same call the
// page makes on the server), with a plain fetch: the guest menu ships no
// Supabase client. Null when the database can't answer; the status poll then
// asks again on its next round.
export async function fetchPublicMenu(restaurant: string, location: string): Promise<PublicMenu | null> {
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/public_menu`, {
      method: "POST",
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
        "Content-Type": "application/json",
        "Content-Profile": "api",
      },
      body: JSON.stringify({ p_restaurant_slug: restaurant, p_location_slug: location }),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    return isPublicMenu(data) ? data : null;
  } catch {
    return null;
  }
}

// Enough of the shape to build the view from (view-model.ts reads these).
function isPublicMenu(x: unknown): x is PublicMenu {
  if (typeof x !== "object" || x === null) return false;
  const m = x as Record<string, unknown>;
  return (
    typeof m.restaurant === "object" &&
    m.restaurant !== null &&
    typeof m.location === "object" &&
    m.location !== null &&
    typeof m.menu === "object" &&
    m.menu !== null
  );
}
