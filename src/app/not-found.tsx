import { getTranslations } from "next-intl/server";
import Link from "next/link";

export default async function NotFound() {
  const t = await getTranslations("common");
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="display-face text-display-38">{t("notFound")}</h1>
      <Link href="/" className="text-tarragon underline underline-offset-4">
        {t("backHome")}
      </Link>
    </main>
  );
}
