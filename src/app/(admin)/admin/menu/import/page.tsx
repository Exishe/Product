import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AdminPage } from "@/features/admin-ui/page";
import { ImportUpload } from "@/features/menu-import/import-upload";
import { requireMember } from "@/lib/auth/require-member";

// Reading the photos runs inside a server action started from this page.
export const maxDuration = 120;

export default async function MenuImportPage() {
  await requireMember(["owner", "manager"]);
  const t = await getTranslations("menuImport");
  return (
    <AdminPage title={t("title")} width="lg">
      <NextIntlClientProvider>
        <ImportUpload />
      </NextIntlClientProvider>
    </AdminPage>
  );
}
