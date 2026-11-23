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
  const stats: [string, string, string?][] = [
    [t("shown"), formatInteger(data.shown, locale)],
    [t("accepted"), formatInteger(data.accepted, locale)],
    [t("rate"), data.accept_rate === null ? "–" : pct.format(data.accept_rate), t("rateHint")],
    [t("orders"), formatInteger(data.orders_with_suggestion, locale)],
    [t("revenue"), formatAmd(data.revenue, locale)],
  ];
  return (
    <section
      aria-labelledby="upsell-title"
      className="flex min-w-0 flex-col gap-3 rounded-2xl bg-white p-4 sm:p-5"
      data-testid="reports-suggestions"
    >
      <div className="flex flex-col gap-1">
        <h2 id="upsell-title" className="m-0 text-[1.25rem] leading-tight font-bold">
          {t("title")}
        </h2>
        <p className="text-staff-label2 m-0 max-w-prose text-[0.9375rem]">{t("hint")}</p>
      </div>
      {data.shown === 0 ? (
        <p className="text-staff-label2 m-0 text-[1.0625rem]">{t("empty")}</p>
      ) : (
        <>
          <dl className="m-0 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {stats.map(([label, value, hint]) => (
              <div key={label} className="bg-staff-fill flex min-w-0 flex-col gap-0.5 rounded-xl p-3">
                <dt className="text-staff-label2 text-[0.8125rem] font-semibold">{label}</dt>
                <dd className="num m-0 text-[1.375rem] leading-tight font-bold break-words">{value}</dd>
                {hint && <dd className="text-staff-label2 m-0 text-[0.8125rem]">{hint}</dd>}
              </div>
            ))}
          </dl>
          <p className="text-staff-label2 m-0 max-w-prose text-[0.9375rem]">{t("note")}</p>
          {data.pairs.length > 0 && (
            <div className="flex flex-col gap-1">
              <h3 className="m-0 text-[1.0625rem] font-bold">{t("pairs")}</h3>
              <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[0.9375rem]">
                {data.pairs.map((p) => (
                  <li key={`${p.from}-${p.item}`} className="num break-words">
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
