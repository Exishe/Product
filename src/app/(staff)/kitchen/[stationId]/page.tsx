import { getTranslations } from "next-intl/server";
import { requireMember } from "@/lib/auth/require-member";

// The board itself comes in milestone 6; this proves pairing and access.
export default async function KitchenPage() {
  await requireMember(["kitchen", "owner", "manager"], { deviceScreen: true });
  const t = await getTranslations("kitchen");
  return (
    <main className="min-h-dvh bg-basalt px-6 py-6 text-slip">
      <h1 className="text-3xl font-bold">{t("title")}</h1>
    </main>
  );
}
