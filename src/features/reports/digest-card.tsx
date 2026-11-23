import { getTranslations } from "next-intl/server";
import type { WeeklyDigest } from "./model";

// "Last week's summary": the same rule-based message the owner gets in Telegram
// on Monday (ADR-074), so it can be read without Telegram. The text comes from
// the database in the viewer's language; it is shown as plain text.
export async function DigestCard({ digest }: { digest: WeeklyDigest }) {
  const t = await getTranslations("reports.digest");
  return (
    <section
      aria-labelledby="digest-title"
      className="flex min-w-0 flex-col gap-3 rounded-2xl bg-white p-4 sm:p-5"
      data-testid="reports-digest"
    >
      <div className="flex flex-col gap-1">
        <h2 id="digest-title" className="m-0 text-[1.25rem] leading-tight font-bold">
          {t("title")}
        </h2>
        <p className="text-staff-label2 m-0 max-w-prose text-[0.9375rem]">{t("hint")}</p>
      </div>
      <p className="m-0 max-w-prose text-[1.0625rem] leading-relaxed break-words whitespace-pre-line">
        {digest.text}
      </p>
    </section>
  );
}
