import { getTranslations } from "next-intl/server";
import { requireMember } from "@/lib/auth/require-member";

// The floor map comes in milestone 7.
export default async function WaiterPage() {
  await requireMember(["waiter", "owner", "manager"], { deviceScreen: true });
  const t = await getTranslations("waiter");
  return (
    <main className="mx-auto max-w-5xl px-6 py-6">
      <h1 className="text-3xl font-semibold">{t("title")}</h1>
    </main>
  );
}
