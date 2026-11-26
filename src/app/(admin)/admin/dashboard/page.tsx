import { ChartLine, CircleAlert, Download, Grid2x2, ReceiptText } from "lucide-react";
import Link from "next/link";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AdminPage, Notice } from "@/features/admin-ui/page";
import { MoreMenu } from "@/features/admin-ui/more-menu";
import { button } from "@/features/admin-ui/styles";
import { parseDashboard } from "@/features/dashboard/model";
import { businessDate, parseDateInput, resolveRange } from "@/features/dashboard/range";
import { RangePicker } from "@/features/dashboard/range-picker";
import { SalesDashboard } from "@/features/dashboard/sales-dashboard";
import { TestDataPanel } from "@/features/dashboard/test-data-panel";
import { requireMember } from "@/lib/auth/require-member";
import { formatDate, formatTime } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";

type Search = { range?: string; from?: string; to?: string };

// Numbers come from api.sales_dashboard, which checks the caller's role at
// this location; RLS-only reads would need a dozen round trips.
export default async function DashboardPage({ searchParams }: { searchParams: Promise<Search> }) {
  const me = await requireMember(["owner", "manager"]);
  const supabase = await createClient();
  const { data: location } = await supabase
    .from("locations")
    .select("id, timezone, business_day_starts")
    .eq("restaurant_id", me.restaurantId)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (!location) notFound();

  const today = businessDate(new Date(), location.timezone, location.business_day_starts);
  const params = await searchParams;
  // hy and ru type dates as dd.mm.yyyy; the range code works with ISO.
  const range = resolveRange(
    { ...params, from: parseDateInput(params.from), to: parseDateInput(params.to) },
    today,
  );
  const [{ data: json, error }, t, locale] = await Promise.all([
    supabase
      .schema("api")
      .rpc("sales_dashboard", { p_location_id: location.id, p_from: range.from, p_to: range.to }),
    getTranslations("dashboard"),
    getLocale() as Promise<Locale>,
  ]);
  const data = error ? null : parseDashboard(json);
  const day = (iso: string) => formatDate(new Date(`${iso}T12:00:00Z`), locale);
  // Before the business day starts (06:00), "today" is still yesterday's
  // date: say so, or the owner reads the date as a mistake.
  const calendarToday = businessDate(new Date(), location.timezone, "00:00");
  const period =
    range.from === range.to && range.to === today
      ? today === calendarToday
        ? t("soFar", { time: formatTime(new Date(), location.timezone) })
        : t("soFarBusinessDay", {
            date: day(today),
            start: String(location.business_day_starts ?? "").slice(0, 5),
            time: formatTime(new Date(), location.timezone),
          })
      : range.from === range.to
        ? day(range.from)
        : t("period", { from: day(range.from), to: day(range.to) });
  const empty = data && data.summary.orders === 0 && data.summary.bills === 0 && data.open_tables.count === 0;

  return (
    <AdminPage
      title={t("title")}
      subtitle={
        <p className="num m-0" data-testid="period">
          {period}
        </p>
      }
      width="lg"
      inlineActions
      actions={
        <>
          {/* Below 1280 px the three links fold into one «More» on the
              title's line, so the figures come first on a phone. */}
          <MoreMenu
            label={t("more")}
            compact
            className="xl:hidden"
            items={[
              { href: "/admin/reports", label: t("reports"), icon: <ChartLine aria-hidden="true" /> },
              { href: "/admin/dashboard/menu", label: t("menuAnalysis"), icon: <Grid2x2 aria-hidden="true" /> },
              { href: "/admin/export", label: t("export"), icon: <Download aria-hidden="true" /> },
            ]}
          />
          <Link href="/admin/reports" className={button("secondary", "max-xl:hidden")} data-testid="reports-link">
            <ChartLine aria-hidden="true" />
            {t("reports")}
          </Link>
          <Link
            href="/admin/dashboard/menu"
            className={button("secondary", "max-xl:hidden")}
            data-testid="menu-analysis-link"
          >
            <Grid2x2 aria-hidden="true" />
            {t("menuAnalysis")}
          </Link>
          <Link href="/admin/export" className={button("secondary", "max-xl:hidden")}>
            <Download aria-hidden="true" />
            {t("export")}
          </Link>
        </>
      }
    >
      <RangePicker range={range} today={today} />
      {!data ? (
        <Notice tone="alert" role="alert" icon={<CircleAlert aria-hidden="true" />}>
          <p className="m-0 font-semibold">{t("error")}</p>
        </Notice>
      ) : empty ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <ReceiptText aria-hidden="true" className="text-staff-label2 size-8" />
          <p data-testid="dashboard-empty" className="text-staff-label2 m-0 text-[1.0625rem]">
            {range.preset === "today" ? t("empty") : t("emptyRange")}
          </p>
        </div>
      ) : (
        <SalesDashboard data={data} locale={locale} />
      )}
      <NextIntlClientProvider>
        <TestDataPanel
          from={range.from}
          to={range.to}
          period={
            range.from === range.to
              ? day(range.from)
              : t("period", { from: day(range.from), to: day(range.to) })
          }
        />
      </NextIntlClientProvider>
    </AdminPage>
  );
}
