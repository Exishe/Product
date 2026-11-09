import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AutoRefresh } from "@/features/menu-import/auto-refresh";
import { ImportReview } from "@/features/menu-import/import-review";
import { loadImport } from "@/features/menu-import/load.server";
import type { ReadErrorCode } from "@/features/menu-import/reader";
import { ImportSteps } from "@/features/menu-import/steps";
import { requireMember } from "@/lib/auth/require-member";

export const maxDuration = 120;

const READ_ERRORS: readonly ReadErrorCode[] = [
  "rate_limited",
  "unreadable",
  "not_a_menu",
  "provider_unavailable",
];

export default async function MenuImportReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireMember(["owner", "manager"]);
  const view = /^[0-9a-f-]{36}$/u.test(id) ? await loadImport(id, me.restaurantId) : null;
  if (!view) notFound();
  const t = await getTranslations("menuImport");

  const button = "rounded-input flex h-12 items-center px-6 font-semibold";
  let body: React.ReactNode;
  if (view.status === "needs_review" && view.draft) {
    body = (
      <NextIntlClientProvider>
        <ImportReview importId={view.id} initial={view.draft} photos={view.photos} />
      </NextIntlClientProvider>
    );
  } else if (view.status === "uploaded" || view.status === "processing") {
    body = (
      <>
        <ImportSteps current="reading" />
        <p role="status">{t("readingElsewhere")}</p>
        <AutoRefresh seconds={5} />
      </>
    );
  } else if (view.status === "failed") {
    const code = READ_ERRORS.find((c) => c === view.error) ?? "provider_unavailable";
    body = (
      <>
        <ImportSteps current="reading" />
        <p role="alert" className="rounded-chip bg-pom-tint text-pomegranate max-w-2xl px-4 py-3">
          {t(`errors.${code}`)}
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/menu/import" className={`${button} bg-tarragon text-white`}>
            {t("startOver")}
          </Link>
          <Link href="/admin/menu" className={`${button} border-tarragon text-tarragon border-2`}>
            {t("fillByHand")}
          </Link>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <p role="status">{t("errors.closed")}</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/menu" className={`${button} bg-tarragon text-white`}>
            {t("openEditor")}
          </Link>
          <Link href="/admin/menu/import" className={`${button} border-tarragon text-tarragon border-2`}>
            {t("startOver")}
          </Link>
        </div>
      </>
    );
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <h1 className="display-face text-display-38">{t("title")}</h1>
      {body}
    </main>
  );
}
