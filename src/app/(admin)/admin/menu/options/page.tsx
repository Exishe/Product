import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { loadMenuEditor } from "@/features/menu/load.server";
import { OptionGroupsEditor } from "@/features/menu/option-groups-editor";
import { requireMember } from "@/lib/auth/require-member";

export default async function OptionsPage() {
  const me = await requireMember(["owner", "manager"]);
  const data = await loadMenuEditor(me.restaurantId);
  const t = await getTranslations("optionGroups");
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 sm:px-6">
      <Link href="/admin/menu" className="self-start text-tarragon underline underline-offset-4">
        {t("back")}
      </Link>
      <h1 className="display-face text-display-38">{t("title")}</h1>
      <p className="max-w-prose text-muted">{t("hint")}</p>
      <NextIntlClientProvider>
        <OptionGroupsEditor groups={data.groups} />
      </NextIntlClientProvider>
    </main>
  );
}
