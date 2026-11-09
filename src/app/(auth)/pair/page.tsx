import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { PairForm } from "@/features/staff/pair-form";

export default async function PairPage({ searchParams }: { searchParams: Promise<{ disconnected?: string }> }) {
  const { disconnected } = await searchParams;
  const t = await getTranslations();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <p className="display-face text-3xl text-tarragon">{t("brand.name")}</p>
      <h1 className="text-2xl font-semibold">{t("pair.title")}</h1>
      {disconnected && (
        <p role="status" className="rounded-chip bg-apricot/20 px-3 py-2">
          {t("pair.disconnected")}
        </p>
      )}
      <NextIntlClientProvider>
        <PairForm />
      </NextIntlClientProvider>
    </main>
  );
}
