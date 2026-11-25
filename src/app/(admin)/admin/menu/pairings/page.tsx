import { Info } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AdminPage, Notice } from "@/features/admin-ui/page";
import { loadPairings } from "@/features/recommendations/load.server";
import { PairingsEditor } from "@/features/recommendations/pairings-editor";
import { requireMember } from "@/lib/auth/require-member";

export default async function PairingsPage() {
  const me = await requireMember(["owner", "manager"]);
  const data = await loadPairings(me.restaurantId);
  const t = await getTranslations("recommendations");
  return (
    <AdminPage back={{ href: "/admin/menu", label: t("back") }} title={t("title")} subtitle={t("hint")} width="lg">
      {data.supported ? (
        <NextIntlClientProvider>
          <PairingsEditor
            categories={data.categories}
            dishes={data.dishes}
            pairings={data.pairings}
            matrix={data.matrix}
            timeRules={data.timeRules}
          />
        </NextIntlClientProvider>
      ) : (
        <Notice tone="info" icon={<Info aria-hidden="true" />} testId="rec-unavailable">
          {t("unavailable")}
        </Notice>
      )}
    </AdminPage>
  );
}
