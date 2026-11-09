import { getTranslations } from "next-intl/server";
import { PlanBanner } from "@/features/billing/plan-banner";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";

export default async function AdminHome() {
  const member = await requireMember(["owner", "manager"]);
  const supabase = await createClient();
  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("name")
    .eq("id", member.restaurantId)
    .single();
  const t = await getTranslations("admin.home");
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-2">
        <p className="text-muted">{t("welcome", { name: member.displayName })}</p>
        <h1 className="display-face text-display-38">{restaurant?.name}</h1>
      </div>
      {member.role === "owner" && (
        <PlanBanner restaurantId={member.restaurantId} locale={member.locale as Locale} />
      )}
    </main>
  );
}
