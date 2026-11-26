import { Download, ReceiptText, ShoppingBag, BookOpen } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { AdminPage } from "@/features/admin-ui/page";
import { textAction } from "@/features/admin-ui/styles";
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
      {/* Hairline rows (ADR-093). From 640 px the download sits at the
          right; on a phone it is a text action under the description, so the
          text keeps the full width. */}
      <ul className="border-staff-sep m-0 flex list-none flex-col border-t p-0">
        {EXPORT_KINDS.map((kind) => {
          const Icon = ICONS[kind];
          return (
            <li
              key={kind}
              className="border-staff-sep flex min-h-16 min-w-0 flex-col gap-1 border-b py-4 sm:flex-row sm:items-center sm:gap-4"
            >
              <span className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
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
              {/* A plain link: the browser downloads the file, no client JS. */}
              <a
                href={`/admin/export/${kind}`}
                download
                data-testid={`export-${kind}`}
                className={textAction("ink", "max-sm:ml-[3.25rem] max-sm:w-fit max-sm:-translate-x-2 sm:-mr-2")}
              >
                <Download aria-hidden="true" />
                {t("downloadAs", { format: FORMAT })}
                <span className="sr-only">: {t(kind)}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </AdminPage>
  );
}
