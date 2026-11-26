import { clsx } from "clsx";
import { Download, FileSpreadsheet, ReceiptText, ShoppingBag, BookOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AdminPage } from "@/features/admin-ui/page";
import { button, table } from "@/features/admin-ui/styles";
import { EXPORT_KINDS } from "@/features/export/load.server";
import { requireMember } from "@/lib/auth/require-member";

// The file format is a technical name, the same in every language.
const FORMAT = "CSV";
const ICONS = { menu: BookOpen, orders: ShoppingBag, bills: ReceiptText } as const;

export default async function ExportPage() {
  await requireMember(["owner", "manager"]);
  const [t, nav] = await Promise.all([getTranslations("billing.export"), getTranslations("adminNav")]);
  return (
    <AdminPage
      back={{ href: "/admin/dashboard", label: nav("dashboard") }}
      title={t("title")}
      subtitle={<p className="m-0">{t("intro")}</p>}
    >
      <div className={table.wrap}>
        <table className={table.table}>
          <thead className={table.head}>
            <tr>
              <th scope="col" className={table.th}>
                {t("colData")}
              </th>
              <th scope="col" className={clsx(table.th, "max-sm:hidden")}>
                {t("colFile")}
              </th>
              <th scope="col" className={clsx(table.th, "w-0")}>
                <span className="sr-only">{t("download")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {EXPORT_KINDS.map((kind) => {
              const Icon = ICONS[kind];
              return (
                <tr key={kind} className={table.row}>
                  <td className={table.td}>
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden="true"
                        className="bg-staff-fill text-ink grid size-10 shrink-0 place-items-center rounded-xl"
                      >
                        <Icon className="size-5" />
                      </span>
                      <span className="flex min-w-0 flex-col">
                        <span className="text-name font-semibold">{t(kind)}</span>
                        <span className="text-staff-label2 text-label">{t(`${kind}Hint`)}</span>
                      </span>
                    </span>
                  </td>
                  <td className={clsx(table.td, "text-staff-label2 whitespace-nowrap max-sm:hidden")}>
                    <span className="inline-flex items-center gap-1.5">
                      <FileSpreadsheet aria-hidden="true" className="size-4" />
                      {FORMAT}
                    </span>
                  </td>
                  <td className={clsx(table.td, "text-right")}>
                    {/* A plain link: the browser downloads the file, no client JS. */}
                    <a
                      href={`/admin/export/${kind}`}
                      download
                      data-testid={`export-${kind}`}
                      className={button("secondary", "px-4 whitespace-nowrap")}
                    >
                      <Download aria-hidden="true" className="!size-4" />
                      {t("download")}
                      <span className="sr-only">: {t(kind)}</span>
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </AdminPage>
  );
}
