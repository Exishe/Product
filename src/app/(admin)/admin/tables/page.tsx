import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { loadFloor } from "@/features/tables-qr/load.server";
import { TablesEditor } from "@/features/tables-qr/tables-editor";
import { requireMember } from "@/lib/auth/require-member";

export default async function TablesPage() {
  const me = await requireMember(["owner", "manager"]);
  const floor = await loadFloor(me.restaurantId);
  if (!floor) notFound();
  const t = await getTranslations("tables");
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="display-face text-display-38 leading-tight">{t("title")}</h1>
          <p className="max-w-prose text-muted">{t("intro")}</p>
        </div>
        {floor.tables.length > 0 && (
          <Link
            href="/admin/tables/print"
            className="inline-flex min-h-12 items-center rounded-input bg-apricot px-4 font-semibold text-ink"
          >
            {t("printAll")}
          </Link>
        )}
      </div>
      <NextIntlClientProvider>
        <TablesEditor floor={floor} />
      </NextIntlClientProvider>
    </main>
  );
}
