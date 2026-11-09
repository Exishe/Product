import { getTranslations } from "next-intl/server";
import { EXPORT_KINDS } from "@/features/export/load.server";
import { requireMember } from "@/lib/auth/require-member";

export default async function ExportPage() {
  await requireMember(["owner", "manager"]);
  const t = await getTranslations("billing.export");
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-col gap-2">
        <h1 className="display-face text-display-38 leading-tight">{t("title")}</h1>
        <p className="text-muted max-w-prose">{t("intro")}</p>
      </div>
      <ul className="flex flex-col gap-3">
        {EXPORT_KINDS.map((kind) => (
          <li
            key={kind}
            className="rounded-sheet border-line flex flex-wrap items-center justify-between gap-3 border bg-white p-4"
          >
            <div className="flex min-w-0 flex-col">
              <span className="text-lg font-semibold">{t(kind)}</span>
              <span className="text-muted text-sm">{t(`${kind}Hint`)}</span>
            </div>
            {/* A plain link: the browser downloads the file, no client JS. */}
            <a
              href={`/admin/export/${kind}`}
              download
              data-testid={`export-${kind}`}
              className="rounded-input bg-apricot text-ink inline-flex min-h-12 items-center px-5 font-semibold"
            >
              {t("download")}
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
