import { clsx } from "clsx";
import { Unplug } from "lucide-react";
import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AuthShell } from "@/features/admin-ui/auth-shell";
import { alert } from "@/features/admin-ui/styles";
import { PairForm } from "@/features/staff/pair-form";

export const viewport: Viewport = { themeColor: "#ffffff" };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: `${t("pair.title")} · ${t("brand.name")}` };
}

export default async function PairPage({
  searchParams,
}: {
  searchParams: Promise<{ disconnected?: string }>;
}) {
  const { disconnected } = await searchParams;
  const t = await getTranslations();
  return (
    <AuthShell
      brand={t("brand.name")}
      title={t("pair.title")}
      subtitle={<p className="m-0">{t("pair.hint")}</p>}
      footer={
        // Opened by mistake, or an owner on a staff tablet: the way back to sign-in.
        <p className="m-0">
          <Link
            href="/login"
            className="text-ink inline-flex min-h-11 items-center rounded-full underline underline-offset-4"
          >
            {t("pair.loginLink")}
          </Link>
        </p>
      }
    >
      {disconnected && (
        <p role="status" className={clsx(alert.base, alert.notice, "mb-4")}>
          <Unplug aria-hidden="true" />
          {t("pair.disconnected")}
        </p>
      )}
      <NextIntlClientProvider>
        <PairForm />
      </NextIntlClientProvider>
    </AuthShell>
  );
}
