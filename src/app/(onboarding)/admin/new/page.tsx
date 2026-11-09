import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { CreateCafeForm } from "@/features/onboarding/create-cafe-form";
import { createClient } from "@/lib/supabase/server";

export default async function NewCafePage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data || data.claims.is_anonymous) redirect("/login");
  const t = await getTranslations("onboarding");
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <h1 className="display-face text-display-38">{t("title")}</h1>
      <NextIntlClientProvider>
        <CreateCafeForm />
      </NextIntlClientProvider>
    </main>
  );
}
