import { clsx } from "clsx";
import { ChevronDown } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { textAction } from "@/features/admin-ui/styles";
import { formatInteger } from "@/lib/format/money";
import type { Locale } from "@/i18n/routing";
import { dishName, dishNameLocale } from "@/features/dashboard/model";
import type { Conversion } from "./model";

type T = Awaited<ReturnType<typeof getTranslations<"reports.conversion">>>;
type Item = Conversion["items"][number];

const PHONE_ROWS = 8;

// "Viewed but not ordered" (ADR-073): one accessible table per group. The
// flagged dishes come first in their own highlighted block; the reason is a
// data key from the database, turned into a sentence here.
export async function ConversionTable({ data, locale }: { data: Conversion; locale: Locale }) {
  const t = await getTranslations("reports.conversion");
  const flagged = data.items.filter((i) => i.flagged);
  const others = data.items.filter((i) => !i.flagged);
  const pct = new Intl.NumberFormat(locale, { style: "percent", maximumFractionDigits: 0 });
  // A share column of nothing but dashes says nothing: it is left out (the
  // footnote under the table still says why), in both tables alike.
  const showShare = data.items.some((i) => shareOf(i, pct) !== "–");

  return (
    <section
      aria-labelledby="conv-title"
      className="flex min-w-0 flex-col gap-4"
      data-testid="reports-conversion"
    >
      <div className="border-staff-sep flex flex-col gap-1 border-b pb-3">
        <h2 id="conv-title" className="m-0 text-heading font-semibold">
          {t("title")}
        </h2>
        <p className="text-staff-label2 m-0 max-w-prose text-label">{t("hint")}</p>
        {data.median !== null && (
          <p className="text-staff-label2 m-0 text-label">
            {t("median", { share: pct.format(data.median) })}
          </p>
        )}
      </div>
      {data.items.length === 0 ? (
        <p className="text-staff-label2 m-0 text-[1.0625rem]">{t("empty")}</p>
      ) : (
        <>
          {flagged.length > 0 && (
            <div
              className="flex flex-col gap-2"
              data-testid="conversion-flagged"
            >
              <div>
                <h3 className="m-0 flex items-center gap-2 text-name font-semibold">
                  <span aria-hidden="true" className="bg-amber-text inline-block size-2.5 shrink-0 rounded-full" />
                  {t("flaggedTitle")}
                </h3>
                <p className="text-staff-label2 m-0 text-label">{t("flaggedHint", { min: data.min_views })}</p>
              </div>
              <Rows items={flagged} locale={locale} t={t} pct={pct} caption={t("flaggedTitle")} showShare={showShare} highlight />
            </div>
          )}
          {others.length > 0 && (
            <div className="flex flex-col gap-2">
              {flagged.length > 0 && <h3 className="m-0 text-name font-semibold">{t("othersTitle")}</h3>}
              <Rows items={others} locale={locale} t={t} pct={pct} caption={t("caption")} showShare={showShare} />
              {others.some((i) => i.reason.key === "few_views") && (
                <p className="text-staff-label2 m-0 text-label max-sm:hidden">
                  {t(showShare ? "fewViewsNote" : "shareLaterNote")}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

// The share as shown: a dash while it is too early to judge.
const shareOf = (i: Item, pct: Intl.NumberFormat) =>
  i.conversion === null || i.reason.key === "few_views" ? "–" : pct.format(i.conversion);

function Rows({
  items,
  locale,
  t,
  pct,
  caption,
  showShare,
  highlight,
}: {
  items: Item[];
  locale: Locale;
  t: T;
  pct: Intl.NumberFormat;
  caption: string;
  showShare: boolean;
  highlight?: boolean;
}) {
  const head =
    "text-staff-label2 px-2 py-2 text-right text-label font-semibold whitespace-nowrap first:pl-0 last:pr-0";
  const share = (i: Item) => shareOf(i, pct);
  const reason = (i: Item) =>
    (i.reason.key === "never_ordered" || i.reason.key === "low_share") &&
    t(`reason.${i.reason.key}`, { views: i.reason.views, orders: i.reason.orders });
  return (
    <>
      {/* Phones: one hairline row per dish, the name at full width and the
          figures in one meta line, so no column is cut mid-word. The first
          eight show; the rest open in place. A share too early to judge is
          left out rather than drawn as a bare dash. */}
      <ul
        className="num m-0 flex list-none flex-col p-0 sm:hidden [&>li:first-child]:border-t-0 [&>li:first-child]:pt-0"
        aria-label={caption}
      >
        {items.slice(0, PHONE_ROWS).map((i) => (
          <PhoneRow key={i.id} i={i} locale={locale} t={t} share={share(i)} reason={reason(i)} />
        ))}
      </ul>
      {items.length > PHONE_ROWS && (
        <details className="group sm:hidden">
          <summary
            className={textAction("ink", "-ml-2 w-fit list-none group-open:hidden [&::-webkit-details-marker]:hidden")}
          >
            {t("showAll", { count: items.length })}
            <ChevronDown aria-hidden="true" />
          </summary>
          <ul className="num m-0 flex list-none flex-col p-0" aria-label={caption}>
            {items.slice(PHONE_ROWS).map((i) => (
              <PhoneRow key={i.id} i={i} locale={locale} t={t} share={share(i)} reason={reason(i)} />
            ))}
          </ul>
        </details>
      )}
    <div className="relative overflow-x-auto max-sm:hidden">
      <table className="num w-full min-w-[20rem] border-collapse text-label">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            <th scope="col" className={clsx(head, "!text-left")}>
              {t("colDish")}
            </th>
            <th scope="col" className={head}>
              {t("colViews")}
            </th>
            <th scope="col" className={head}>
              {t("colAdded")}
            </th>
            <th scope="col" className={head}>
              {t("colOrdered")}
            </th>
            {showShare && (
              <th scope="col" className={head}>
                {t("colShare")}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr
              key={i.id}
              className={clsx("border-staff-sep border-t align-top", highlight && "border-black/10")}
            >
              <th scope="row" className="py-2.5 pr-2 text-left font-semibold">
                <span className="break-words" lang={dishNameLocale(i.name, locale)}>
                  {dishName(i.name, locale)}
                </span>
                {reason(i) && (
                  <span className="text-staff-label2 mt-0.5 block text-label font-normal break-words">
                    {reason(i)}
                  </span>
                )}
              </th>
              <td className="px-2 py-2.5 text-right">{formatInteger(i.views, locale)}</td>
              <td className="px-2 py-2.5 text-right">{formatInteger(i.adds, locale)}</td>
              <td className="px-2 py-2.5 text-right">{formatInteger(i.orders, locale)}</td>
              {showShare && <td className="py-2.5 pl-2 text-right">{share(i)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}

function PhoneRow({
  i,
  locale,
  t,
  share,
  reason,
}: {
  i: Item;
  locale: Locale;
  t: T;
  share: string;
  reason: string | false;
}) {
  return (
    <li className="border-staff-sep flex flex-col gap-0.5 border-t py-3">
      <span className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 text-name font-semibold break-words" lang={dishNameLocale(i.name, locale)}>
          {dishName(i.name, locale)}
        </span>
        {share !== "–" && (
          <span className="shrink-0 text-name font-semibold" aria-label={`${t("colShare")}: ${share}`}>
            {share}
          </span>
        )}
      </span>
      <span className="text-staff-label2 text-label">
        {t("metaLine", {
          views: formatInteger(i.views, locale),
          adds: formatInteger(i.adds, locale),
          orders: formatInteger(i.orders, locale),
        })}
      </span>
      {reason && <span className="text-staff-label2 text-label break-words">{reason}</span>}
    </li>
  );
}
