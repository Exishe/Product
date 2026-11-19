import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AuthShell } from "@/features/admin-ui/auth-shell";
import { SignUpForm } from "@/features/auth/signup-form";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const t = await getTranslations();
  return (
    <AuthShell
      brand={t("brand.name")}
      title={t("auth.signup.title")}
      subtitle={<p className="m-0">{t("brand.tagline")}</p>}
      footer={
        <p className="m-0">
          {t("auth.signup.haveAccount")}{" "}
          <Link
            href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
            className="text-ink inline-flex min-h-11 items-center rounded-lg font-semibold underline underline-offset-4"
          >
            {t("auth.signup.loginLink")}
          </Link>
        </p>
      }
    >
      <NextIntlClientProvider>
        <SignUpForm next={next} />
      </NextIntlClientProvider>
    </AuthShell>
  );
}
