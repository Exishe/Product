import { getTranslations } from "next-intl/server";
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

// Owners ask for these first (screens.md, 13): average bill, revenue, orders,
// then the best and the weakest dishes. Everything else follows.
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
    <div className="flex flex-col gap-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={t("title")}>
        <Kpi
          testId="kpi-avg-bill"
          hero
          label={t("avgBill")}
          value={money(s.avg_bill)}
          hint={t("bills", { count: s.bills })}
        >
          <Delta t={t} now={s.avg_bill} before={c.avg_bill} label={compareLabel} />
        </Kpi>
        <Kpi testId="kpi-revenue" label={t("revenue")} value={money(s.revenue)}>
          <Delta t={t} now={s.revenue} before={c.revenue} label={compareLabel} />
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

      <div className="grid gap-3 md:grid-cols-2">
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

      <div className="grid gap-3 lg:grid-cols-3">
        <Card testId="sources">
          <h2 className="text-xl font-semibold">{t("sources")}</h2>
          <ShareRow label={t("qr")} count={s.qr_orders} pct={qrPct} tone="bg-tarragon" locale={locale} />
          <ShareRow
            label={t("waiter")}
            count={s.waiter_orders}
            pct={qrPct === null ? null : sharePercent(s.waiter_orders, s.orders)}
            tone="bg-line-strong"
            locale={locale}
          />
        </Card>

        <Card testId="kitchen-time">
          <div>
            <h2 className="text-xl font-semibold">{t("kitchen")}</h2>
            <p className="text-muted text-sm">{t("kitchenHint")}</p>
          </div>
          {data.kitchen.length === 0 ? (
            <p className="text-muted">{t("noKitchen")}</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {data.kitchen.map((k) => (
                <li
                  key={k.station}
                  className="border-line flex flex-col border-t pt-2 first:border-0 first:pt-0"
                >
                  <span className="font-semibold break-words">
                    {k.is_default && k.station === "Kitchen" ? t("defaultStation") : k.station}
                  </span>
                  <span className="num">{t("kitchenAvg", { minutes: toMinutes(k.avg_seconds) })}</span>
                  <span
                    className={`num text-sm ${k.over_limit > 0 ? "text-pomegranate font-semibold" : "text-muted"}`}
                  >
                    {t("kitchenOver", { over: k.over_limit, tickets: k.tickets })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card testId="cancellations">
          <h2 className="text-xl font-semibold">{t("cancellations")}</h2>
          {data.cancellations.items === 0 && data.cancellations.rejected_orders === 0 ? (
            <p className="text-muted">{t("noCancellations")}</p>
          ) : (
            <>
              <p className="num">{t("cancelledItems", { count: data.cancellations.items })}</p>
              <p className="num">{t("rejectedOrders", { count: data.cancellations.rejected_orders })}</p>
              {data.cancellations.reasons.length > 0 && (
                <ul className="flex flex-col gap-1 text-sm">
                  {data.cancellations.reasons.map((r) => (
                    <li key={r.reason} className="border-line flex justify-between gap-3 border-t pt-1">
                      <span className="min-w-0 break-words">{r.reason}</span>
                      <span className="num text-muted shrink-0">{r.count}</span>
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

function Card({ children, testId }: { children: React.ReactNode; testId?: string }) {
  return (
    <section
      data-testid={testId}
      className="rounded-sheet border-line flex min-w-0 flex-col gap-3 border bg-white p-4 sm:p-5"
    >
      {children}
    </section>
  );
}

function Kpi({
  label,
  value,
  hint,
  hero,
  small,
  testId,
  children,
}: {
  label: string;
  value: string;
  hint?: string;
  hero?: boolean;
  small?: boolean;
  testId: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className={`rounded-sheet flex min-w-0 flex-col gap-1 border p-4 ${hero ? "border-tarragon bg-tarragon-tint" : "border-line bg-white"}`}
    >
      <span className={`font-semibold ${hero ? "text-tarragon" : "text-muted"}`}>{label}</span>
      <span
        data-testid={`${testId}-value`}
        className={`num leading-tight font-bold break-words ${small ? "text-2xl" : hero ? "display-face text-[2.75rem]" : "text-[2rem]"}`}
      >
        {value}
      </span>
      {hint && <span className="text-muted text-sm">{hint}</span>}
      {children}
    </div>
  );
}

function Delta({ t, now, before, label }: { t: T; now: number; before: number; label: string }) {
  const pct = deltaPercent(now, before);
  if (pct === null) return <span className="text-muted text-sm">{t("noCompare")}</span>;
  const [text, tone] =
    pct > 0
      ? [t("deltaUp", { pct }), "text-tarragon"]
      : pct < 0
        ? [t("deltaDown", { pct: Math.abs(pct) }), "text-pomegranate"]
        : [t("deltaSame"), "text-muted"];
  return (
    <span className="text-sm">
      <span className={`num font-semibold ${tone}`}>{text}</span> <span className="text-muted">{label}</span>
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
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <p className="text-muted text-sm">{hint}</p>
      </div>
      <ol className="flex flex-col">
        {dishes.map((d, i) => (
          <li key={i} className="border-line flex items-baseline gap-3 border-t py-2 first:border-0">
            <span className="num text-muted w-5 shrink-0 text-right">{i + 1}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold break-words" lang={dishNameLocale(d.name, locale)}>
                {dishName(d.name, locale)}
              </span>
              <span className="num text-muted text-sm">{t("sold", { count: d.qty })}</span>
            </span>
            <span className="num shrink-0 text-right">{formatAmd(d.revenue, locale)}</span>
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
          {pct !== null && <span className="text-muted"> · {pct}%</span>}
        </span>
      </div>
      <div className="bg-mist h-2 overflow-hidden rounded-full">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct ?? 0}%` }} />
      </div>
    </div>
  );
}
