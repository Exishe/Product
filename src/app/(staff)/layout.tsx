import { getTranslations } from "next-intl/server";
import { SessionGuard } from "@/features/staff/session-guard";
import { ServiceWorkerRegister } from "@/lib/offline/sw-register";
import { createClient } from "@/lib/supabase/server";

// Staff screens are the installable app: they register the service worker
// that keeps the last screen for offline starts (ADR-048). They also watch the
// browser's sign-in, which another tab can replace (one sign-in per browser).
export default async function StaffLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub;
  const t = await getTranslations("staffSession");
  return (
    <>
      {children}
      <ServiceWorkerRegister />
      {userId && (
        <SessionGuard
          userId={userId}
          texts={{
            otherTitle: t("otherTitle"),
            otherBody: t("otherBody", { account: "{account}" }),
            signedOutTitle: t("signedOutTitle"),
            signedOutBody: t("signedOutBody"),
            signIn: t("signIn"),
          }}
        />
      )}
    </>
  );
}
