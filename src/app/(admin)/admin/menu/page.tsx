import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { loadMenuEditor } from "@/features/menu/load.server";
import { MenuEditor } from "@/features/menu/menu-editor";
import { requireMember } from "@/lib/auth/require-member";

export default async function MenuPage() {
  const me = await requireMember(["owner", "manager"]);
  const data = await loadMenuEditor(me.restaurantId);
  const t = await getTranslations("menu");
  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="display-face text-display-38">{t("title")}</h1>
      <NextIntlClientProvider>
        <MenuEditor data={data} />
      </NextIntlClientProvider>
    </main>
  );
}
