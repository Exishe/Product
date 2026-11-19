import { clsx } from "clsx";
import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { AdminPage, Notice } from "@/features/admin-ui/page";
import { SalesHeatmap } from "@/features/dashboard/heatmap";
import { parseHeatmap, parseMatrix } from "@/features/dashboard/insights-model";
import { MenuMatrix } from "@/features/dashboard/menu-matrix";
import { addDays, businessDate } from "@/features/dashboard/range";
import { requireMember } from "@/lib/auth/require-member";
import { formatDate } from "@/lib/format/date";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";

const PERIODS = [30, 90] as const;
const HEAT_WEEKS = 8;

function safe<T>(parse: (json: unknown) => T, json: unknown, error: unknown): T | null {
  if (error) return null;
  try {
    return parse(json);
  } catch {
    return null;
  }
}

// Menu analysis (ADR-057): the menu engineering matrix over the last 30 or
// 90 days, ending yesterday, and the weekday × hour heatmap.
export default async function MenuAnalysisPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
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

  const days = (await searchParams).days === "90" ? 90 : 30;
  const to = addDays(businessDate(new Date(), location.timezone, location.business_day_starts), -1);
  const from = addDays(to, -(days - 1));
  const api = supabase.schema("api");
  const [matrixRes, heatRes, t, locale] = await Promise.all([
    api.rpc("menu_engineering", { p_location_id: location.id, p_from: from, p_to: to }),
    api.rpc("sales_heatmap", { p_location_id: location.id, p_weeks: HEAT_WEEKS }),
    getTranslations("insights"),
    getLocale() as Promise<Locale>,
  ]);
  const matrix = safe(parseMatrix, matrixRes.data, matrixRes.error);
  const heat = safe(parseHeatmap, heatRes.data, heatRes.error);
  const day = (iso: string) => formatDate(new Date(`${iso}T12:00:00Z`), locale);

  return (
    <AdminPage
      title={t("title")}
      subtitle={<p className="num m-0">{t("period", { from: day(from), to: day(to) })}</p>}
      back={{ href: "/admin/dashboard", label: t("back") }}
      width="lg"
      actions={
        <nav
          aria-label={t("periodLabel")}
          className="flex rounded-full bg-white p-1 shadow-[var(--shadow-soft)]"
        >
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={p === 30 ? "/admin/dashboard/menu" : `/admin/dashboard/menu?days=${p}`}
              aria-current={p === days ? "page" : undefined}
              className={clsx(
                "inline-flex min-h-11 items-center rounded-full px-4 text-[0.9375rem] font-semibold",
                p === days ? "bg-ink text-white" : "text-ink",
              )}
            >
              {t("days", { count: p })}
            </Link>
          ))}
        </nav>
      }
    >
      {matrix ? (
        <MenuMatrix matrix={matrix} locale={locale} />
      ) : (
        <Notice tone="alert" role="alert" icon={<CircleAlert aria-hidden="true" />}>
          <p className="m-0 font-semibold">{t("error")}</p>
        </Notice>
      )}
      {heat && <SalesHeatmap map={heat} locale={locale} />}
    </AdminPage>
  );
}
