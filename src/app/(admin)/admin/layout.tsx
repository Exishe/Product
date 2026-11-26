import { getTranslations } from "next-intl/server";
import { cookies } from "next/headers";
import { AdminNav, type NavLink } from "@/features/admin-nav/admin-nav";
import { ToastProvider } from "@/features/admin-ui/toast";
import { pickMembership, type Membership } from "@/lib/auth/membership";
import { RESTAURANT_COOKIE } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";

// The admin sections around every owner page. Pages still check access
// themselves (requireMember); this only decides whether to draw the navigation.
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
  // At most seven one-line items (ADR-094). Reports and Export are reached
  // from Sales, Import from the menu page.
  const links: NavLink[] = [
    { href: "/admin", label: t("home"), icon: "home" },
    { href: "/admin/dashboard", label: t("dashboard"), icon: "dashboard", also: ["/admin/reports", "/admin/export"] },
    { href: "/admin/menu", label: t("menu"), icon: "menu" },
    { href: "/admin/tables", label: t("tables"), icon: "tables" },
    { href: "/admin/staff", label: t("staff"), icon: "staff" },
    { href: "/admin/look", label: t("look"), icon: "look" },
    { href: "/admin/telegram", label: t("telegram"), icon: "telegram" },
    ...(admin ? [{ href: "/platform", label: t("platform"), icon: "platform" as const }] : []),
  ];

  // Staff screens are neutral grey (ADR-054, ADR-055); the guest themes never reach here.
  return (
    // ADR-094: the "inverted L". The navigation sits flush on the grey; the
    // content is one white column, so a view reads as one page, not as cards.
    <div className="admin-shell text-ink flex min-h-dvh flex-col bg-white lg:flex-row lg:bg-staff-bg print:bg-white">
      <AdminNav
        brand={brand("name")}
        cafe={restaurant?.name ?? ""}
        label={t("label")}
        menuLabel={t("open")}
        closeLabel={t("close")}
        links={links}
      />
      <div className="min-w-0 flex-1 bg-white">
        <ToastProvider>{children}</ToastProvider>
      </div>
    </div>
  );
}
