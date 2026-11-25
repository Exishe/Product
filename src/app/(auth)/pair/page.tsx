import { clsx } from "clsx";
import { Unplug } from "lucide-react";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/features/admin-ui/auth-shell";
import { alert } from "@/features/admin-ui/styles";
import { PairForm } from "@/features/staff/pair-form";

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
