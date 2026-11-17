import { Printer } from "lucide-react";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AdminPage } from "@/features/admin-ui/page";
import { button } from "@/features/admin-ui/styles";
import { loadFloor } from "@/features/tables-qr/load.server";
import { TablesEditor } from "@/features/tables-qr/tables-editor";
import { requireMember } from "@/lib/auth/require-member";

export default async function TablesPage() {
  const me = await requireMember(["owner", "manager"]);
  const floor = await loadFloor(me.restaurantId);
  if (!floor) notFound();
  const t = await getTranslations("tables");
  return (
    <AdminPage
      title={t("title")}
      subtitle={<p className="m-0">{t("intro")}</p>}
      actions={
        floor.tables.length > 0 && (
          <Link href="/admin/tables/print" className={button("primary")}>
            <Printer aria-hidden="true" />
            {t("printAll")}
          </Link>
        )
      }
    >
      <NextIntlClientProvider>
        <TablesEditor floor={floor} />
      </NextIntlClientProvider>
    </AdminPage>
  );
}
