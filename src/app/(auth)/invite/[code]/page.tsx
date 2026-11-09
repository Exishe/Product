import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { AcceptInviteForm } from "@/features/staff/accept-invite-form";
import { createClient } from "@/lib/supabase/server";

export default async function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data && !data.claims.is_anonymous);
  const t = await getTranslations();
  const next = encodeURIComponent(`/invite/${code}`);
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-6">
      <p className="display-face text-3xl text-tarragon">{t("brand.name")}</p>
      <h1 className="text-2xl font-semibold">{t("invite.title")}</h1>
      {signedIn ? (
        <NextIntlClientProvider>
          <AcceptInviteForm token={code} />
        </NextIntlClientProvider>
      ) : (
        <div className="flex flex-col gap-3">
          <p>{t("invite.signInFirst")}</p>
          <Link href={`/signup?next=${next}`} className="flex h-12 items-center justify-center rounded-input bg-tarragon font-semibold text-white">
            {t("auth.signup.submit")}
          </Link>
          <Link href={`/login?next=${next}`} className="flex h-12 items-center justify-center rounded-input border border-tarragon font-semibold text-tarragon">
            {t("auth.login.submit")}
          </Link>
        </div>
      )}
    </main>
  );
}
