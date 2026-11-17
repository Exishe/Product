import { NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { CircleAlert, Clock } from "lucide-react";
import Link from "next/link";
import { AdminPage, Notice } from "@/features/admin-ui/page";
import { button } from "@/features/admin-ui/styles";
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
        <Notice tone="info" role="status" icon={<Clock aria-hidden="true" />}>
          <p className="m-0">{t("readingElsewhere")}</p>
        </Notice>
        <AutoRefresh seconds={5} />
      </>
    );
  } else if (view.status === "failed") {
    const code = READ_ERRORS.find((c) => c === view.error) ?? "provider_unavailable";
    body = (
      <>
        <ImportSteps current="reading" />
        <Notice tone="alert" role="alert" icon={<CircleAlert aria-hidden="true" />} className="max-w-2xl">
          <p className="m-0">{t(`errors.${code}`)}</p>
        </Notice>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/menu/import" className={button("primary")}>
            {t("startOver")}
          </Link>
          <Link href="/admin/menu" className={button("secondary")}>
            {t("fillByHand")}
          </Link>
        </div>
      </>
    );
  } else {
    body = (
      <>
        <Notice tone="info" role="status" icon={<CircleAlert aria-hidden="true" />}>
          <p className="m-0">{t("errors.closed")}</p>
        </Notice>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/menu" className={button("primary")}>
            {t("openEditor")}
          </Link>
          <Link href="/admin/menu/import" className={button("secondary")}>
            {t("startOver")}
          </Link>
        </div>
      </>
    );
  }

  return (
    <AdminPage title={t("title")} width="xl">
      {body}
    </AdminPage>
  );
}
