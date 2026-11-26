import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AuthShell } from "@/features/admin-ui/auth-shell";
import { button } from "@/features/admin-ui/styles";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  // The sentence's own full stop (։ or .) has no place in a tab title.
  return { title: `${t("common.notFound").replace(/[։.]$/, "")} · ${t("brand.name")}` };
}

export default async function NotFound() {
  const t = await getTranslations();
  return (
    <AuthShell
      bare
      brand={t("brand.name")}
      title={t("common.notFound")}
      subtitle={<p className="m-0">{t("common.notFoundHint")}</p>}
    >
      <Link href="/" className={button("primary", "min-h-14 w-full self-start px-6 sm:w-auto")}>
        {t("common.backHome")}
      </Link>
    </AuthShell>
  );
}
