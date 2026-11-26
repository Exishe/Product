import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AuthShell } from "@/features/admin-ui/auth-shell";
import { LoginForm } from "@/features/auth/login-form";

export const viewport: Viewport = { themeColor: "#ffffff" };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: `${t("auth.login.title")} · ${t("brand.name")}` };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const t = await getTranslations();
  return (
    <AuthShell
      brand={t("brand.name")}
      title={t("auth.login.title")}
      subtitle={<p className="m-0">{t("auth.login.subtitle")}</p>}
      footer={
        <>
          <p className="m-0">
            {t("auth.login.noAccount")}{" "}
            <Link
              href={next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"}
              className="text-ink inline-flex min-h-11 items-center rounded-full font-semibold underline underline-offset-4"
            >
              {t("auth.login.signupLink")}
            </Link>
          </p>
          {/* A cook or waiter handed a tablet lands here first: the way to pairing. */}
          <p className="m-0">
            <Link
              href="/pair"
              className="text-ink inline-flex min-h-11 items-center rounded-full underline underline-offset-4"
            >
              {t("auth.login.pairLink")}
            </Link>
          </p>
        </>
      }
    >
      <NextIntlClientProvider>
        <LoginForm next={next} />
      </NextIntlClientProvider>
    </AuthShell>
  );
}
