import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AdminPage } from "@/features/admin-ui/page";
import { loadMenuEditor } from "@/features/menu/load.server";
import { OptionGroupsEditor } from "@/features/menu/option-groups-editor";
import { requireMember } from "@/lib/auth/require-member";

export default async function OptionsPage() {
  const me = await requireMember(["owner", "manager"]);
  const data = await loadMenuEditor(me.restaurantId);
  const t = await getTranslations("optionGroups");
  return (
    <AdminPage
      back={{ href: "/admin/menu", label: t("back") }}
      title={t("title")}
      subtitle={t("hint")}
      width="lg"
    >
      <NextIntlClientProvider>
        <OptionGroupsEditor groups={data.groups} />
      </NextIntlClientProvider>
    </AdminPage>
  );
}
