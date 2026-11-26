import { CircleAlert } from "lucide-react";
import { AdminPage } from "@/features/admin-ui/page";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { loadFloor } from "@/features/tables-qr/load.server";
import { PrintButton } from "@/features/tables-qr/print-button";
import { PrintSheets, type CardText, type QrCard } from "@/features/tables-qr/print-sheet";
import { routing } from "@/i18n/routing";
import { requireMember } from "@/lib/auth/require-member";
import { parseServerEnv } from "@/lib/env.server";
import { createClient } from "@/lib/supabase/server";

// A4 sheets of table cards. Every token is signed in the database for the
// table's current qr_version (api.table_qr_token), so a reprinted table gets
// a new code and its old sticker stops working.
export default async function PrintQrPage({ searchParams }: { searchParams: Promise<{ table?: string }> }) {
  const me = await requireMember(["owner", "manager"]);
  const { table: only } = await searchParams;
  const floor = await loadFloor(me.restaurantId);
  if (!floor) notFound();
  const tables = only ? floor.tables.filter((x) => x.id === only) : floor.tables;

  const supabase = await createClient();
  const baseUrl = parseServerEnv(process.env).APP_BASE_URL;
  const [restaurant, cards] = await Promise.all([
    supabase.from("restaurants").select("name").eq("id", me.restaurantId).single(),
    Promise.all(
      tables.map(async (x): Promise<QrCard> => {
        const { data: token, error } = await supabase
          .schema("api")
          .rpc("table_qr_token", { p_table_id: x.id });
        if (error || !token) throw new Error(`No QR token for table ${x.id}: ${error?.message}`);
        return { tableId: x.id, label: x.label, url: new URL(`/t/${token}`, baseUrl).toString() };
      }),
    ),
  ]);

  const t = await getTranslations("tables");
  const texts: CardText[] = await Promise.all(
    routing.locales.map(async (lang) => {
      const c = await getTranslations({ locale: lang, namespace: "qrCard" });
      return { lang, table: c("table"), scan: c("scan") };
    }),
  );

  return (
    <AdminPage
      back={{ href: "/admin/tables", label: t("print.back") }}
      title={t("print.title")}
      subtitle={<p className="m-0">{t("print.hint")}</p>}
      actions={cards.length > 0 && <PrintButton label={t("print.print")} />}
      width="lg"
      className="print:block print:max-w-none print:p-0"
    >
      {!floor.menuPublished && (
        <p
          role="status"
          className="bg-amber-tint m-0 flex items-start gap-3 rounded-xl px-4 py-3 text-name print:hidden"
        >
          <CircleAlert aria-hidden="true" className="text-amber-text mt-0.5 size-5 shrink-0" />
          {t("print.notPublished")}
        </p>
      )}
      {cards.length === 0 ? (
        <p className="text-staff-label2 m-0">{t("print.empty")}</p>
      ) : (
        <PrintSheets
          cafeName={restaurant.data?.name ?? ""}
          cards={cards}
          texts={texts}
          sheetLabel={(n) => t("print.sheet", { n })}
          qrLabel={(label) => t("tableName", { label })}
        />
      )}
    </AdminPage>
  );
}
