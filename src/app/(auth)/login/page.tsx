import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { LoginForm } from "@/features/auth/login-form";

export default async function LoginPage() {
  const t = await getTranslations();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <p className="display-face text-3xl text-tarragon">{t("brand.name")}</p>
      <h1 className="text-2xl font-semibold">{t("auth.login.title")}</h1>
      <NextIntlClientProvider>
        <LoginForm />
      </NextIntlClientProvider>
      <p className="text-muted">
        {t("auth.login.noAccount")}{" "}
        <Link href="/signup" className="font-semibold text-tarragon underline underline-offset-4">
          {t("auth.login.signupLink")}
        </Link>
      </p>
    </main>
  );
}
