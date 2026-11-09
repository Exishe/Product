import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { PlanBanner } from "@/features/billing/plan-banner";
import { parseDashboard } from "@/features/dashboard/model";
import { businessDate, resolveRange } from "@/features/dashboard/range";
import { RangePicker } from "@/features/dashboard/range-picker";
import { SalesDashboard } from "@/features/dashboard/sales-dashboard";
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
  const range = resolveRange(await searchParams, today);
  const [{ data: json, error }, t, locale] = await Promise.all([
    supabase
      .schema("api")
      .rpc("sales_dashboard", { p_location_id: location.id, p_from: range.from, p_to: range.to }),
    getTranslations("dashboard"),
    getLocale() as Promise<Locale>,
  ]);
  const data = error ? null : parseDashboard(json);
  const day = (iso: string) => formatDate(new Date(`${iso}T12:00:00Z`), locale);
  const period =
    range.from === range.to && range.to === today
      ? t("soFar", { time: formatTime(new Date(), location.timezone) })
      : range.from === range.to
        ? day(range.from)
        : t("period", { from: day(range.from), to: day(range.to) });
  const empty = data && data.summary.orders === 0 && data.summary.bills === 0 && data.open_tables.count === 0;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="display-face text-display-38 leading-tight">{t("title")}</h1>
          <p className="num text-muted" data-testid="period">
            {period}
          </p>
        </div>
        <Link
          href="/admin/export"
          className="rounded-input border-line-strong inline-flex min-h-11 items-center border bg-white px-4 font-semibold"
        >
          {t("export")}
        </Link>
      </div>
      {me.role === "owner" && <PlanBanner restaurantId={me.restaurantId} locale={locale} />}
      <RangePicker range={range} today={today} />
      {!data ? (
        <p role="alert" className="rounded-sheet bg-pom-tint text-pomegranate px-4 py-3 font-semibold">
          {t("error")}
        </p>
      ) : empty ? (
        <p
          data-testid="dashboard-empty"
          className="rounded-sheet border-line-strong text-muted border border-dashed px-4 py-10 text-center text-lg"
        >
          {range.preset === "today" ? t("empty") : t("emptyRange")}
        </p>
      ) : (
        <SalesDashboard data={data} locale={locale} />
      )}
    </main>
  );
}
