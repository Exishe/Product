import { CircleAlert } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AdminPage, Notice } from "@/features/admin-ui/page";
import { parseMatrix } from "@/features/dashboard/insights-model";
import { MenuMatrix } from "@/features/dashboard/menu-matrix";
import { businessDate, parseDateInput, resolveRange } from "@/features/dashboard/range";
import { RangePicker } from "@/features/dashboard/range-picker";
import { BusyHours } from "@/features/reports/busy-hours";
import { ConversionTable } from "@/features/reports/conversion-table";
import { DigestCard } from "@/features/reports/digest-card";
import { parseBusy, parseConversion, parseDigest, parseUpsell, type Metric } from "@/features/reports/model";
import { Suggestions } from "@/features/reports/suggestions";
import { requireMember } from "@/lib/auth/require-member";
import { formatDate } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";

type Search = { range?: string; from?: string; to?: string; metric?: string };

function safe<T>(parse: (json: unknown) => T, json: unknown, error: unknown): T | null {
  if (error) return null;
  try {
    return parse(json);
  } catch {
    return null;
  }
}

// Owner reports (ADR-073): viewed but not ordered, menu engineering, busy
// hours with table time, and suggestions, for one chosen period (the last 30
// days unless the address says otherwise). Each section loads on its own, so a
// database without the migration shows notices instead of failing the page.
export default async function ReportsPage({ searchParams }: { searchParams: Promise<Search> }) {
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
  const from = parseDateInput(params.from);
  const to = parseDateInput(params.to);
  const range = resolveRange({ range: params.range ?? (from && to ? undefined : "30d"), from, to }, today);
  const metric: Metric = params.metric === "revenue" ? "revenue" : "orders";
  const args = { p_location_id: location.id, p_from: range.from, p_to: range.to };
  const api = supabase.schema("api");
  const locale = (await getLocale()) as Locale;
  const [convRes, matrixRes, busyRes, upsellRes, digestRes, t] = await Promise.all([
    api.rpc("item_conversion", args),
    api.rpc("menu_engineering", args),
    api.rpc("busy_hours", args),
    api.rpc("upsell_report", args),
    api.rpc("last_weekly_digest", { p_location_id: location.id, p_locale: locale }),
    getTranslations("reports"),
  ]);
  const nav = await getTranslations("adminNav");
  const conversion = safe(parseConversion, convRes.data, convRes.error);
  const matrix = safe(parseMatrix, matrixRes.data, matrixRes.error);
  const busy = safe(parseBusy, busyRes.data, busyRes.error);
  const upsell = safe(parseUpsell, upsellRes.data, upsellRes.error);
  // Not shown (rather than an error) on a database without the migration.
  const digest = safe(parseDigest, digestRes.data, digestRes.error);
  const day = (iso: string) => formatDate(new Date(`${iso}T12:00:00Z`), locale);

  // Links keep the chosen period; the 30-day default needs no query.
  const query = (extra: Record<string, string>) => {
    const q = new URLSearchParams(
      range.preset === "custom"
        ? { from: range.from, to: range.to }
        : range.preset === "30d"
          ? {}
          : { range: range.preset },
    );
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    const s = q.toString();
    return s ? `/admin/reports?${s}` : "/admin/reports";
  };

  const unavailable = (
    <Notice tone="alert" role="alert" icon={<CircleAlert aria-hidden="true" />}>
      <p className="m-0 font-semibold">{t("unavailable")}</p>
    </Notice>
  );

  return (
    <AdminPage
      back={{ href: "/admin/dashboard", label: nav("dashboard") }}
      title={t("title")}
      subtitle={
        <>
          <p className="m-0">{t("intro")}</p>
          <p className="num m-0" data-testid="reports-period">
            {range.from === range.to ? day(range.from) : `${day(range.from)} – ${day(range.to)}`}
          </p>
        </>
      }
      width="lg"
    >
      {digest ? <DigestCard digest={digest} /> : null}
      <RangePicker
        range={range}
        today={today}
        basePath="/admin/reports"
        defaultPreset="30d"
        hidden={metric === "revenue" ? { metric } : undefined}
      />
      {conversion ? <ConversionTable data={conversion} locale={locale} /> : unavailable}
      {matrix ? <MenuMatrix matrix={matrix} locale={locale} /> : unavailable}
      {busy ? (
        <BusyHours
          busy={busy}
          metric={metric}
          hrefFor={(m) => query(m === "revenue" ? { metric: m } : {})}
          locale={locale}
        />
      ) : (
        unavailable
      )}
      {upsell ? <Suggestions data={upsell} locale={locale} /> : unavailable}
    </AdminPage>
  );
}
