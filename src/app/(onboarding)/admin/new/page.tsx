import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AuthShell } from "@/features/admin-ui/auth-shell";
import { CreateCafeForm } from "@/features/onboarding/create-cafe-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewCafePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data || data.claims.is_anonymous) redirect("/login");
  const [t, brand] = await Promise.all([getTranslations("onboarding"), getTranslations("brand")]);
  return (
    <AuthShell brand={brand("name")} title={t("title")} subtitle={<p className="m-0">{t("intro")}</p>}>
      <NextIntlClientProvider>
        <CreateCafeForm />
      </NextIntlClientProvider>
    </AuthShell>
  );
}
