import { Lightbulb, SlidersHorizontal } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AdminPage } from "@/features/admin-ui/page";
import { button } from "@/features/admin-ui/styles";
import { loadMenuEditor } from "@/features/menu/load.server";
import { MenuEditor } from "@/features/menu/menu-editor";
import { requireMember } from "@/lib/auth/require-member";

export default async function MenuPage() {
  const me = await requireMember(["owner", "manager"]);
  const data = await loadMenuEditor(me.restaurantId, me.role === "owner");
  const t = await getTranslations("menu");
  return (
    <AdminPage
      title={t("title")}
      width="xl"
      actions={
        data.categories.length > 0 && (
          <>
            <Link href="/admin/menu/pairings" className={button("secondary", "min-h-11 text-[0.9375rem]")}>
              <Lightbulb aria-hidden="true" className="!size-4" />
              {t("managePairings")}
            </Link>
            <Link href="/admin/menu/options" className={button("secondary", "min-h-11 text-[0.9375rem]")}>
              <SlidersHorizontal aria-hidden="true" className="!size-4" />
              {t("manageOptions")}
            </Link>
          </>
        )
      }
    >
      <NextIntlClientProvider>
        <MenuEditor data={data} />
      </NextIntlClientProvider>
    </AdminPage>
  );
}
