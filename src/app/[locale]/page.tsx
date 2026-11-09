import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function LocaleHome({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("brand");
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="display-face text-display-38 text-tarragon">{t("name")}</h1>
      <p className="text-xl text-muted">{t("tagline")}</p>
    </main>
  );
}
