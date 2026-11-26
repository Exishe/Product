import { getTranslations } from "next-intl/server";
import type { WeeklyDigest } from "./model";

// "Last week's summary": the same rule-based message the owner gets in Telegram
// on Monday (ADR-074), so it can be read without Telegram. The text comes from
// the database in the viewer's language; it is shown as plain text.
// The Telegram message opens with a pictograph; the admin shows no emoji
// (ADR-094), so it is dropped from the start of the text and of each line.
export function plainText(text: string): string {
  return text.replace(/^[ \t]*(?:\p{Extended_Pictographic}\uFE0F?[ \t]*)+/gmu, "");
}

export async function DigestCard({ digest }: { digest: WeeklyDigest }) {
  const t = await getTranslations("reports.digest");
  // The first line names the week ("Weekly summary: 16.11–22.11"): a small
  // heading, so the body reads under it instead of as one block.
  const [head, ...rest] = plainText(digest.text).trim().split("\n");
  const body = rest.join("\n").trim();
  return (
    <section
      aria-labelledby="digest-title"
      className="flex min-w-0 flex-col gap-4"
      data-testid="reports-digest"
    >
      <div className="border-staff-sep flex flex-col gap-1 border-b pb-3">
        <h2 id="digest-title" className="m-0 text-heading font-semibold">
          {t("title")}
        </h2>
        <p className="text-staff-label2 m-0 max-w-prose text-label">{t("hint")}</p>
      </div>
      <div className="flex max-w-prose flex-col gap-1.5">
        <h3 className="m-0 text-name font-semibold break-words">{head}</h3>
        {body && <p className="m-0 text-name leading-relaxed break-words whitespace-pre-line">{body}</p>}
      </div>
    </section>
  );
}
