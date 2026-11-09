import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { AdminNav, type NavLink } from "@/features/admin-nav/admin-nav";
import { pickMembership, type Membership } from "@/lib/auth/membership";
import { RESTAURANT_COOKIE } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";

// The admin sections around every owner page. Pages still check access
// themselves (requireMember); this only decides whether to draw the sidebar.
// /admin/new lives in the (onboarding) group: a layout survives client
// navigation, so one drawn before the café existed would never show the nav.
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) return children;

  const [{ data: rows }, { data: admin }] = await Promise.all([
    supabase
      .from("members")
      .select("id, restaurant_id, role, kind, display_name, locale")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("created_at"),
    supabase.from("platform_admins").select("user_id").eq("user_id", userId).maybeSingle(),
  ]);
  const memberships: Membership[] = (rows ?? []).map((r) => ({
    id: r.id,
    restaurantId: r.restaurant_id,
    role: r.role,
    kind: r.kind,
    displayName: r.display_name,
    locale: r.locale,
  }));
  const member = pickMembership(
    memberships,
    ["owner", "manager"],
    (await cookies()).get(RESTAURANT_COOKIE)?.value ?? null,
  );
  if (!member) return children;

  const [{ data: restaurant }, t, brand] = await Promise.all([
    supabase.from("restaurants").select("name").eq("id", member.restaurantId).single(),
    getTranslations("adminNav"),
    getTranslations("brand"),
  ]);
  const links: NavLink[] = [
    { href: "/admin/dashboard", label: t("dashboard") },
    { href: "/admin/menu", label: t("menu") },
    { href: "/admin/menu/import", label: t("import"), sub: true },
    { href: "/admin/tables", label: t("tables") },
    { href: "/admin/staff", label: t("staff") },
    { href: "/admin/telegram", label: t("telegram") },
    { href: "/admin/export", label: t("export") },
    ...(admin ? [{ href: "/platform", label: t("platform") }] : []),
  ];

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <AdminNav brand={brand("name")} cafe={restaurant?.name ?? ""} label={t("label")} links={links} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
