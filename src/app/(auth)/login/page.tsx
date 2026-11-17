import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AuthShell } from "@/features/admin-ui/auth-shell";
import { LoginForm } from "@/features/auth/login-form";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const t = await getTranslations();
  return (
    <AuthShell
      brand={t("brand.name")}
      title={t("auth.login.title")}
      subtitle={<p className="m-0">{t("brand.tagline")}</p>}
      footer={
        <p className="m-0">
          {t("auth.login.noAccount")}{" "}
          <Link
            href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
            className="text-tarragon inline-flex min-h-11 items-center rounded-lg font-semibold underline underline-offset-4"
          >
            {t("auth.login.signupLink")}
          </Link>
        </p>
      }
    >
      <NextIntlClientProvider>
        <LoginForm next={next} />
      </NextIntlClientProvider>
    </AuthShell>
  );
}
