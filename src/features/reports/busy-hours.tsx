import { clsx } from "clsx";
import { FadeScroll } from "@/features/admin-ui/fade-scroll";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { formatAmd } from "@/lib/format/money";
import type { Locale } from "@/i18n/routing";
import { busyGrid, heatLevel, splitMinutes, type Busy, type Metric } from "./model";

const pad = (h: number) => `${String(h % 24).padStart(2, "0")}:00`;
const LEVEL = ["bg-staff-fill", "bg-ink/15", "bg-ink/35", "bg-ink/60", "bg-ink"] as const;

function weekdays(locale: Locale): string[] {
  const f = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" });
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2024, 0, 1 + i))));
}

// Busy and dead hours (ADR-073): the weekday × hour grid with an orders or
// revenue switch (two links, no JavaScript), and how long tables stay.
export async function BusyHours({
  busy,
  metric,
  hrefFor,
  locale,
}: {
  busy: Busy;
  metric: Metric;
  hrefFor: (m: Metric) => string;
  locale: Locale;
}) {
  const [t, tt] = await Promise.all([getTranslations("reports.busy"), getTranslations("reports.busy.table")]);
  const grid = busyGrid(busy, metric);
  const days = weekdays(locale);
  const num = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const show = (v: number) => (metric === "revenue" ? formatAmd(Math.round(v), locale) : num.format(v));
  const span = (dow: number, hour: number) => ({
    day: days[dow - 1] ?? "",
    from: pad(hour),
    to: pad(hour + 1),
  });
  const duration = (minutes: number) => {
    const { hours, minutes: m } = splitMinutes(minutes);
    return hours > 0 ? tt("duration", { hours, minutes: m }) : tt("durationMin", { minutes: m });
  };

  return (
    <section
      aria-labelledby="busy-title"
      className="flex min-w-0 flex-col gap-4"
      data-testid="reports-busy"
    >
      <div className="border-staff-sep flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b pb-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id="busy-title" className="m-0 text-heading font-semibold">
            {t("title")}
          </h2>
          <p className="text-staff-label2 m-0 max-w-prose text-label">
            {t(metric === "orders" ? "hintOrders" : "hintRevenue")}
          </p>
        </div>
        <nav aria-label={t("metricLabel")}>
          <ul className="bg-staff-fill m-0 flex list-none gap-1 rounded-xl p-1">
            {(["orders", "revenue"] as const).map((m) => (
              <li key={m}>
                <Link
                  href={hrefFor(m)}
                  aria-current={m === metric ? "page" : undefined}
                  className={clsx(
                    "flex min-h-11 items-center rounded-[0.625rem] px-4 text-[0.9375rem] font-semibold",
                    m === metric ? "text-ink bg-white shadow-sm" : "text-staff-label2",
                  )}
                >
                  {t(m)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {grid.hours.length === 0 || grid.max === 0 ? (
        <p className="text-staff-label2 m-0 text-[1.0625rem]">
          {t(metric === "orders" ? "emptyOrders" : "emptyRevenue")}
        </p>
      ) : (
        <>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[1.0625rem]">
            {grid.busiest && (
              <li data-testid="busy-busiest">
                {t("busiest", {
                  ...span(grid.busiest.dow, grid.busiest.hour),
                  value: show(grid.busiest.value),
                })}
              </li>
            )}
            {/* A quietest hour of "about 0" says nothing: then it is left out. */}
            {grid.quietest && show(grid.quietest.value) !== show(0) && (
              <li className="text-staff-label2">
                {t("quietest", {
                  ...span(grid.quietest.dow, grid.quietest.hour),
                  value: show(grid.quietest.value),
                })}
              </li>
            )}
          </ul>
          {/* On a phone the grid scrolls sideways; the right edge fades while
              more hours are hidden there. */}
          <FadeScroll className="relative -mx-1 overflow-x-auto px-1 pb-1">
            <table className="num w-full border-separate border-spacing-[3px] text-meta">
              <caption className="sr-only">{t(metric === "orders" ? "hintOrders" : "hintRevenue")}</caption>
              <thead>
                <tr>
                  <th scope="col" className="sr-only">
                    {t("colDay")}
                  </th>
                  {grid.hours.map((h, i) => (
                    <th
                      key={h}
                      scope="col"
                      className="text-staff-label2 min-w-5 p-0 text-center font-semibold"
                      aria-label={pad(h)}
                    >
                      {i % 2 === 0 ? String(h).padStart(2, "0") : ""}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((row, d) => (
                  <tr key={d}>
                    <th
                      scope="row"
                      className="text-staff-label2 pr-1.5 text-left text-meta font-semibold whitespace-nowrap"
                    >
                      {days[d]}
                    </th>
                    {row.map((v, i) => {
                      const label = t(metric === "orders" ? "cellOrders" : "cellRevenue", {
                        ...span(d + 1, grid.hours[i] ?? 0),
                        value: show(v),
                      });
                      return (
                        <td
                          key={i}
                          title={label}
                          className={clsx("h-7 min-w-5 rounded-[4px] p-0", LEVEL[heatLevel(v, grid.max)])}
                        >
                          <span className="sr-only">{label}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </FadeScroll>
          <div aria-hidden="true" className="text-staff-label2 flex items-center gap-1.5 text-meta">
            {t("less")}
            {LEVEL.map((c) => (
              <span key={c} className={clsx("size-4 rounded-[3px]", c)} />
            ))}
            {t("more")}
          </div>
        </>
      )}

      <div className="border-staff-sep flex flex-col gap-2 border-t pt-4" data-testid="reports-table-time">
        <h3 className="m-0 text-[1.0625rem] font-bold">{tt("title")}</h3>
        {busy.table_time.avg_minutes === null ? (
          <p className="text-staff-label2 m-0 text-[1.0625rem]">{tt("none")}</p>
        ) : (
          <>
            <p className="m-0 text-[1.0625rem]">
              {tt("avg", { duration: duration(busy.table_time.avg_minutes) })}
            </p>
            <p className="text-staff-label2 m-0 text-[0.9375rem]">
              {tt("note", { count: busy.table_time.sessions })}
            </p>
            <table className="num w-full max-w-md border-collapse text-[0.9375rem]">
              <caption className="sr-only">{tt("byDay")}</caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="text-staff-label2 px-2 py-1.5 text-left text-label font-semibold"
                  >
                    {tt("colDay")}
                  </th>
                  <th
                    scope="col"
                    className="text-staff-label2 px-2 py-1.5 text-right text-label font-semibold"
                  >
                    {tt("colTime")}
                  </th>
                  <th
                    scope="col"
                    className="text-staff-label2 px-2 py-1.5 text-right text-label font-semibold"
                  >
                    {tt("colTables")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {busy.table_time.by_weekday.map((w) => (
                  <tr key={w.dow} className="border-staff-sep border-t">
                    <th scope="row" className="px-2 py-1.5 text-left font-semibold">
                      {days[w.dow - 1]}
                    </th>
                    <td className="px-2 py-1.5 text-right">{duration(w.avg_minutes)}</td>
                    <td className="px-2 py-1.5 text-right">{w.sessions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </section>
  );
}
