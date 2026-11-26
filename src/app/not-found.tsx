import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { AuthShell } from "@/features/admin-ui/auth-shell";
import { button } from "@/features/admin-ui/styles";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  // The sentence's own full stop (։ or .) has no place in a tab title.
  return { title: `${t("common.notFound").replace(/[։.]$/, "")} · ${t("brand.name")}` };
}

// The 404 for every path (a mistyped café link, an old QR code): the way
// home, one line for a guest at a table, and two quiet routes on, to the demo
// menu and to sign-in.
export default async function NotFound() {
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);
  const link = "text-ink inline-flex min-h-11 items-center rounded-full font-semibold underline underline-offset-4";
  return (
    <AuthShell
      bare
      brand={t("brand.name")}
      title={t("common.notFound")}
      subtitle={<p className="m-0">{t("common.notFoundHint")}</p>}
      footer={
        <>
          <p className="m-0 text-pretty">{t("common.notFoundQr")}</p>
          <nav aria-label={t("common.notFound")} className="mt-2 flex flex-wrap gap-x-6">
            {/* A plain link: the demo menu loads in the page's language. */}
            <a href={`/${locale}/m/pativ-demo/main`} className={link}>
              {t("common.notFoundDemo")}
            </a>
            <Link href="/login" className={link}>
              {t("common.notFoundSignIn")}
            </Link>
          </nav>
        </>
      }
    >
      <Link href="/" className={button("primary", "min-h-14 w-full self-start px-6 sm:w-auto")}>
        {t("common.backHome")}
      </Link>
    </AuthShell>
  );
}
