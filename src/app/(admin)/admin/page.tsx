import { ChevronRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { NAV_ICONS, type NavIcon } from "@/features/admin-nav/nav-icons";
import { AdminPage, Section } from "@/features/admin-ui/page";
import { PlanBanner } from "@/features/billing/plan-banner";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";

const SHORTCUTS: readonly { key: NavIcon; href: string }[] = [
  { key: "dashboard", href: "/admin/dashboard" },
  { key: "menu", href: "/admin/menu" },
  { key: "import", href: "/admin/menu/import" },
  { key: "tables", href: "/admin/tables" },
  { key: "staff", href: "/admin/staff" },
  { key: "look", href: "/admin/look" },
  { key: "telegram", href: "/admin/telegram" },
  { key: "export", href: "/admin/export" },
];

export default async function AdminHome() {
  const member = await requireMember(["owner", "manager"]);
  const supabase = await createClient();
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("name")
    .eq("id", member.restaurantId)
    .single();
  const [t, nav] = await Promise.all([getTranslations("admin.home"), getTranslations("adminNav")]);
  return (
    <AdminPage title={restaurant?.name} subtitle={t("welcome", { name: member.displayName })} width="md">
      {member.role === "owner" && (
        <PlanBanner restaurantId={member.restaurantId} locale={member.locale as Locale} />
      )}
      <Section title={t("sections")} id="home-sections" bare>
        <ul className="grid gap-3 sm:grid-cols-2">
          {SHORTCUTS.map(({ key, href }) => {
            const Icon = NAV_ICONS[key];
            return (
              <li key={key}>
                <Link
                  href={href}
                  className="flex min-h-16 items-center gap-4 rounded-2xl bg-white px-4 py-3 text-[1.0625rem] font-semibold"
                >
                  <span className="bg-tarragon-tint text-tarragon grid size-10 shrink-0 place-items-center rounded-xl">
                    <Icon aria-hidden="true" className="size-5" />
                  </span>
                  <span className="min-w-0 flex-1 break-words">{nav(key)}</span>
                  <ChevronRight aria-hidden="true" className="text-staff-label2 size-5 shrink-0" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Section>
    </AdminPage>
  );
}
