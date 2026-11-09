import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ImportUpload } from "@/features/menu-import/import-upload";
import { requireMember } from "@/lib/auth/require-member";

// Reading the photos runs inside a server action started from this page.
export const maxDuration = 120;

export default async function MenuImportPage() {
  await requireMember(["owner", "manager"]);
  const t = await getTranslations("menuImport");
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="display-face text-display-38">{t("title")}</h1>
      <NextIntlClientProvider>
        <ImportUpload />
      </NextIntlClientProvider>
    </main>
  );
}
