import { getTranslations } from "next-intl/server";

export default async function Forbidden() {
  const t = await getTranslations("forbidden");
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="display-face text-display-38">{t("title")}</h1>
    </main>
  );
}
