import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AuthShell } from "@/features/admin-ui/auth-shell";
import { ForgotForm } from "@/features/auth/forgot-form";

export const viewport: Viewport = { themeColor: "#ffffff" };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations();
  return { title: `${t("auth.forgot.title")} · ${t("brand.name")}` };
}

// "Forgot your password?" from sign-in. Two kinds of account sign in there:
// a staff login (waiter, kitchen) has no email, so its owner sets a new
// password in the admin (staff.logins.setPassword); an owner's account gets a
// reset link by email (Supabase Auth, then /reset-password).
export default async function ForgotPasswordPage() {
  const t = await getTranslations();
  return (
    <AuthShell
      brand={t("brand.name")}
      title={t("auth.forgot.title")}
      footer={
        <p className="m-0">
          <Link
            href="/login"
            className="text-ink inline-flex min-h-11 items-center rounded-full underline underline-offset-4"
          >
            {t("auth.forgot.back")}
          </Link>
        </p>
      }
    >
      <section aria-labelledby="forgot-owner" className="flex flex-col gap-2">
        <h2 id="forgot-owner" className="text-heading m-0 font-semibold">
          {t("auth.forgot.ownerTitle")}
        </h2>
        <p className="text-staff-label2 text-name m-0 leading-normal text-pretty">
          {t("auth.forgot.ownerText")}
        </p>
        <div className="mt-4">
          <NextIntlClientProvider>
            <ForgotForm />
          </NextIntlClientProvider>
        </div>
      </section>
      <section
        aria-labelledby="forgot-staff"
        className="border-hairline mt-10 flex flex-col gap-2 border-t pt-8"
      >
        <h2 id="forgot-staff" className="text-heading m-0 font-semibold">
          {t("auth.forgot.staffTitle")}
        </h2>
        <p className="text-staff-label2 text-name m-0 leading-normal text-pretty">
          {t("auth.forgot.staffText")}
        </p>
      </section>
    </AuthShell>
  );
}
