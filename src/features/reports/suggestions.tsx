import { getTranslations } from "next-intl/server";
import { dishName } from "@/features/dashboard/model";
import { formatAmd, formatInteger } from "@/lib/format/money";
import type { Locale } from "@/i18n/routing";
import type { Upsell } from "./model";

// Suggestions: shown, accepted, share accepted, and what accepted ones sold
// (ADR-073). The note says plainly that the order link is a lower bound.
export async function Suggestions({ data, locale }: { data: Upsell; locale: Locale }) {
  const t = await getTranslations("reports.upsell");
  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  // Three figures with short labels, three across at every width: how often
  // shown, the share accepted (with the count), and what they sold.
  const rate = data.accept_rate ?? (data.shown > 0 ? data.accepted / data.shown : 0);
  const stats: [string, string][] = [
    [t("shown"), formatInteger(data.shown, locale)],
    [t("acceptedCount", { count: formatInteger(data.accepted, locale) }), pct.format(rate)],
    [t("revenue"), formatAmd(data.revenue, locale)],
  ];
  return (
    <section
      aria-labelledby="upsell-title"
      className="flex min-w-0 flex-col gap-4"
      data-testid="reports-suggestions"
    >
      <div className="border-staff-sep flex flex-col gap-1 border-b pb-3">
        <h2 id="upsell-title" className="m-0 text-heading font-semibold">
          {t("title")}
        </h2>
        <p className="text-staff-label2 m-0 max-w-prose text-label">{t("hint")}</p>
      </div>
      {data.shown === 0 ? (
        <p className="text-staff-label2 m-0 text-[1.0625rem]">{t("empty")}</p>
      ) : (
        <>
          {data.accepted === 0 ? (
            // Four zeros say less than one sentence: shown N times, nobody
            // has taken one yet.
            <p className="num text-ink m-0 text-body" data-testid="upsell-none-accepted">
              {t("noneAccepted", { shown: data.shown })}
            </p>
          ) : (
            // Figures first, labels under them, split by hairlines: three
            // across on a phone too, so no tile is left alone on a row.
            <dl className="m-0 grid max-w-[40rem] grid-cols-3">
              {stats.map(([label, value]) => (
                <div
                  key={label}
                  className="border-staff-sep flex min-w-0 flex-col-reverse justify-end gap-1 border-l px-3 first:border-l-0 first:pl-0 sm:px-5"
                >
                  <dt className="text-staff-label2 text-label leading-snug font-semibold">{label}</dt>
                  <dd className="num m-0 text-heading leading-tight font-bold break-words sm:text-large">{value}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="text-staff-label2 m-0 max-w-prose text-label">{t("note")}</p>
          {data.pairs.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="m-0 text-name font-semibold">{t("pairs")}</h3>
              <ul className="m-0 flex list-none flex-col p-0 text-body">
                {data.pairs.map((p) => (
                  <li
                    key={`${p.from}-${p.item}`}
                    className="num border-staff-sep border-b py-2.5 break-words last:border-0"
                  >
                    {t("pairRow", {
                      from: dishName(p.from_name, locale),
                      item: dishName(p.item_name, locale),
                      shown: p.shown,
                      accepted: p.accepted,
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
