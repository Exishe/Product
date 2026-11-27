import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { AuthShell } from "@/features/admin-ui/auth-shell";
import { LoginForm } from "@/features/auth/login-form";

export const viewport: Viewport = { themeColor: "#ffffff" };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  const title = `${t("auth.login.title")} · ${t("brand.name")}`;
  const description = t("auth.login.subtitle");
  // A shared sign-in link (kitchen and waiter logins) shows the staff screens.
  const images = [{ url: `/og/staff-${await getLocale()}.jpg`, width: 1200, height: 630, alt: title }];
  return {
    title,
    description,
    openGraph: { title, description, type: "website", images },
    twitter: { card: "summary_large_image", title, description, images },
  };
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
