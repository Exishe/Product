import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AdminPage } from "@/features/admin-ui/page";
import { loadPosAdmin } from "@/features/pos/load.server";
import { PosSettingsPanel } from "@/features/pos/pos-settings";
import { requireMember } from "@/lib/auth/require-member";
import { createClient } from "@/lib/supabase/server";

// POS connection (ADR-093): accepted orders go into the café's own POS.
export default async function PosPage() {
  const me = await requireMember(["owner", "manager"]);
  const supabase = await createClient();
  const [data, t] = await Promise.all([loadPosAdmin(supabase, me.restaurantId), getTranslations("pos")]);
  return (
    <AdminPage title={t("title")} subtitle={<p className="m-0">{t("intro")}</p>}>
      <NextIntlClientProvider>
        {data ? <PosSettingsPanel data={data} /> : null}
      </NextIntlClientProvider>
    </AdminPage>
  );
}
