import { clsx } from "clsx";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { chip, group, groupHead, sectionTitle } from "@/features/admin-ui/styles";
import { formatAmd, formatInteger } from "@/lib/format/money";
import type { Locale } from "@/i18n/routing";
import { HourlyChart } from "./hourly-chart";
import {
  chartHours,
  deltaPercent,
  dishName,
  dishNameLocale,
  sharePercent,
  toMinutes,
  type Dashboard,
  type Dish,
} from "./model";

type T = Awaited<ReturnType<typeof getTranslations<"dashboard">>>;

// Owners ask for these first (screens.md, 13): revenue, average bill, orders,
// then the best and the weakest dishes. Everything else follows. The figures
// sit flat on the page, split by hairlines (ADR-093): no filled card.
export async function SalesDashboard({ data, locale }: { data: Dashboard; locale: Locale }) {
  const t = await getTranslations("dashboard");
  const money = (n: number) => formatAmd(n, locale);
  const oneDay = data.from === data.to;
  const compareLabel = oneDay
    ? t(data.partial ? "compareToday" : "compareDay")
    : t("compareRange", { weeks: data.shift_days / 7 });
  const s = data.summary;
  const c = data.compare;
  const hours = chartHours(data.hourly);
  const qrPct = sharePercent(s.qr_orders, s.orders);

  return (
    <div className="flex flex-col gap-12">
      <section
        className="border-staff-sep grid grid-cols-1 gap-y-5 border-t pt-5 sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-4 lg:gap-x-0"
        aria-label={t("title")}
      >
        <Kpi testId="kpi-revenue" label={t("revenue")} value={money(s.revenue)}>
          <Delta t={t} now={s.revenue} before={c.revenue} label={compareLabel} />
        </Kpi>
        <Kpi
          testId="kpi-avg-bill"
          label={t("avgBill")}
          value={money(s.avg_bill)}
          hint={t("bills", { count: s.bills })}
        >
          <Delta t={t} now={s.avg_bill} before={c.avg_bill} label={compareLabel} />
        </Kpi>
        <Kpi
          testId="kpi-orders"
          label={t("orders")}
          value={formatInteger(s.orders, locale)}
          hint={t("ordersSplit", { qr: s.qr_orders, waiter: s.waiter_orders })}
        >
          <Delta t={t} now={s.orders} before={c.orders} label={compareLabel} />
        </Kpi>
        <Kpi
          testId="kpi-open-tables"
          label={t("openTables")}
          value={t("openTablesValue", {
            count: data.open_tables.count,
            total: money(data.open_tables.total),
          })}
          hint={t("openTablesHint")}
          small
        />
      </section>

      <div className="grid gap-10 md:grid-cols-2 md:gap-8">
        <DishList
          testId="best-dishes"
          title={t("best")}
          hint={t("bestHint")}
          dishes={data.top_dishes}
          locale={locale}
          t={t}
        />
        <DishList
          testId="weak-dishes"
          title={t("weak")}
          hint={t("weakHint")}
          dishes={data.weak_dishes}
          locale={locale}
          t={t}
        />
      </div>

      {hours.length > 0 && (
        <Card>
          <HourlyChart
            rows={hours}
            text={{
              title: t("hourly"),
              seriesNow: t(oneDay ? (data.partial ? "seriesToday" : "seriesNow") : "seriesNow"),
              seriesBefore: t(oneDay ? "seriesBefore" : "seriesBeforeRange"),
              tip: (r, from, to) =>
                t(oneDay ? "hourTip" : "hourTipRange", { from, to, now: r.orders, before: r.compare_orders }),
              showTable: t("showTable"),
              colHour: t("colHour"),
              colNow: t("colNow"),
              colBefore: t("colBefore"),
            }}
          />
        </Card>
      )}

      <div className="grid gap-10 lg:grid-cols-3 lg:gap-8">
        <Card testId="sources">
          <GroupHead title={t("sources")} />
          <ShareRow label={t("qr")} count={s.qr_orders} pct={qrPct} tone="bg-ink" locale={locale} />
          <ShareRow
            label={t("waiter")}
            count={s.waiter_orders}
            pct={qrPct === null ? null : sharePercent(s.waiter_orders, s.orders)}
            tone="bg-staff-label2"
            locale={locale}
          />
        </Card>

        <Card testId="kitchen-time">
          <GroupHead title={t("kitchen")} hint={t("kitchenHint")} />
          {data.kitchen.length === 0 ? (
            <p className="text-staff-label2 m-0">{t("noKitchen")}</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {data.kitchen.map((k) => (
                <li
                  key={k.station}
                  className="border-staff-sep flex flex-col border-t pt-2 first:border-0 first:pt-0"
                >
                  <span className="font-semibold break-words">
                    {k.is_default && k.station === "Kitchen" ? t("defaultStation") : k.station}
                  </span>
                  <span className="num">{t("kitchenAvg", { minutes: toMinutes(k.avg_seconds) })}</span>
                  <span
                    className={`num text-[0.9375rem] ${k.over_limit > 0 ? "text-pomegranate font-semibold" : "text-staff-label2"}`}
                  >
                    {t("kitchenOver", { over: k.over_limit, tickets: k.tickets })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card testId="cancellations">
          <GroupHead title={t("cancellations")} />
          {data.cancellations.items === 0 && data.cancellations.rejected_orders === 0 ? (
            <p className="text-staff-label2 m-0">{t("noCancellations")}</p>
          ) : (
            <>
              <p className="num m-0">{t("cancelledItems", { count: data.cancellations.items })}</p>
              <p className="num m-0">{t("rejectedOrders", { count: data.cancellations.rejected_orders })}</p>
              {data.cancellations.reasons.length > 0 && (
                <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[0.9375rem]">
                  {data.cancellations.reasons.map((r) => (
                    <li key={r.reason} className="border-staff-sep flex justify-between gap-3 border-t pt-1">
                      <span className="min-w-0 break-words">{r.reason}</span>
                      <span className="num text-staff-label2 shrink-0">{r.count}</span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

// A group on the page (ADR-093): a 20 px heading and a hairline, no box.
function Card({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <section data-testid={testId} className={group}>
      {children}
    </section>
  );
}

function GroupHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className={groupHead}>
      <h2 className={sectionTitle}>{title}</h2>
      {hint && <p className="text-staff-label2 m-0 text-label">{hint}</p>}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  small,
  testId,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  small?: boolean;
  testId: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className="border-staff-sep flex min-w-0 flex-col gap-1 lg:border-l lg:px-6 lg:first:border-l-0 lg:first:pl-0"
    >
      <span className="text-staff-label2 text-label font-semibold">{label}</span>
      <span
        data-testid={`${testId}-value`}
        className={clsx(
          "num leading-tight font-bold break-words",
          small ? "text-headline" : "text-large xl:text-figure xl:tracking-[-0.01em]",
        )}
      >
        {value}
      </span>
      {hint && <span className="text-staff-label2 text-label">{hint}</span>}
      {children}
    </div>
  );
}

function Delta({
  t,
  now,
  before,
  label,
}: {
  t: T;
  now: number;
  before: number;
  label: string;
}) {
  const muted = "text-staff-label2";
  const pct = deltaPercent(now, before);
  if (pct === null) return <span className={`${muted} text-[0.9375rem]`}>{t("noCompare")}</span>;
  // The word (↑ 12 %), an icon and the colour together, never colour alone.
  const [text, tone, Icon] =
    pct > 0
      ? [t("deltaUp", { pct }), chip.ok, TrendingUp]
      : pct < 0
        ? [t("deltaDown", { pct: Math.abs(pct) }), chip.alert, TrendingDown]
        : [t("deltaSame"), chip.plain, Minus];
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-label">
      <span className={clsx(chip.base, tone, "num")}>
        <Icon aria-hidden="true" />
        {text}
      </span>
      <span className={muted}>{label}</span>
    </span>
  );
}

function DishList({
  title,
  hint,
  dishes,
  locale,
  t,
  testId,
}: {
  title: string;
  hint: string;
  dishes: readonly Dish[];
  locale: Locale;
  t: T;
  testId: string;
}) {
  return (
    <Card testId={testId}>
      <GroupHead title={title} hint={hint} />
      <ol className="m-0 flex list-none flex-col p-0">
        {dishes.map((d, i) => (
          <li key={i} className="border-staff-sep flex items-center gap-3 border-t py-2.5 first:border-0">
            <span className="num bg-staff-fill text-staff-label2 grid size-7 shrink-0 place-items-center rounded-full text-[0.8125rem] font-bold">
              {i + 1}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold break-words" lang={dishNameLocale(d.name, locale)}>
                {dishName(d.name, locale)}
              </span>
              <span className="num text-staff-label2 text-[0.9375rem]">{t("sold", { count: d.qty })}</span>
            </span>
            <span className="num shrink-0 text-right font-semibold">{formatAmd(d.revenue, locale)}</span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function ShareRow({
  label,
  count,
  pct,
  tone,
  locale,
}: {
  label: string;
  count: number;
  pct: number | null;
  tone: string;
  locale: Locale;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-semibold">{label}</span>
        <span className="num">
          {formatInteger(count, locale)}
          {pct !== null && <span className="text-staff-label2"> · {pct}%</span>}
        </span>
      </div>
      <div className="bg-staff-fill h-2 overflow-hidden rounded-full">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct ?? 0}%` }} />
      </div>
    </div>
  );
}
