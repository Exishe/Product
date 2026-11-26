import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/features/admin-ui/auth-shell";
import { ResetForm } from "@/features/auth/reset-form";

export const viewport: Viewport = { themeColor: "#ffffff" };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: `${t("auth.reset.title")} · ${t("brand.name")}` };
}

// Where the reset email's link lands: the browser client reads the link's
// code into a session, then the owner sets a new password.
export default async function ResetPasswordPage() {
  const t = await getTranslations();
  return (
    <AuthShell
      brand={t("brand.name")}
      title={t("auth.reset.title")}
      subtitle={<p className="m-0">{t("auth.reset.subtitle")}</p>}
    >
      <NextIntlClientProvider>
        <ResetForm />
      </NextIntlClientProvider>
    </AuthShell>
  );
}
