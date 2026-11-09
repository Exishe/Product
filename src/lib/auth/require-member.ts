import "server-only";
import { cookies } from "next/headers";
import { forbidden, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { pickMembership, type MemberRole, type Membership } from "./membership";

export const RESTAURANT_COOKIE = "pativ-restaurant";

// Server-side gate for staff and admin pages. Not signed in → /login;
// signed in without a fitting role → 403.
// Staff screens (deviceScreen) send a disconnected device back to /pair.
export async function requireMember(
  roles: readonly MemberRole[],
  options: { deviceScreen?: boolean } = {},
): Promise<Membership> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  if (!userId) redirect("/login");

  const { data: rows } = await supabase
    .from("members")
    .select("id, restaurant_id, role, kind, display_name, locale")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("created_at");
  const memberships: Membership[] = (rows ?? []).map((r) => ({
    id: r.id,
    restaurantId: r.restaurant_id,
    role: r.role,
    kind: r.kind,
    displayName: r.display_name,
    locale: r.locale,
  }));

  // A signed-in person with no café yet goes to "create your café"; a guest
  // or device without a fitting role gets 403 below.
  if (memberships.length === 0 && !data?.claims.is_anonymous) redirect("/admin/new");
  if (memberships.length === 0 && options.deviceScreen) redirect("/pair?disconnected=1");

  const preferred = (await cookies()).get(RESTAURANT_COOKIE)?.value ?? null;
  const member = pickMembership(memberships, roles, preferred);
  if (!member) forbidden();
  return member;
}
