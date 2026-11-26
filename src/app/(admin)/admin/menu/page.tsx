import { Lightbulb, ScanText, SlidersHorizontal } from "lucide-react";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AdminPage, Section, SettingsItem, SettingsList } from "@/features/admin-ui/page";
import { MoreMenu } from "@/features/admin-ui/more-menu";
import { loadMenuEditor } from "@/features/menu/load.server";
import { MenuEditor } from "@/features/menu/menu-editor";
import { OutIngredientSetting } from "@/features/menu/out-ingredient-setting";
import { requireMember } from "@/lib/auth/require-member";

// The sections and dishes come first (ADR-093). The rarely used pages sit
// behind "More", and the café-wide, set-once rule for a dish whose ingredient
// ran out is a closed setting at the bottom, where a stray tap can't change it.
export default async function MenuPage() {
  const me = await requireMember(["owner", "manager"]);
  const data = await loadMenuEditor(me.restaurantId, me.role === "owner");
  const [t, ti] = await Promise.all([getTranslations("menu"), getTranslations("menu.ingredients")]);
  return (
    <AdminPage
      title={t("title")}
      width="xl"
      actions={
        data.categories.length > 0 && (
          <MoreMenu
            label={t("more")}
            testId="menu-more"
            items={[
              { href: "/admin/menu/import", label: t("importPhoto"), icon: <ScanText aria-hidden="true" /> },
              { href: "/admin/menu/pairings", label: t("managePairings"), icon: <Lightbulb aria-hidden="true" /> },
              { href: "/admin/menu/options", label: t("manageOptions"), icon: <SlidersHorizontal aria-hidden="true" /> },
            ]}
          />
        )
      }
    >
      <NextIntlClientProvider>
        <MenuEditor data={data} />
        {data.ingredientsSupported && (
          <Section title={t("settingsTitle")} id="menu-settings-title" bare>
            <SettingsList>
              <SettingsItem
                title={ti("displayTitle")}
                value={data.outIngredientDisplay === "hide" ? ti("displayHide") : ti("displaySoldOut")}
                testId="menu-settings"
              >
                <OutIngredientSetting initial={data.outIngredientDisplay} />
              </SettingsItem>
            </SettingsList>
          </Section>
        )}
      </NextIntlClientProvider>
    </AdminPage>
  );
}
