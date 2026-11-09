import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { SignUpForm } from "@/features/auth/signup-form";

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const t = await getTranslations();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <p className="display-face text-3xl text-tarragon">{t("brand.name")}</p>
      <h1 className="text-2xl font-semibold">{t("auth.signup.title")}</h1>
      <NextIntlClientProvider>
        <SignUpForm next={next} />
      </NextIntlClientProvider>
      <p className="text-muted">
        {t("auth.signup.haveAccount")}{" "}
        <Link href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"} className="font-semibold text-tarragon underline underline-offset-4">
          {t("auth.signup.loginLink")}
        </Link>
      </p>
    </main>
  );
}
